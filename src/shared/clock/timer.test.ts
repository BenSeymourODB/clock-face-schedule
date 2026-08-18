import { describe, expect, it } from 'vitest';
import {
  drainEdgeDegrees,
  effectiveShowSeconds,
  elapsedSeconds,
  pauseTimer,
  remainingBandCount,
  remainingSeconds,
  resumeTimer,
  startTimer,
  stopTimer,
  tick
} from './timer';

function at(hour: number, minute: number, second: number, ms = 0): Date {
  return new Date(2026, 7, 18, hour, minute, second, ms);
}

describe('startTimer / elapsedSeconds / remainingSeconds', () => {
  it('has zero elapsed and full remaining at the instant it starts', () => {
    const start = at(14, 32, 17);
    const state = startTimer(125, start);
    expect(elapsedSeconds(state, start)).toBe(0);
    expect(remainingSeconds(state, start)).toBe(125);
  });

  it('counts down continuously with real elapsed time', () => {
    const start = at(14, 32, 17);
    const state = startTimer(125, start);
    const later = new Date(start.getTime() + 40_000);
    expect(elapsedSeconds(state, later)).toBe(40);
    expect(remainingSeconds(state, later)).toBe(85);
  });

  it('never reports negative remaining time past the duration', () => {
    const start = at(14, 32, 17);
    const state = startTimer(60, start);
    const wayLater = new Date(start.getTime() + 600_000);
    expect(remainingSeconds(state, wayLater)).toBe(0);
  });
});

describe('remainingBandCount', () => {
  it.each([
    [125, 0, 3], // 2:05 remaining -> 3 bands, the odd 5s spent from the outermost first
    [125, 5, 2],
    [125, 65, 1],
    [60, 0, 1],
    [60, 59, 1],
    [60, 60, 0]
  ])('%s total, %ss elapsed -> %s band(s) remaining', (duration, elapsed, expected) => {
    const start = at(14, 0, 0);
    const state = startTimer(duration, start);
    const now = new Date(start.getTime() + elapsed * 1000);
    expect(remainingBandCount(state, now)).toBe(expected);
  });
});

describe('tick', () => {
  it('leaves a running timer with time left untouched', () => {
    const start = at(14, 0, 0);
    const state = startTimer(60, start);
    const now = new Date(start.getTime() + 30_000);
    expect(tick(state, now)).toEqual(state);
  });

  it('transitions to finished once remaining time reaches zero', () => {
    const start = at(14, 0, 0);
    const state = startTimer(60, start);
    const now = new Date(start.getTime() + 60_000);
    const finished = tick(state, now);
    expect(finished.status).toBe('finished');
    expect(remainingSeconds(finished, now)).toBe(0);
  });

  it('is a no-op on a timer that is already paused or finished', () => {
    const start = at(14, 0, 0);
    const paused = pauseTimer(startTimer(60, start), new Date(start.getTime() + 10_000));
    expect(tick(paused, new Date(start.getTime() + 999_000))).toEqual(paused);
  });
});

