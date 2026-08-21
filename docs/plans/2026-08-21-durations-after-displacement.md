# Offering a declined duration line back, once displacement has made room

**Status:** in progress — the fixed point outstanding as [#136](https://github.com/BenSeymourODB/clock-face-schedule/issues/136)
**Issue:** [#136](https://github.com/BenSeymourODB/clock-face-schedule/issues/136)
**Docs:** [#134](https://github.com/BenSeymourODB/clock-face-schedule/pull/134) (the displacement
pass this cooperates with), [#68](https://github.com/BenSeymourODB/clock-face-schedule/issues/68) /
[#35](https://github.com/BenSeymourODB/clock-face-schedule/issues/35) (the duration line and the
pass that declines it), [#30](https://github.com/BenSeymourODB/clock-face-schedule/issues/30) item 2
(placement), [#121](https://github.com/BenSeymourODB/clock-face-schedule/issues/121) (the frame the
band is sized from)

## The gap

`analogClock` runs two passes over floating-label cards, and they do not cooperate:

1. **#68's duration decision** declines a card's optional duration line wherever the taller box
   would land on another card. It compares against **un-displaced** rects, because that is all
   there was when it was written.
2. **#134's displacement** then moves whatever still overlaps apart.

A duration declined in step 1 to avoid a collision that step 2 resolves anyway is event information
given up for nothing.

## Measured on `main`, before any change

`build/preview.html`, Chromium at 1920×1080, rects read off the rendered cards:

| pin | cards | carrying a duration | overlaps |
| --- | --- | --- | --- |
| unpinned | 5 | 5 | 0 |
| `?now=11:00&freeze=1` | 5 | **2** | 0 |
| `?now=13:00&freeze=1` | 4 | **2** | 0 |

Swept over every half hour on both scales, 22 pins decline at least one duration line, and
`?now=19:00&freeze=1` declines **four of six**.

## Why a fixed point rather than a reorder

Swapping the two passes does not work: displacement needs the rects, the rects need the line count,
and the line count is what the duration pass decides. Either order leaves one pass reasoning about
geometry the other is about to change. Iterating settles it:

1. displace at the sizes committed so far;
2. offer each still-declined duration against the displaced layout;
3. re-displace, since an accepted duration grows its card about its own centre and reaches ~12.27
   units *upward* as well as down (the growth-about-the-centre correction on #30);
4. repeat until a round accepts nothing.

Each round strictly increases the number of accepted durations, which is bounded by the card count,
so it terminates. #134's own component pass has the same shape and the same argument.

## What an offer is accepted against

Two conditions, and the first is the load-bearing one:

- **No new overlapping pair.** Not "no overlaps" — a pile that displacement cannot separate is
  #30's combined-label case and is not this pass's to fix, so the test is that the set of colliding
  pairs after the offer is a **subset** of the set before it. A duration that resolves nothing and
  breaks nothing is still accepted; one that trades one collision for another is not.
- **Every card stays wholly inside the clamp band.** `displaceVertically` already refuses a
  component it cannot place inside the band, but a card that overlaps nothing is never displaced and
  so is never band-checked — and a grown card at its natural position is what the page's frame is
  sized against (#121). Checking the whole trial layout keeps that envelope true by construction
  rather than by the coincidence that the fixture does not currently reach it.

#68's own constraint carries over unchanged and generalises: a candidate is compared against its
neighbours **at the sizes committed so far**, so accepting a duration can never force one on
somebody else. Undecided neighbours are still at their title-only size, which is what they will be
at worst.

**Offers are made clockwise**, in the order `analogClock` already sorts overflowing labels. The
order decides the outcome when two candidates compete for the same room, so it is stated rather than
fallen into, and it matches the order a reader scans the dial.

## Shape of the change

- **New pure module** `src/shared/clock/grow-labels.ts`, exporting `planOptionalLines(offers,
  centreY, band)` → `{ accepted: boolean[], nudges: number[] }`. `offers[i]` is `{ base, grown }`,
  two rects the caller has already laid out; `grown` is `null` for a card with nothing to offer.
  Node-testable, no DOM, no host types — the module knows nothing about durations beyond the fact
  that one rect is optional.
- **`analog-clock.ts`** replaces the #68 loop and the single `displaceVertically` call with one
  `planOptionalLines` call, and keeps everything else — the clockwise sort, `floatingLabelGeometry`,
  `verticalNudge` — as it is.

`displaceVertically` is unchanged. It is called once per trial rather than once per render, which is
`O(cards²)` calls of an `O(cards²)` pass on a list that peaks at six.

## Expected gain, stated before measuring

#136 is explicit that this "hands back durations away from the vertical extremes and changes little
at them", and #134 measured **1.5 units of slack** between the fixture's resolved pile at six
o'clock and the clamp band. A duration line is 24.53 units at the dial's 17.52-unit label font, so
the bottom pile at `11:00` and `13:00` cannot take one and the honest expectation there is no
change. The pins to watch for a gain are the ones whose declined cards are not in that pile.

## Not in scope

- **The combined list-label** (#30 phase 2). A merged card's entries are capped at roughly one line
  each by the connector's own ceiling where the frame binds, so a duration per entry is very likely
  unaffordable there; deciding this pass first keeps that from being discovered twice.
- **Anything that moves a card horizontally, or off the locus.** Vertical displacement is #30's
  decided mechanism and this pass only chooses sizes.
