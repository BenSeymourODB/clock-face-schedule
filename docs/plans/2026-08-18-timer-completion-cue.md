# Timer completion cue: audio, and a visible end state

**Status:** done
**Issue:** #45
**Docs:** [../brainstorms/2026-08-17-class-timer.md](../brainstorms/2026-08-17-class-timer.md), epic
#42, [2026-08-18-timer-state-runtime.md](2026-08-18-timer-state-runtime.md) (#43)

## Scope

Per the epic's readiness table, #45 is ready ("pending one hardware check", #10, which does not
block writing or testing the code). Like #43 and #44 before it, there is still **no timer control
and no timer rendering** anywhere in `main.ts`/`analogClock` — #46 (banded display) and #47 (control
surface) both still carry open decisions. So this issue, like #43, ships a **pure, testable runtime
layer with nothing wired in yet**: a completion-cue trigger and a Web Audio player. Wiring a gesture
handler and an actual visible flash into the (not-yet-built) timer UI happens once #46/#47 land.

## A gap in the existing state machine this issue depends on

`stopTimer` (merged in #43) also sets `status: 'finished'` — a manually-stopped timer and a
naturally-expired one are indistinguishable from `status` alone. That's fine for #43's scope (no
consumer cared), but #45's whole premise — "a cue plays when it finishes" — means "expires on its
own," not "was stopped." Confirmed by the brainstorm's own framing of Stop as an abrupt cancellation
("discards a running timer with no way back"), not a completion. Playing a "time's up" chime when a
teacher taps Stop early would be a real bug, not a nicety.

Fix: add `completionReason: 'expired' | 'stopped' | null` to `TimerState`, set by `tick` and
`stopTimer` respectively, `null` otherwise. `stopTimer` also gets an idempotency guard
(`if (state.status === 'finished') return state;`) so calling it again after natural expiry can't
clobber `'expired'` with `'stopped'`. Purely additive — no existing test asserts the field's absence,
and every existing assertion is on `status`, not `completionReason`.

## Detecting the transition, not the level

A renderer/audio trigger must fire the cue **once, on the edge** into naturally-finished — not on
every tick while already finished (the dial re-renders/polls independently of the timer), and not on
page load if a reload somehow resumes into an already-finished state (there is no persistence per
the brainstorm's "a reload loses the timer" decision, but a defensive edge-only check costs nothing
and is the correct semantics regardless).

`shouldPlayCompletionCue(previous: TimerState | undefined, next: TimerState): boolean` in
`timer.ts` — true only when `next.status === 'finished' && next.completionReason === 'expired'` and
`previous` was not already in that same state (`previous === undefined` counts as "not already",
i.e. a fresh mount showing an already-expired state does not fire retroactively).

## The audio module

Client-side only (`AudioContext` needs a `window`), so `src/client/timer-audio-cue.ts`, tested under
jsdom with a mocked `AudioContext`/`OscillatorNode`/`GainNode` (jsdom does not implement Web Audio).

- `getCompletionAudioContext()` — lazily creates one `AudioContext` and reuses it (an `AudioContext`
  can only usefully be constructed after a user gesture per autoplay policy; this exists so the
  *same* unlocked context, created when a future "start timer" tap fires, is what a later expiry
  reuses — see the brainstorm's "autoplay problem solves itself"). Calls `.resume()` if suspended.
- `playCompletionCue(context, { muted })` — if `muted`, does nothing at all (no nodes created, no
  sound): "mute must leave the timer fully functional," not just silent-but-still-trying. Otherwise
  builds a short two-tone sine chime (gentle: soft attack, low peak gain, exponential decay to avoid
  a click) — deliberately not a harsh buzzer, per "a sudden noise is a problem for part of this
  audience."

## Visible end state — what's actually buildable now

There is no rendered timer surface to flash yet (#46 undecided). What #45 *can* and must still
deliver, so audio is never the only signal even before #46 exists: `completionReason` on `TimerState`
is itself the durable, testable "visible end state" signal — any future renderer branches on
`status === 'finished' && completionReason === 'expired'` to draw whatever #46 decides, and that
branch is exercised today by tests rather than invented at render time. No new SVG/DOM output is
added in this PR (nothing exists yet to draw it on); the actual flash/pulse is #46's concern and is
already tracked there.

## Out of scope, deferred

- Wiring a start-timer gesture to `getCompletionAudioContext()`, and wiring `shouldPlayCompletionCue`
  /`playCompletionCue` into the tick loop — no control exists yet (#47).
- The actual visible rendering of a finished state on the face — #46.
- Persisting a mute preference — #31 (PropertiesService), not ready, and premature without a control
  to set it from.
