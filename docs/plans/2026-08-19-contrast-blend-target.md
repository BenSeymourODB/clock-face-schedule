# Pick the blend target by comparing the extremes, not by thresholding luminance

**Status:** in review
**Issue:** #95
**Docs:** #66 (`adjustCompositeForContrast`, where the corrected rule already lives), #27 (the
function's origin and only caller), #81 (the light scheme, where this stops being latent)

## What this changes

One line in `adjustForContrast`. The blend target was chosen as
`backgroundLuminance < 0.5 ? WHITE : BLACK`; it is now `readableTextColor(background)`, which
compares the two candidate ratios instead.

Nothing on the dial moves. Both grounds the function is used against today are far below the
crossover, so the two rules agree and every rendered colour is unchanged — verified below.

## Why 0.5 is the wrong constant

Black and white change places where they contrast equally with the ground:

```
(L + 0.05) / 0.05 = 1.05 / (L + 0.05)
        (L + 0.05)² = 1.05 × 0.05
                  L = √0.0525 − 0.05 ≈ 0.179129
```

So for every ground with luminance in **(0.1791, 0.5)** the midpoint test blends toward the extreme
that is *nearer*, not the one that is further. `readableTextColor` five lines up already finds this
constant by comparison rather than by thresholding, which is why reusing it — rather than restating
the comparison — is the fix: the rule now has one definition instead of two that disagree.

## Measured, at this function's own semantics

The issue's table is composited at the arcs' `fill-opacity` of 0.85, because it was found while
building #66 and `adjustCompositeForContrast` takes an alpha. `adjustForContrast` does not, so the
figures that apply here are the uncomposited ones — and they are worse:

| ground | luminance | white reaches | black reaches | midpoint rule picked |
| --- | --- | --- | --- | --- |
| `#767676` | 0.1812 | 4.54 | **4.62** | white |
| `#808080` | 0.2159 | 3.95 | **5.32** | white |
| `#949494` | 0.2961 | 3.03 | **6.92** | white |
| `#b0b0b0` | 0.4342 | 2.17 | **9.68** | white |
| `#bbbbbb` | 0.4969 | 1.92 | **10.94** | white |

`#bbbbbb` is the worst grey on the ramp: the midpoint rule returns white at **1.92:1** where black
reaches **10.94:1**, a gap of 9.02. The guard below the target choice is what makes this visible
rather than merely suboptimal — it returns that white and the comment claims it is the best available
answer, which is wrong on the same grounds the line is.

Over 200,000 pseudorandom `(colour, ground, floor)` triples where *some* extreme reaches the floor:

| rule | missed a reachable floor |
| --- | --- |
| midpoint threshold | **40,358** (20.2%) |
| compare the extremes | **0** |

## What the tests pin

The spec that missed this asserted "darkens toward black on a light ground instead" against
`#ffffff` — the trivially-correct end of the range, and an assertion encoding the same rule the code
held. The replacement pins the independent property instead: **whenever some variant can clear the
floor, the returned one does**, exercised on grounds inside the broken interval and over a sweep of
random triples. All seven new assertions fail against the old line and pass against the new one.

## Verification

The change is latent, so the verification is that the picture does not move. Built before and after,
rendered `build/preview.html` at three states, and compared:

| state | rendered SVG colours | screenshot |
| --- | --- | --- |
| unpinned | 57, identical | differs only by the live second hand |
| `?now=04:15&freeze=1` (mid-drain) | 66, identical | **pixel-identical** |
| `?now=01:30&freeze=1` (three-deep cluster mid-drain) | 54, identical | **pixel-identical** |

## Not done here

- **The painted comparison.** `adjustCompositeForContrast` (#66, unmerged) cannot use
  `readableTextColor`: contrast is not linear in luminance, so on a saturated ground the extreme that
  wins at alpha 1 can lose at 0.25. `adjustForContrast` has no alpha, so the simple comparison is
  right here — but if the two functions are ever merged, the painted comparison is the general one.
- **A mid-tone ground on the dial.** There is none until #81 adds one; this lands ahead of it so the
  light scheme does not inherit the trap.
