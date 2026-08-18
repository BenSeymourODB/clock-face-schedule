# Rolling look-ahead window

**Status:** done
**Issue:** [#25](https://github.com/BenSeymourODB/clock-face-schedule/issues/25)
**Docs:** [docs/DESIGN.md](../DESIGN.md) — ADR 0005 (browser-local time), "Overlapping events and
concentric rings"; [wrap-aware arc geometry plan](2026-08-17-wrap-aware-arc-geometry.md), which this
issue is the payoff for.

## What this is for

Replace the dial's fixed 12-hour period (midnight-to-noon or noon-to-midnight) with a rolling
window: **3 hours behind the hour hand, 8 hours ahead**, so the look-ahead never shrinks to nothing
near the end of a period. `periodStart` (midnight/noon) stays the angle origin — nothing rotates, no
radius moves — only the window events are clamped and filtered to changes shape and moves
continuously.

The wrap-aware geometry issue (#33, done) generalised every geometry function to take an arbitrary
`windowStart`/`windowEnd` alongside the fixed `periodStart` origin, specifically so this issue would
not need to touch `calculateTrueArcAngles`, `calculateArcAngles`, `describeArc`, or `assignRings`.
This issue is almost entirely call-site work: compute the rolling bounds, pass them through, change
the re-render cadence from "twice a day" to "about once a minute", fix a data-fetch gap the rolling
window's lookbehind opens, and add the window-gap visual treatment the issue's own text proposes.

## Decisions carried over from the issue body

| | |
| --- | --- |
| Look-ahead, clockwise of the hour hand | 8 h = 240° |
| Elapsed context, counter-clockwise | 3 h = 90° |
| Drawn band | 11 h = 330° |
| Gap (undrawn, rotates with the day) | 1 h = 30°, clockwise from the trailing edge to the leading edge |

- **Elapsed-vs-live distinction**: already answered and shipped by #26 (outline instead of fill).
  Nothing new needed here.
- **Gap-vs-free-time distinction**: the issue proposes "a faint full-ring track behind the arcs,
  interrupted across the gap" but flags it as needing a render, not an argument. Built and judged
  against the fixture in the visual pass (phase 4) rather than accepted on the strength of the
  proposal alone.

## What has to change

1. **`getRollingWindow(time)`** (`clock-utils.ts`) — pure function returning `{ windowStart,
   windowEnd }` = `[time − 3h, time + 8h)`. `periodStart` (`getPeriodStart(time)`) stays computed
   separately and passed as the angle origin, unchanged.
2. **`analog-clock.ts`'s `renderEvents`** — filter and resolve against the rolling window instead of
   `getPeriodBounds`. `filterEventsForPeriod` and `eventsToClockEvents` already take arbitrary
   bounds; no change needed to either.
3. **Re-render cadence** — the window moves continuously, so "rebuild only on period rollover" no
   longer describes anything real (a 12-hour period never rolls over on its own footing anymore).
   Rebuild once per calendar minute instead — matching the issue's "must be rebuilt about once a
   minute" — by tracking the last rendered minute and comparing on each `setTime`. The existing
   elapsed-count rebuild trigger becomes redundant once minute-granularity rebuilds cover it, but is
   cheap to keep as a defensive backstop in case a tick is ever skipped.
4. **The data-fetch gap the lookbehind opens, without regressing #37** — `getFetchWindow` anchors
   its start to `getDayStart(time)` (today's midnight) *because* #36 (the agenda panel epic)'s
   first ready sub-issue is fetching the whole calendar day, independent of whatever the dial
   itself draws. That guarantee has to survive this issue. But a rolling window's lookbehind
   (`time − 3h`) can reach *before* today's midnight — any time in the first three hours after
   midnight — which `getDayStart` alone would still clip, silently excluding events the dial's own
   window wants. Fix: `getFetchWindow` takes the **earlier** of `getDayStart(time)` and the rolling
   window's own (margin-widened) start, and the **later** of today's needs and the rolling window's
   own (margin-widened) end — covering both callers rather than picking one. (Caught by the user
   mid-implementation, not by a test — the existing test suite had no case exercising #36's future
   need at all, which is itself worth noting for a future reader.)
5. **The window-gap track** (`window-track.ts`) — a thin, faint ring using `var(--border)` (an
   existing token, not a new colour), drawn first in the arcs layer so events paint over it wherever
   one exists. No separate "gap" geometry was needed in the end: the track is exactly one
   `describeArc` call from `windowStartAngle` to `windowEndAngle` (via the new shared `angleForTime`
   helper), and the 30° gap is simply wherever that path does not reach — its absence *is* the gap,
   not a second thing to compute or draw.

## Phases (as built)

1. **Shared geometry** — `getRollingWindow` and `angleForTime` in `clock-utils.ts` (the latter
   extracted from `calculateTrueArcAngles`'s own angle math, which now calls it, removing a
   duplicated formula). Unit tests: window bounds at several times of day, the look-behind reaching
   into the previous day, and `angleForTime` agreeing mod-360 for any choice of `periodStart`.
2. **Wire the client** — `analog-clock.ts` renders against `getRollingWindow` instead of
   `getPeriodBounds`; cadence changed from "on period rollover" to "once a calendar minute" (tracked
   via a `minuteKey` change detector), with the existing elapsed-count check kept alongside it as a
   backstop for a state change that lands inside the same minute. `getFetchWindow`/`main.ts` updated
   — see point 4 below, which is where the plan's own execution diverged from what was written here
   first.
3. **The gap track** — `window-track.ts`, rendered first (behind arcs) in `analog-clock.ts`.
4. **Visual pass** — `npm run build`, then `build/preview.html` opened directly as a `file://` URL in
   the browser pane (this session's dev-server tool refuses to launch from a scheduled-task run with
   nobody present to approve it — a `file://` open sidesteps that without needing a server at all).
   Screenshotted and looked. **First look found a real gap in the fixture, not in the geometry**: the
   demo's events packed almost the entire window solid, leaving no stretch that was empty *and
   in-window* — exactly the one case the track exists to distinguish from the true gap — so its own
   purpose was invisible in the render. Fixed by shortening "Lunch" (`sample-events.ts`) by 40
   minutes, opening an 80-minute empty-but-in-window stretch before "Reading and Snacks". Re-rendered
   and confirmed: a faint hairline now bridges that stretch, and the true 30° gap (between the
   look-behind's last event and the look-ahead cluster) shows nothing at all, as intended.

## What changed from the plan while building

- **The fetch-window fix wasn't "switch anchoring", it was "cover both anchors."** The user caught
  this mid-implementation: `getFetchWindow`'s day-start anchor exists *for #36* (the agenda panel
  epic's first ready sub-issue is fetching the whole calendar day), not only to survive the old
  period's rollover. Replacing it with a pure rolling-window anchor would have quietly narrowed the
  fetch back below what #37 already guaranteed. Fixed: `getFetchWindow` now takes the earlier of
  `getDayStart(time)` and the rolling window's own (margin-widened) start, and the later of the
  rolling window's own (margin-widened) end — both callers covered, neither regressed. `getDayStart`
  stays exported.
- **No separate gap-angle helper was needed** (see point 5 above) — simpler than the plan assumed.
- **The demo fixture needed a real edit, not just a re-anchor.** Anchoring `sampleEvents` to
  `windowStart` instead of `periodStart` was necessary but insufficient: the fixture's total span
  (880 minutes) exceeded the new 660-minute window, and "y" (meant to cross the trailing edge)
  needed its start moved 15 minutes earlier to still cross a window that ends 60 minutes sooner than
  the old period did. The window-track legibility gap above was a second, independent finding from
  actually rendering it — the kind of defect this repo's whole "render before you believe it works"
  discipline exists to catch.

## Notes for a future reader

- `getPeriodBounds`/`getPeriodStart` are not removed — `periodStart` remains the angle origin, and
  `main.ts`'s `?check=1` diagnostics still report "events in this period" against the fixed period,
  which is a reasonable diagnostic question independent of what the dial draws.
- The demo fixture (`sample-events.ts`) re-anchors at load time only; it does not track the rolling
  window afterward, so it drifts out of view on a display left on `?demo=1` for hours. Filed as #62.
- Deferred, filed separately if not covered here: #34 (1-hour scale mode, explicitly depends on this
  issue), #24 (two-ring scale, set aside pending this).
