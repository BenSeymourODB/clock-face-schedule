# Clearing a card's width against the height it draws, not the height it may reach

**Status:** in progress — [#183](https://github.com/BenSeymourODB/clock-face-schedule/issues/183)
**Issue:** [#183](https://github.com/BenSeymourODB/clock-face-schedule/issues/183)
**Docs:** [#177](https://github.com/BenSeymourODB/clock-face-schedule/issues/177) (lever 2, the
margin, which #138's fork decides), [#141](https://github.com/BenSeymourODB/clock-face-schedule/issues/141)
(option 4, which names the circularity), [#136](https://github.com/BenSeymourODB/clock-face-schedule/issues/136)
/ [#142](https://github.com/BenSeymourODB/clock-face-schedule/pull/142) (`planOptionalLines`, the
precedent for iterating two dependent passes), [#178](https://github.com/BenSeymourODB/clock-face-schedule/issues/178)
(the durations boolean, which the corrected measurement below hands most of #183's cost table to),
[#98](https://github.com/BenSeymourODB/clock-face-schedule/issues/98) (what a wider card costs the
band)

## The mechanism

`floatingLabelGeometry` clears a card's width against the tallest it may become:

```ts
const maxCardLines = duration === undefined ? MAX_LINES : MAX_LINES + 1;
```

`faceClearanceLimit`'s docstring says why — a taller card passes closer to the face from the side,
and sizing against the maximum sidesteps a circular dependency between width and line count. The
consequence is that a card that merely *offers* a duration is charged for a fourth line whether or
not it ever draws one, and wraps its title into the narrower budget that buys.

## What is actually being spent, measured

192 pinned states on the built preview at 1920×1080, both scales, `#status` hidden — every floating
label read off the rendered DOM, with the geometry temporarily instrumented to report the line count
each card was cleared against.

| | cards |
| --- | --- |
| floating labels drawn across the sweep | 496 |
| offered a duration line | 407 |
| **cleared against more lines than they draw** | **356** |
| — over-cleared by one line | 43 |
| — over-cleared by two lines | 313 |

So the over-charge is near-universal rather than marginal: 72% of cards drawn.

## The correction #183's cost table needs, and it changes what this buys

**#183 says the guard "fails today at 21 cards a sweep". It does not fail at all**, and the same
sweep says why: every one of the 70 ellipsized cards draws **four** lines — three of title and the
duration — so each was already cleared against exactly the height it occupies. Not one ellipsized
card is over-cleared. This lever therefore recovers **zero** truncated titles, and no arrangement of
it could.

What #183's table measures is a different lever. Suppressing the duration line entirely — #178's
boolean, patched in and swept — takes the ellipsized count from **70 to 54**: **16 cards are cut by
carrying a duration at all**, which is the same quantity as #183's 21 on a slightly different basis.
That cost belongs to #178, and #183's own note that the two "overlap in the off case only" turns out
to be the wrong way round: in the *on* case this issue does not reach them either.

The remaining 54 cuts are face-bound at every occurrence (the frame limit is the looser of the two
on all 70), so they are #177 / #138's margin, not this.

## What it does buy, and what it costs

| | before | after |
| --- | --- | --- |
| cards cleared against more lines than they draw | 356 | **0** |
| card-instances whose text re-wraps | — | 33 |
| — of those, dropping a line entirely | — | **10** |
| cards whose wrap gets worse | — | 0 |
| widest single card gain | — | +52.6 u |
| ellipsized cards | 70 | 70 |

Two cards on one dial each: `Spelling Test` at `?now=02:00&freeze=1&scale=1h` and `Breakfast Club`
at `?now=05:45&freeze=1` both stop splitting a two-word title across two lines, and their cards lose
38 px of height at 1920×1080.

The cost is #98's, and it is small but real — a centred card grows inward as well as outward:

| | before | after |
| --- | --- | --- |
| cards whose box reaches inside the band's outer edge | 453 | 453 |
| deepest intrusion into the band | 87.56 u | **87.56 u** |
| mean intrusion, over cards that intrude | 50.38 u | 50.91 u |
| cards reaching deeper than before | — | 32 (worst +22.80 u) |
| closest any card comes to the face | 0.043 u | **0.043 u** |

The worst case moves on neither measure. The card that sets the face clearance is a four-line card
and this change does not touch it.

## The circularity, and why the loop is safe

`fitLabelToClearedWidth` takes the width limit as a *function of line count* and walks down from the
safe upper bound the current code uses:

- **It terminates** whatever the limit function does: `cleared` strictly decreases each step and is
  a positive integer, so at most `maxLines` steps. Asserted, not argued.
- **Every layout returned was cleared against at least the height it draws.** With a monotone limit
  — taller card, no more width — a shorter card is granted more width and more width wraps to no
  more lines, so each step is safe by construction. A step that would break that is refused and the
  last safe layout stands, which is a spec rather than a comment.

A two-pass measure-then-place was priced, per #183's ask, and is the same thing: the first pass *is*
the safe upper bound, and one pass is not enough whenever the widened card wraps to fewer lines
again. The loop is that generalised, and on the fixture it never runs past three steps.

## Tests

- `fit-label.test.ts` — the fixed point, the starting height, termination, and the refused unsafe
  step, against a synthetic monotone limit and a deliberately perverse one.
- `floating-label.test.ts` — `limits.clearedLines === lines.length` at every 15°, with and without a
  duration on offer; the concrete `Spelling Test` regression at two o'clock with the face figures
  (187.0 against the four-line 155.9); and the control that a card genuinely filling three lines is
  still cleared against four.

The guard is stated as the equality rather than as #183's ellipsis phrasing, and deliberately: an
ellipsis-only guard was green before this change, so it would not have caught the defect.

## Not done here

- Growing a card into the margin — #177's lever 2, blocked on #138's locus fork.
- Whether a duration is drawn at all — #178, which the measurement above hands the 16 cards.
- The 54 face-bound cuts that remain, which are the margin's.
