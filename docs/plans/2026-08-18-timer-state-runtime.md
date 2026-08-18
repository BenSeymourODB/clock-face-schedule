# Timer state, tick integration, and pause/resume re-seaming

**Status:** done
**Issue:** #43
**Docs:** [../brainstorms/2026-08-17-class-timer.md](../brainstorms/2026-08-17-class-timer.md), epic #42

## Scope

Per the epic's readiness table, only this sub-issue and #44 (outline the hands, already merged
via PR #51) are ready to build; #46 (banded display), #47 (control surface), and #48 (digital
readout) each carry open decisions. This issue is scoped to the **runtime** only: a pure state
module for a countdown that advances via the dial's existing per-second tick, survives re-renders,
and repairs the drain-edge/second-hand identity across a pause. No visual timer exists yet to wire
it into — that lands with #46/#47.

## The one non-obvious piece: re-seaming

The brainstorm proves the drain edge (the angle marking how much of the current minute-band has
been consumed) reduces to exactly `secondsOf(now) × 6°` — the second hand's own angle — for a
continuously-running timer, regardless of the start time's own seconds offset. That means the
render can reuse the real second hand with no separate calculation, for any start time.

A pause breaks this. Verified numerically (`node -e`, not just argued):

- Start `14:32:17`, run 40s, pause, **10s pause** (not a multiple of 60), resume, check 5s later
  (`14:33:12`).
- Without correcting anything at resume: computed drain edge is `12°`; the real second hand is at
  `72°`. They disagree — confirms the brainstorm's claim that any pause not a whole number of
  minutes breaks the identity.
- Applying the brainstorm's re-seam formula at resume — `seam = (secondsOf(resume) −
  elapsedInCurrentBand) × 6°` — and recomputing: drain edge is `72°`, matching the second hand
  exactly.
- Also checked: the identity holds for a fresh, never-paused timer across several fractional start
  offsets (`0s`, `17.25s`, `59.9s`, `0.1s`) and several elapsed durations, including ones crossing a
  minute boundary. And re-seaming after a pause that **is** an exact multiple of 60s reproduces the
  original seam unchanged — so always re-seaming on resume is safe, not just correct for the
  ragged case.

## Design

`src/shared/clock/timer.ts` — pure, no DOM, node-testable:

- `TimerState`: `status` (`running` / `paused` / `finished`), `durationSeconds`, `bankedSeconds`
  (elapsed time accumulated before the current running segment), `segmentStartedAt` (`Date | null`),
  `seamDegrees`.
- `startTimer`, `pauseTimer`, `resumeTimer`, `stopTimer`, `tick` — state transitions.
- `elapsedSeconds`, `remainingSeconds`, `remainingBandCount`, `drainEdgeDegrees` — derived reads,
  each a pure function of `(state, now)`.
- `effectiveShowSeconds(preference, status)` — the "running a timer forces `showSeconds` on"
  invariant from the issue, as an explicit, testable coupling rather than a default that happens to
  agree.

Two separate quantities are tracked deliberately: `bankedSeconds`/`segmentStartedAt` give an exact,
seam-independent countdown (for remaining time and band count, needed for correctness), while
`seamDegrees` is re-derived only at resume and governs the drain-edge angle (needed for the visual
identity with the second hand). Conflating them was the mistake the numeric check above catches.

## Out of scope, deferred to sibling issues

- Rendering the bands themselves (#46), the control surface (#47), and the digital readout (#48) —
  all still carry open decisions per the epic table.
- Wiring `analogClock`/`main.ts` to actually start a timer — there is no control to start one from
  yet. `effectiveShowSeconds` and the state module are ready for that wiring once #46/#47 land.