describe('drainEdgeDegrees — the second-hand identity', () => {
  it.each([
    ['on the minute', 0],
    ['a quarter past', 17.25],
    ['just before rollover', 59.9],
    ['just after rollover', 0.1]
  ])('reduces to secondsOf(now) × 6°, starting %s', (_label, startSecond) => {
    const start = new Date(2026, 7, 18, 14, 32, Math.floor(startSecond), (startSecond % 1) * 1000);
    const state = startTimer(600, start);

    for (const elapsed of [0, 5, 59, 61, 125.5]) {
      const now = new Date(start.getTime() + elapsed * 1000);
      const secondHandAngle = (now.getSeconds() + now.getMilliseconds() / 1000) * 6;
      expect(drainEdgeDegrees(state, now)).toBeCloseTo(secondHandAngle % 360, 6);
    }
  });

  it('breaks without a re-seam when the pause is not a multiple of 60s — the regression this exists for', () => {
    // Same scenario measured with node -e before writing this module: start 14:32:17, run 40s,
    // pause 10s (not a 60s multiple), resume, check 5s later at 14:33:12.
    const start = at(14, 32, 17);
    let state = startTimer(600, start);
    const pauseAt = new Date(start.getTime() + 40_000); // 14:32:57
    state = pauseTimer(state, pauseAt);

    const resumeAt = new Date(pauseAt.getTime() + 10_000); // 14:33:07 — 10s pause
    const resumed = resumeTimer(state, resumeAt);
    const checkAt = new Date(resumeAt.getTime() + 5_000); // 14:33:12

    const secondHandAngle = checkAt.getSeconds() * 6; // 12 * 6 = 72
    expect(drainEdgeDegrees(resumed, checkAt)).toBeCloseTo(secondHandAngle, 6);

    // Confirms the fix is load-bearing: reusing the *pre-resume* state without re-seaming would
    // have put the drain edge at 12° instead of 72°.
    const withoutReseam = { ...state, status: 'running' as const, segmentStartedAt: resumeAt };
    expect(drainEdgeDegrees(withoutReseam, checkAt)).not.toBeCloseTo(secondHandAngle, 6);
  });

  it('re-seaming after a pause that IS a multiple of 60s reproduces the original seam', () => {
    const start = at(14, 32, 17);
    let state = startTimer(600, start);
    state = pauseTimer(state, new Date(start.getTime() + 40_000));
    const resumeAt = new Date(start.getTime() + 40_000 + 60_000); // exactly 60s pause
    const resumed = resumeTimer(state, resumeAt);
    expect(resumed.seamDegrees).toBeCloseTo(state.seamDegrees, 6);
  });

  it('keeps remaining-time bookkeeping exact through a pause, independent of the seam', () => {
    const start = at(14, 0, 0);
    let state = startTimer(300, start);
    state = pauseTimer(state, new Date(start.getTime() + 40_000));
    expect(remainingSeconds(state, new Date(start.getTime() + 999_000))).toBe(260);

    state = resumeTimer(state, new Date(start.getTime() + 999_000));
    expect(remainingSeconds(state, new Date(start.getTime() + 999_000 + 20_000))).toBe(240);
  });
});

describe('pauseTimer / resumeTimer / stopTimer', () => {
  it('freezes elapsed and remaining time while paused', () => {
    const start = at(14, 0, 0);
    let state = startTimer(60, start);
    state = pauseTimer(state, new Date(start.getTime() + 20_000));
    expect(state.status).toBe('paused');

    const muchLater = new Date(start.getTime() + 500_000);
    expect(elapsedSeconds(state, muchLater)).toBe(20);
    expect(remainingSeconds(state, muchLater)).toBe(40);
  });

  it('is a no-op pausing something already paused, or resuming something already running', () => {
    const start = at(14, 0, 0);
    const running = startTimer(60, start);
    expect(resumeTimer(running, new Date(start.getTime() + 5_000))).toEqual(running);

    const paused = pauseTimer(running, new Date(start.getTime() + 5_000));
    expect(pauseTimer(paused, new Date(start.getTime() + 999_000))).toEqual(paused);
  });

  it('stopTimer finishes a running timer, banking exactly the elapsed time', () => {
    const start = at(14, 0, 0);
    const state = startTimer(60, start);
    const now = new Date(start.getTime() + 25_000);
    const stopped = stopTimer(state, now);
    expect(stopped.status).toBe('finished');
    expect(stopped.segmentStartedAt).toBeNull();
    expect(elapsedSeconds(stopped, new Date(now.getTime() + 999_000))).toBe(25);
  });
});

describe('effectiveShowSeconds', () => {
  it.each([
    [false, 'running' as const, true],
    [false, 'paused' as const, true],
    [true, 'running' as const, true],
    [false, 'finished' as const, false],
    [false, undefined, false],
    [true, undefined, true]
  ])('preference=%s, status=%s -> %s', (preference, status, expected) => {
    expect(effectiveShowSeconds(preference, status)).toBe(expected);
  });
});
