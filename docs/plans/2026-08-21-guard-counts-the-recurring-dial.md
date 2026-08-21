# Guard counts the recurring dial, not one copy

**Status:** in progress
**Issue:** #127
**Docs:** README.md "Pinning the clock" section; `docs/DESIGN.md` (fixture recurrence #62/#79)

## The defect

`main.ts` has drawn `recurringSampleEvents(fixture, anchor, view)` since #62/#79 — every fixture
copy that reaches the window. But the `drawnArcs` helper in `src/client/clock-pin.test.ts` builds
its events with `sampleEvents(...)`, a **single copy**. So the guard and README both describe the
pre-recurrence dial, and they agree with each other perfectly — which is why the count assertions
pass while README's claim is false. `CLAUDE.md`'s named failure mode: "a test can encode the same
wrong assumption as the code."

## Measured (REFERENCE = 2026-08-18 14:37, matching the suite)

`filterEventsForPeriod(recurringSampleEvents(TWELVE_HOUR_FIXTURE, fixtureAnchor(pin, now), view), …)`
against `sampleEvents(...)` for the same pins:

| `?now=` | one copy (guard today) | recurring (what the app draws) |
| --- | --- | --- |
| 03:00 | 16 | 16 |
| 06:00 | 11 | 12 |
| 09:00 | 6 | 12 |
| 12:00 | 3 | 13 |
| 15:00 | 1 | 15 |
| 17:00 | 0 | 16 |
| 19:00 | 0 | 15 |
| 21:00 | 0 | 12 |
| 23:00 | 0 | 12 |

`getRollingWindow(now)` equals `dialWindow(now, dialScale("12h"))` exactly, confirmed. The recurring
counts are **not monotonic** (dip to 12 at 09:00, rise to 16 at 17:00) and **never reach zero** — a
displaced pin lands on a full dial at any hour. Unpinned is untouched: one copy, 16 arcs, bare ids.

## The fix

1. **`drawnArcs`** counts what the renderer is handed: `recurringSampleEvents` over
   `dialWindow(now, dialScale("12h"))`, mirroring `main.ts`/`analog-clock.ts`.
2. **README** count bullet: drop "empty by the evening" and the `?now=19:00` empty-dial sentence;
   state the true property — a displaced pin lands on a full dial at any hour because the fixture
   recurs — with the true figures. Keep the one-copy arithmetic labelled as a fact about one copy.
3. **The two guards that encode the false claim** move with it: the monotonic-drop sort and the
   `last === 0` "empty by evening" become "never empty" (`min ≥ 1`), the property that would catch a
   recurrence that stopped recurring. The per-hour figure checks stay.

Out of scope: the state-description table above the counts is #104 (open decision) and its named
events remain in the states it claims; left untouched.

## Verify

`npm run build && npm run check-types && npm test`. Rendering: `?now=19:00&freeze=1` draws fifteen
arcs (README claimed empty); `?now=17:00&freeze=1` is the fullest evening pin; unpinned still 16,
bare ids.
