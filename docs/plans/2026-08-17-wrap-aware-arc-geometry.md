# Wrap-aware arc geometry

**Status:** done
**Issue:** [#33](https://github.com/BenSeymourODB/clock-face-schedule/issues/33)
**Docs:** [docs/DESIGN.md](../DESIGN.md) — "Overlapping events and concentric rings"; the
[two-time-scales brainstorm](../brainstorms/2026-08-17-two-time-scales.md)

## What this is for

Neither #25 (rolling 8-ahead/3-behind window) nor #34 (1-hour scale mode) can land until the arc
geometry can describe a window that does not start at a period-aligned 0°. This issue does not
build either feature — it generalises the geometry so a future window can be arbitrary, and proves
it with a wrapping test case. `analog-clock.ts` keeps calling the generalised functions with
period-aligned bounds, so **no rendered output changes**.

## The model

`periodStart` (midnight or noon) stays the fixed angle origin — it is the hour hand's own zero, per
#25's note that "nothing rotates, no radius moves" for a rolling window. `calculateTrueArcAngles`
computes `(t − periodStart) / 720 × 360` **unclamped and unreduced**: an event outside
`[periodStart, periodStart+720min)` gets a negative angle or one past 360° rather than being wrapped
into `[0, 360)`. That is what "keep angles unnormalised end to end" (both #33 and #25's issue text)
means, and it is why `describeArc`/`polarToCartesian` need no change — trig functions are already
periodic in any real angle.

What today hardcodes as "the period is the window" has to split into two concepts:

- **`periodStart`** — the angle origin, unchanged.
- **An explicit window `[windowStart, windowEnd)`** — the bounds events are clamped to. Today it is
  always `[periodStart, periodStart + 720min)`; that stays the *default*, so existing call sites are
  unaffected, but a caller can now pass something else.

`assignRings` sorts by raw angle, which is already monotonic with real time under this model — but
it has no way to know that a *different* angle convention (a normalised, mod-360 "physical position"
value, which is how a hand-position helper would naturally express "where's now") wasn't handed to
it instead. Rotating relative to an explicit `windowStartAngle` before sorting makes the function
correct under either convention: mod-360 arithmetic is invariant to any input already being a
multiple of 360 away from what this function expects, so the fix costs nothing for today's callers
(default `windowStartAngle = 0` is a no-op against period-aligned angles) and removes the ordering
hazard for whichever convention #25 ends up using.

## Phases

1. **`calculateTrueArcAngles` / `calculateArcAngles` / `eventsToClockEvents`** (`clock-utils.ts`) —
   add optional `windowStart` / `windowEnd` parameters, defaulting to today's period bounds. Move the
   `MIN_ARC_DEGREES` widening's hardcoded `360` / `0` clamp to the window's own end/start angle.
2. **`assignRings`** (`ring-layout.ts`) — add an optional `windowStartAngle` (default `0`) and rotate
   each candidate's angles relative to it before sorting and interval-partitioning.
3. **Tests** — regression coverage for the defaulted (unchanged) behaviour, plus the wrap cases:
   an event clamped to a window that starts before `periodStart` or ends after `periodStart+720min`;
   `MIN_ARC_DEGREES` widening against a non-360° window edge; and the ring-layout invariant the issue
   names explicitly — the same cluster depths whether or not the window's origin falls inside a
   cluster.
4. **Visual pass** — `npm run build`, serve `build/preview.html`, confirm the fixture dial still
   renders correctly (no behaviour change is the point of this issue). Full pixel screenshot
   comparison was unavailable in this run's headless environment; verified instead via DOM
   inspection of rendered arc paths/colours against the fixture, a clean console, and the fact that
   all 474 pre-existing tests pass unmodified against the new default-parameter code paths.

## Notes for a future reader

- `analog-clock.ts` was not touched. It still calls `eventsToClockEvents`/`filterEventsForPeriod`
  with period-aligned bounds; #25 is the issue that will pass it an actual rolling window.
- `assignRings`'s rotation is a defensive backstop, not something today's pipeline exercises: the
  unnormalised angle convention `calculateTrueArcAngles` produces is already monotonic with real
  time for any window, wrapping or not (verified with `node`, not just argued — see the PR
  description for the computed cases). The parameter exists so `assignRings` is also correct if a
  future caller instead hands it independently mod-360-normalised angles.
- **Caught in first-pass review:** the initial test set for `assignRings`'s rotation used only
  realistic (already window-clamped, unnormalised) inputs — which, per the point above, sort
  correctly with or without the rotation, so those tests could not tell the rebase apart from a
  no-op. Fixed by adding a test using the adversarial (independently mod-360-normalised per event)
  input the rotation actually exists for, verified to fail against a stub that ignores
  `windowStartAngle` and pass with the real implementation. `assignRings`'s docstring also gained a
  caveat: the rebase is only valid when `windowStartAngle` doesn't fall strictly inside a single
  candidate's own (already-wrapped) span.
