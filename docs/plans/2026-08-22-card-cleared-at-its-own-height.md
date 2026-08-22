# Clearing a card's width against the height it draws, not the height it may reach

**Status:** done — shipped in [#184](https://github.com/BenSeymourODB/clock-face-schedule/pull/184)
**Issue:** [#183](https://github.com/BenSeymourODB/clock-face-schedule/issues/183)
**Docs:** [#177](https://github.com/BenSeymourODB/clock-face-schedule/issues/177) (lever 2, the
margin, which #138's fork decides), [#141](https://github.com/BenSeymourODB/clock-face-schedule/issues/141)
(option 4, which names the circularity), [#136](https://github.com/BenSeymourODB/clock-face-schedule/issues/136)
/ [#142](https://github.com/BenSeymourODB/clock-face-schedule/pull/142) (`planOptionalLines`, the
precedent for iterating two dependent passes), [#178](https://github.com/BenSeymourODB/clock-face-schedule/issues/178)
(the durations boolean, which the corrected measurement below hands most of #183's cost table to),
[#98](https://github.com/BenSeymourODB/clock-face-schedule/issues/98) (what a wider card costs the
band — **the open cost of this change**)

## The mechanism

`floatingLabelGeometry` clears a card's width against the tallest it may become:

```ts
const maxCardLines = duration === undefined ? MAX_LINES : MAX_LINES + 1;
```

`faceClearanceLimit`'s docstring says why — a taller card passes closer to the face from the side,
and sizing against the maximum sidesteps a circular dependency between width and line count. The
consequence is that a card that merely *offers* a duration is charged for a fourth line whether or
not it ever draws one, and wraps its title into the narrower budget that buys.

## What is being over-charged, measured

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

## The correction #183's cost table needs

**#183 says the guard "fails today at 21 cards a sweep". It does not fail at all**, and the same
sweep says why: every one of the 70 ellipsized cards draws **four** lines — three of title and the
duration — so each was already cleared against exactly the height it occupies. Not one ellipsized
card is over-cleared. This lever recovers **zero** truncated titles.

What #183's table measures is a different lever. Suppressing the duration line entirely — #178's
boolean, patched in and swept — takes the ellipsized count from **70 to 54**: **16 cards are cut by
carrying a duration at all**, the same quantity as #183's 21 on a slightly different basis. That cost
belongs to #178. The remaining 54 cuts are face-bound at every occurrence (the frame limit is the
looser of the two on all 70), so they are #177 / #138's margin.

## A search, not a walk — and the first attempt was wrong

The first implementation walked from the safe upper bound straight to the line count the card turned
out to draw, on the reasoning that a wider budget can only wrap to fewer lines.

**That reasoning is false, and `pack-lines.ts` is where.** A word too long for the budget is
ellipsized onto a line of its own rather than hyphenated, so a *narrower* budget can produce *fewer*
lines. `Extracurricular Activities` with a duration, at 2 o'clock on a 600-unit dial:

| clearance | width | layout |
| --- | --- | --- |
| 4 lines (the starting bound) | 151.2 | 2 lines — `Extracurri…` / `1 hr 10`, the long word cut |
| **3 lines** | **184.7** | **3 lines — `Extracurricular` / `Activities` / `1 hr 10`, whole** |
| 2 lines | 227.4 | 3 lines — inadmissible |

The walk jumped 4 → 2, found 2 inadmissible, and gave up on the starting layout: the cut title, with
two lines of its own clearance unspent. **That is the defect #183 exists to remove, shipping inside
the fix for it.** Three is admissible and only a linear scan finds it.

So the shipped version scans every height and takes the smallest admissible one. A height is
**admissible** when the card laid out at its width draws no more lines than the height allows. No
monotonicity is assumed anywhere. What holds regardless:

- **It terminates** — a counted loop of `maxLines` steps, whatever the limit function does.
- **The result is admissible** — only admissible candidates are adopted and the starting bound is one.
- **No smaller admissible height exists** — every one below was tried, which is what a spec can
  assert. The fixed-point *equality* is not: a card whose only admissible height is the starting
  bound legitimately draws fewer lines than it cleared, and that is 2 o'clock in the table above.

The scan is worth three times the walk on the fixture: 99 cards re-wrap against 33, and 97 drop a
line against 10.

## What it buys

| | main | shipped |
| --- | --- | --- |
| cards cleared against more lines than they draw | 356 | **0** |
| card-instances whose text re-wraps | — | **99** |
| — dropping a line entirely | — | **97** |
| cards whose wrap gets worse | — | **0** |
| cards that get narrower | — | **0** |
| widest single card gain | — | **+147.2 u** |
| ellipsized cards | 70 | 70 |

`Assembly Notes and Reminders` fits on one line at `?now=04:00&freeze=1&scale=1h` where it took
three; `Spelling Test` and `Breakfast Club` stop splitting a two-word title.

## What it costs, and this is the open question

A centred card grows inward as well as outward, so a wider card covers more of the band. That is #98,
and this makes it **broader while making its worst case better**:

| | main | shipped |
| --- | --- | --- |
| arc text elements swept (titles, durations, emoji) | 519 | 519 |
| **covered ≥2% by a card** | **72** | **87** |
| worst single element, fraction covered | **1.00** (an emoji covered outright) | **0.876** |
| cards reaching inside the band's outer edge | 453 | 453 |
| deepest intrusion into the band | 87.56 u | **87.56 u** |
| cards reaching deeper than before | — | 98 (worst +24.24 u) |
| closest any card comes to the face | 0.043 u | **0.043 u** |
| worst vertical reach past the dial box, fixture | 49.08 u | **49.08 u** |

Fifteen more pieces of arc text are touched. Found by rendering rather than by measuring: at
`?now=04:00&freeze=1&scale=1h` the one-line `Assembly Notes and Reminders` card covers the 🍽️ on the
adjacent Break arc, which is #98's defect verbatim.

**#183 named this in advance** — *"#98 — why a wider card is not free, and the ordering that puts
another event's identity first"* — and it is the one part of this that is a judgement rather than a
measurement. It is not decided here. Both faces of it are in the table so it can be settled in one
sitting.

## The existing guard this moved, and why it is not a weakening

`analog-clock.test.ts` asserted that granting the margin never increases vertical reach, reasoning
that *"a wider card is a shorter one — it needs fewer lines for the same title — so this cannot
regress"*, and saying explicitly that it was asserted rather than reasoned because the frame has no
clamp behind it. **The assertion earned its keep by catching the reasoning.** A wider card is
shorter, but it also overlaps more neighbours horizontally, so displacement spreads the stack further
vertically: on that sweep of 22 identical over-long titles, granted reach went 11.3 → 42.9 units.

Retired in favour of the bound that actually exists and that the old test never asserted — every
card's centre stays inside the clamp band, the 10% of dial height `Styles.html` sizes the frame from
— with both reach figures pinned beside it so movement in either is still caught. The proxy stopped
tracking what it was named for: fewer cards reach at all (three against six), and the fixture does
not move (49.08 either way, already further than this sweep reaches).

`still drops a duration displacement cannot make room for` moved from two yielders to one, the same
way #118 moved it from one to two, and for the same reason: a card's width changed. The property is
untouched — the last card clockwise still gives up its duration and keeps its whole title.

## Tests

- `fit-label.test.ts` — the smallest-admissible-height property (safety *and* that nothing below was
  skipped), the starting height, termination, the real non-monotone case from `pack-lines`, and the
  case where the starting bound is the only admissible height.
- `floating-label.test.ts` — the card never outgrows its clearance, at every 15° across three titles
  with and without a duration; `Extracurricular Activities` kept whole at 45°; the same title cut at
  60° where nothing smaller is admissible; and the `Spelling Test` / `Assembly Notes` pair with their
  face figures.

All three new specs fail on the walk and pass on the scan.

## Not done here

- Growing a card into the margin — #177's lever 2, blocked on #138's locus fork.
- Whether a duration is drawn at all — #178, which the measurement above hands the 16 cards.
- Guarding a card against covering another arc's identity — #98, which this makes broader.
