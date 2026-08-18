# Fetch the whole day, not whatever the 12-hour period anchors to

**Status:** in progress
**Issue:** [#37](https://github.com/BenSeymourODB/clock-face-schedule/issues/37)
**Docs:** [../brainstorms/2026-08-17-agenda-panel.md](../brainstorms/2026-08-17-agenda-panel.md), [../DESIGN.md](../DESIGN.md)

## The bug

`main.ts`'s `fetchWindow` requests `[periodStart, periodStart + 24h)`. `periodStart` is midnight
*or* noon (`getPeriodStart`), so in the afternoon the window runs noon → noon tomorrow and the
current morning is never fetched. Nothing on the dial notices today, because the dial only ever
draws its own current 12-hour period — but any feature wanting "today" (the agenda panel, #36)
would silently omit everything before lunch.

## Fix

Anchor the window's **start** at the calendar day's start (midnight) instead of the period's
start, while keeping the **end** exactly as before (`periodStart + WINDOW_HOURS`). `dayStart` is
always `<= periodStart`, so this only widens the window earlier — it cannot regress the existing
look-ahead margin that keeps a period rollover from finding an empty cache.

|  | Old window | New window |
| --- | --- | --- |
| Morning (periodStart = midnight = dayStart) | midnight → midnight tomorrow | unchanged |
| Afternoon (periodStart = noon) | noon → noon tomorrow (misses this morning) | midnight today → noon tomorrow |

The window-computation logic is extracted to a pure `getFetchWindow` helper in
`shared/clock/clock-utils.ts` so it is unit-testable in node; `main.ts` itself has no test file
and stays a thin caller.

## Out of scope, deferred to the agenda-panel epic

The issue also asks to "render all-day events in the panel." There is no panel yet — #38 (shared
card component) is blocked on #29's styling decision, and #39 (panel layout) is its own open
allocation decision. All-day events already survive the fetch unfiltered (`isAllDay: true` on
`ClockEventInput`, dropped only by `filterEventsForPeriod` when building the dial's arcs), so the
data is already available to whatever consumes it later — no server or fetch change is needed for
that half. Building UI for them now, ahead of #38/#39, would mean inventing a card shape the panel
epic already has open questions about. Left to land as part of #36's existing sub-issues.

## Tests

- `getFetchWindow`: morning case (no change from old behaviour), afternoon case (extends backward
  to cover this morning, keeps the same forward margin), and an invariant that `windowStart` is
  never after `now`.
