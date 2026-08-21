# One blend search, and a tie-break that agrees with itself

**Status:** in review
**Issue:** [#97](https://github.com/BenSeymourODB/clock-face-schedule/issues/97)
**Docs:** #94 / #66 (where `adjustCompositeForContrast` comes from), #96 / #95 (where
`adjustForContrast`'s target rule was corrected), #81 (the light scheme, the reason either
function's target rule matters)

## What this changes

`src/shared/clock/contrast.ts` holds two 24-step binary blend searches. After this,
`adjustForContrast(color, background, minRatio)` is one line —
`adjustCompositeForContrast(color, background, 1, minRatio)` — and the second search is gone.

No rendered output moves. Both exported names survive, both signatures survive, and every call site
is untouched.

## Why they are the same function

At `alpha` of 1, `compositeOver(background, candidate, 1)` returns `candidate` byte-for-byte — the
per-channel blend is `round(bg × 0 + fg × 1)`. So `adjustCompositeForContrast`'s `painted` predicate
collapses to `contrastRatio(candidate, background)`, which is `adjustForContrast`'s predicate
exactly. Guard, search and fallback are already line-for-line identical.

Measured rather than argued: **200,000 random `(colour, ground, floor)` triples** with floors
uniform on [1, 21], comparing `adjustForContrast(c, bg, r)` against
`adjustCompositeForContrast(c, bg, 1, r)` on `main` — **zero disagreements**. The four
non-numeric paths agree too: unparseable colour, unparseable ground, three-digit hex, and the
`DEFAULT_MIN_CONTRAST` default.

## The one place they were not identical, and why it cannot be seen

The tie-break, and only the tie-break:

| | `adjustForContrast` (before) | `adjustCompositeForContrast` |
| --- | --- | --- |
| target | `readableTextColor(background)` | the extreme reaching further **as painted** |
| tie goes to | `BLACK` | `WHITE` |

#97 records that no exact tie exists among the **256 greys**. That is a weaker claim than the one
needed, because a background is an arbitrary hex, not a grey. Checked exhaustively over all
**16,777,216** 24-bit colours instead:

```
crossover luminance   L* = √0.0525 − 0.05 = 0.179128784747792
exact ties                0
nearest colour            #cf0dcc   (L = 0.179128790747105)
  black reaches           4.582575814940
  white reaches           4.582575574970
  apart by                2.3997e-7
```

So the tie is unreachable for **every** parseable background, not merely for the greys, and
unifying on `adjustCompositeForContrast`'s rule changes no output that any caller can produce. The
nearest miss is a magenta, not a grey — which is the reason the grey-only check was not enough
evidence on its own.

Both rules pick the true maximum away from a tie, so `#cf0dcc` itself is *not* a disagreement:
both return `BLACK`, at every floor around 4.5825758.

Note that `readableTextColor` keeps its own `BLACK`-on-tie rule, and is now the only holder of it.
That is not a new disagreement — it is the same one, reduced from two functions to one, and equally
unreachable.

## The stale paragraph #96 left behind

`adjustCompositeForContrast`'s docstring ends by describing `adjustForContrast` as it was before
#96:

> **Thresholding luminance at 0.5**, which `adjustForContrast` does. […] `adjustForContrast`
> keeps the 0.5 threshold and its latent bug; it is not corrected here because its one caller
> measures against a ground far below the crossover.

Both halves are false on `main` today: #96 replaced that threshold with `readableTextColor`. The
0.5 rule is still worth recording as a rejected approach — it is the first thing a later coder
would reach for — but it must stop being attributed to a function that no longer does it.

## Where each half of the reasoning lands

#97 is explicit that both docstrings carry load-bearing reasoning and a merge needs both halves.
With one search left, there is one place for the target rule to be explained and it is the search:

- **`adjustCompositeForContrast`** becomes the single authority on how the target is chosen, holding
  both rejected approaches — the 0.5 threshold (#95's crossover algebra, and the `#bbbbbb` case
  where white returns 1.92:1 while black reaches 10.94:1) *and* `readableTextColor` at full strength
  (contrast is not linear in luminance, so the winner at 1.0 can lose at 0.25; over 20,000 random
  cases that substitution missed a reachable floor 122 times).
- **`adjustForContrast`** keeps its own subject — the outlined arc of #26, where a palette colour
  becomes a foreground against a ground it does not control — and says plainly that it is the
  full-strength case of the function below, pointing there for the target rule rather than
  restating it.

## Tests

Three additions; nothing existing weakens, and the whole `adjustForContrast` block stays as the
regression guard on the wrapper.

1. **The wrapper passes `alpha` of 1 and nothing else.** A pinned literal —
   `adjustForContrast("#1F2937", BAND)` is `#7b8189`, the elapsed outline's colour that
   `event-arc.test.ts` already depends on — plus the existing palette-wide equivalence spec, which
   is now true by construction and pins that no second argument drifted.
2. **The tie-break rule, at an `alpha` where a tie is reachable.** At `alpha` 0 both composites
   *are* the ground, both ratios are exactly 1, and the target is `WHITE`. This is the only
   reachable tie in the function and it is what the merged rule now says.
3. **The tie is unreachable at `alpha` 1**, exhaustively over all 16,777,216 colours: zero ties,
   nearest `#cf0dcc`. The loop runs in ~0.1 s because each channel's luminance contribution is
   taken from `relativeLuminance` once, over 768 calls, and summed in the module's own order — so
   it is the module's arithmetic being swept, not a re-implementation of it.

The third is the assertion that makes the change safe, and it is the one that sampling could not
have made: 200,000 random triples never landed on a tie either, which is consistent with there
being none *and* with there being a few million.

## Considered and not done

**Factoring the `[0, 1]` bisection loop out of `adjustCompositeForContrast` and
`textFlipCoverage`.** They share the loop's shape and nothing else: one finds the least blend
fraction clearing a floor, the other the coverage at which two text colours change places. The
docstrings explaining why each is monotonic are different and both load-bearing, and a shared
`hi`/`lo` helper would have to be named for one meaning or the other. Two four-line loops with
distinct predicates is the cheaper reading.
