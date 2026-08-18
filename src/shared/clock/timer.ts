/**
 * The teacher-set countdown timer's runtime: advancing, surviving re-renders, and pausing.
 *
 * Pure and DOM-free so it can be driven by the dial's existing per-second tick rather than a
 * second `setInterval` that would drift against it. See
 * docs/brainstorms/2026-08-17-class-timer.md and issue #43.
 */

export type TimerStatus = 'running' | 'paused' | 'finished';

/**
 * Why a `finished` timer got there — `tick` and `stopTimer` both land on the same `status`, but a
 * completion cue must fire for one and not the other (see issue #45): stopping a timer early is a
 * cancellation, not an arrival.
 */
export type TimerCompletionReason = 'expired' | 'stopped' | null;

export interface TimerState {
  status: TimerStatus;
  /** Set only once `status` is `finished`; `null` otherwise. See `TimerCompletionReason`. */
  completionReason: TimerCompletionReason;
  /** Total duration requested, in seconds. */
  durationSeconds: number;
  /**
   * Elapsed seconds accumulated before the current running segment. The full elapsed total once
   * paused or finished.
   */
  bankedSeconds: number;
  /** When the current running segment began. `null` while paused or finished. */
  segmentStartedAt: Date | null;
  /**
   * Degrees at which zero-seconds-elapsed-in-the-current-band sits. Re-derived on every resume
   * so the drain edge keeps tracking the second hand's own angle through a pause of any length —
   * see `resumeTimer`.
   */
  seamDegrees: number;
}

function mod(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

/** Wall-clock seconds-past-the-minute, including the fractional part. */
function secondsOfMinute(date: Date): number {
  return date.getSeconds() + date.getMilliseconds() / 1000;
}

export function startTimer(durationSeconds: number, now: Date): TimerState {
  return {
    status: 'running',
    completionReason: null,
    durationSeconds,
    bankedSeconds: 0,
    segmentStartedAt: now,
    seamDegrees: mod(secondsOfMinute(now) * 6, 360)
  };
}

/** Total seconds elapsed since the timer started, excluding any paused time. */
export function elapsedSeconds(state: TimerState, now: Date): number {
  if (state.status === 'running' && state.segmentStartedAt) {
    return state.bankedSeconds + (now.getTime() - state.segmentStartedAt.getTime()) / 1000;
  }
  return state.bankedSeconds;
}

export function remainingSeconds(state: TimerState, now: Date): number {
  return Math.max(0, state.durationSeconds - elapsedSeconds(state, now));
}

/** How many concentric bands remain — the ring count a viewer counts, per the epic's encoding. */
export function remainingBandCount(state: TimerState, now: Date): number {
  return Math.ceil(remainingSeconds(state, now) / 60);
}

/**
 * The drain edge's angle. While running, this reduces to `secondsOf(now) × 6°` — the second
 * hand's own angle — so a renderer needs no separate mark for it; the identity is what lets the
 * timer reuse the existing hand instead of drawing a second one.
 */
export function drainEdgeDegrees(state: TimerState, now: Date): number {
  return mod(state.seamDegrees + mod(elapsedSeconds(state, now), 60) * 6, 360);
}

/**
 * Advance the timer. Called alongside the dial's existing per-second `setTime`, not a separate
 * interval — remaining time is computed from real elapsed wall-clock time (see `elapsedSeconds`),
 * so this only needs to detect completion, not accumulate anything itself.
 */
export function tick(state: TimerState, now: Date): TimerState {
  if (state.status !== 'running') return state;
  if (remainingSeconds(state, now) > 0) return state;

  return {
    ...state,
    status: 'finished',
    completionReason: 'expired',
    bankedSeconds: state.durationSeconds,
    segmentStartedAt: null
  };
}

export function pauseTimer(state: TimerState, now: Date): TimerState {
  if (state.status !== 'running') return state;

  return {
    ...state,
    status: 'paused',
    bankedSeconds: elapsedSeconds(state, now),
    segmentStartedAt: null
  };
}

/**
 * Resume a paused timer.
 *
 * A pause of any duration leaves `bankedSeconds` exactly correct — it is frozen wall-clock elapsed
 * time, seam-independent. But the *drain edge*, which is supposed to track the second hand, drifts
 * out of alignment with it unless the pause happened to last an exact multiple of 60 seconds: the
 * second hand keeps sweeping through the pause while the countdown does not. Re-deriving the seam
 * from the resume instant repairs the identity going forward, at the cost of a one-off jump in
 * exactly where the current band's edge sits — which is honest, since a pause did just happen.
 */
export function resumeTimer(state: TimerState, now: Date): TimerState {
  if (state.status !== 'paused') return state;

  const elapsedInBand = mod(state.bankedSeconds, 60);
  return {
    ...state,
    status: 'running',
    segmentStartedAt: now,
    seamDegrees: mod(secondsOfMinute(now) * 6 - elapsedInBand * 6, 360)
  };
}

export function stopTimer(state: TimerState, now: Date): TimerState {
  // Idempotent past `finished` so stopping an already-naturally-expired timer can't overwrite
  // `completionReason: 'expired'` with `'stopped'`.
  if (state.status === 'finished') return state;

  return {
    ...state,
    status: 'finished',
    completionReason: 'stopped',
    bankedSeconds: elapsedSeconds(state, now),
    segmentStartedAt: null
  };
}

/**
 * Whether a completion cue should play, given the previous and next state — true exactly on the
 * edge into a naturally-expired `finished`, not on every subsequent tick while already finished,
 * and not for a timer that was stopped rather than run out. `previous` is `undefined` for a fresh
 * mount; an already-expired state at mount does not fire retroactively, since there is no live
 * transition to react to (and per the brainstorm, a timer never survives a reload anyway).
 */
export function shouldPlayCompletionCue(previous: TimerState | undefined, next: TimerState): boolean {
  if (next.status !== 'finished' || next.completionReason !== 'expired') return false;
  return previous !== undefined && !(previous.status === 'finished' && previous.completionReason === 'expired');
}

/**
 * Whether the dial should show its second hand.
 *
 * `showSeconds` defaults to `false` on `analogClock`, and `main.ts` happens to pass `true` — but a
 * coupling this load-bearing (the second hand *is* the timer's drain edge) cannot rest on that
 * happening to agree. A running or paused timer forces it on regardless of the viewer's own
 * preference; a paused timer keeps it on too, since a hand that vanished mid-pause would read as
 * the display breaking rather than as a pause.
 */
export function effectiveShowSeconds(preference: boolean, status: TimerStatus | undefined): boolean {
  return status === 'running' || status === 'paused' || preference;
}
