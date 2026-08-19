import { describe, expect, it } from 'vitest';

import { angleForTime, calculateArcAngles, calculateTrueArcAngles } from './clock-utils';
import {
  ONE_HOUR_SCALE,
  TWELVE_HOUR_SCALE,
  dialOrigin,
  dialScale,
  dialWindow,
  parseDialScaleId
} from './scale';

const at = (hours: number, minutes: number, seconds = 0) =>
  new Date(2026, 7, 19, hours, minutes, seconds);

describe('parseDialScaleId', () => {
  it.each([
    ['1h', '1h'],
    ['12h', '12h'],
    ['', '12h'],
    ['1H', '12h'],
    ['60', '12h'],
    [null, '12h'],
    [undefined, '12h']
  ])('reads %p as %p', (raw, expected) => {
    expect(parseDialScaleId(raw)).toBe(expected);
  });
});

describe('dialScale', () => {
  it('resolves both ids to their descriptor', () => {
    expect(dialScale('12h')).toBe(TWELVE_HOUR_SCALE);
    expect(dialScale('1h')).toBe(ONE_HOUR_SCALE);
  });

  it('keeps the 12-hour scale on #25 rolling window, in minutes', () => {
    expect(TWELVE_HOUR_SCALE.periodMinutes).toBe(720);
    expect(TWELVE_HOUR_SCALE.lookbehindMinutes).toBe(180);
    expect(TWELVE_HOUR_SCALE.lookaheadMinutes).toBe(480);
  });

  it('gives the 1-hour scale 5 minutes back and 50 ahead', () => {
    expect(ONE_HOUR_SCALE.periodMinutes).toBe(60);
    expect(ONE_HOUR_SCALE.lookbehindMinutes).toBe(5);
    expect(ONE_HOUR_SCALE.lookaheadMinutes).toBe(50);
  });

  it.each([
    ['12h', TWELVE_HOUR_SCALE],
    ['1h', ONE_HOUR_SCALE]
  ])('spans 330° at the %s scale, leaving #25 30° gap', (_id, scale) => {
    const span = scale.lookbehindMinutes + scale.lookaheadMinutes;
    expect((span / scale.periodMinutes) * 360).toBeCloseTo(330, 10);
  });
});

describe('dialOrigin', () => {
  it.each([
    [at(0, 0), 0],
    [at(9, 15), 0],
    [at(11, 59, 59), 0],
    [at(12, 0), 12],
    [at(23, 30), 12]
  ])('puts the 12-hour origin at the AM/PM boundary for %s', (time, expectedHour) => {
    const origin = dialOrigin(time, TWELVE_HOUR_SCALE);
    expect(origin.getHours()).toBe(expectedHour);
    expect(origin.getMinutes()).toBe(0);
    expect(origin.getSeconds()).toBe(0);
    expect(origin.getMilliseconds()).toBe(0);
  });

  it.each([at(0, 0), at(9, 15), at(10, 45, 30), at(23, 59, 59)])(
    'puts the 1-hour origin at the top of the containing hour for %s',
    (time) => {
      const origin = dialOrigin(time, ONE_HOUR_SCALE);
      expect(origin.getHours()).toBe(time.getHours());
      expect(origin.getMinutes()).toBe(0);
      expect(origin.getSeconds()).toBe(0);
      expect(origin.getMilliseconds()).toBe(0);
    }
  );

  it('does not mutate the time it is given', () => {
    const time = at(10, 45);
    dialOrigin(time, ONE_HOUR_SCALE);
    dialOrigin(time, TWELVE_HOUR_SCALE);
    expect(time.getTime()).toBe(at(10, 45).getTime());
  });
});

describe('dialWindow', () => {
  it('rolls the 1-hour window with the time', () => {
    const { windowStart, windowEnd } = dialWindow(at(10, 45), ONE_HOUR_SCALE);
    expect(windowStart.getTime()).toBe(at(10, 40).getTime());
    expect(windowEnd.getTime()).toBe(at(11, 35).getTime());
  });

  it('keeps the 12-hour window at #25 3h/8h', () => {
    const { windowStart, windowEnd } = dialWindow(at(10, 45), TWELVE_HOUR_SCALE);
    expect(windowStart.getTime()).toBe(at(7, 45).getTime());
    expect(windowEnd.getTime()).toBe(at(18, 45).getTime());
  });
});

describe('the 1-hour scale through the shared geometry', () => {
  /**
   * The property the whole mode rests on: at 60 minutes per revolution the band runs at 6° per
   * minute, which is also the minute hand's own rate. `now` therefore lands on the band exactly
   * where the minute hand points, and the drain boundary (#28) follows it without being told.
   */
  it('puts now at the minute hand angle', () => {
    const now = at(10, 45);
    const origin = dialOrigin(now, ONE_HOUR_SCALE);
    const minuteHandAngle = now.getMinutes() * 6;

    expect(angleForTime(now, origin, ONE_HOUR_SCALE.periodMinutes)).toBeCloseTo(
      minuteHandAngle,
      10
    );
  });

  it('runs at 12x the 12-hour scale resolution', () => {
    const start = at(10, 0);
    const twelve = angleForTime(at(10, 20), start, TWELVE_HOUR_SCALE.periodMinutes);
    const one = angleForTime(at(10, 20), start, ONE_HOUR_SCALE.periodMinutes);

    expect(twelve).toBeCloseTo(10, 10);
    expect(one).toBeCloseTo(120, 10);
  });

  /**
   * A 20-minute and a 40-minute event differ by 10° on the 12-hour dial — about the gap between
   * two minute ticks, which is the complaint #32 was opened about. The mode is only worth having
   * if that difference becomes something a room can see.
   */
  it('separates a 20- and a 40-minute event by 120° rather than 10°', () => {
    const origin = dialOrigin(at(10, 0), ONE_HOUR_SCALE);
    const short = calculateTrueArcAngles(
      at(10, 5),
      at(10, 25),
      origin,
      at(10, 0),
      at(11, 0),
      ONE_HOUR_SCALE.periodMinutes
    );
    const long = calculateTrueArcAngles(
      at(10, 5),
      at(10, 45),
      origin,
      at(10, 0),
      at(11, 0),
      ONE_HOUR_SCALE.periodMinutes
    );

    expect(long.endAngle - long.startAngle - (short.endAngle - short.startAngle)).toBeCloseTo(
      120,
      10
    );
  });

  /**
   * Every 1-hour window wraps unless `now` happens to sit within 5 minutes of the hour. Angles
   * must stay unnormalised past 360° for `describeArc`'s large-arc flag and `assignRings`' sort
   * to keep working (#33) — the failure mode is an arc drawn the long way round the dial.
   */
  it('leaves a wrapping window unnormalised past 360 degrees', () => {
    const now = at(10, 45);
    const origin = dialOrigin(now, ONE_HOUR_SCALE);
    const { windowStart, windowEnd } = dialWindow(now, ONE_HOUR_SCALE);

    expect(angleForTime(windowStart, origin, ONE_HOUR_SCALE.periodMinutes)).toBeCloseTo(240, 10);
    expect(angleForTime(windowEnd, origin, ONE_HOUR_SCALE.periodMinutes)).toBeCloseTo(570, 10);

    // An event wholly inside the part of the window that has wrapped past the top of the dial.
    const wrapped = calculateTrueArcAngles(
      at(11, 5),
      at(11, 20),
      origin,
      windowStart,
      windowEnd,
      ONE_HOUR_SCALE.periodMinutes
    );
    expect(wrapped.startAngle).toBeCloseTo(390, 10);
    expect(wrapped.endAngle).toBeCloseTo(480, 10);
    expect(wrapped.continuesBefore).toBe(false);
    expect(wrapped.continuesAfter).toBe(false);
  });

  it('clamps to the window it is given, not to one revolution from the origin', () => {
    const now = at(10, 45);
    const origin = dialOrigin(now, ONE_HOUR_SCALE);
    const { windowStart, windowEnd } = dialWindow(now, ONE_HOUR_SCALE);

    const straddling = calculateTrueArcAngles(
      at(10, 30),
      at(12, 0),
      origin,
      windowStart,
      windowEnd,
      ONE_HOUR_SCALE.periodMinutes
    );

    expect(straddling.startAngle).toBeCloseTo(240, 10);
    expect(straddling.endAngle).toBeCloseTo(570, 10);
    expect(straddling.continuesBefore).toBe(true);
    expect(straddling.continuesAfter).toBe(true);
  });

  /**
   * `MIN_ARC_DEGREES` is a visibility floor in *degrees*, so it stays 7.5° in both modes — 15
   * minutes at the 12-hour scale and 1.25 minutes at the 1-hour one. That is the point: at 6° per
   * minute almost nothing needs propping up, so short events keep their real duration instead of
   * being flattened to a common width.
   */
  it('stops flattening short events at the 1-hour scale', () => {
    const origin = dialOrigin(at(10, 0), ONE_HOUR_SCALE);
    const spanOf = (minutes: number, periodMinutes: number) => {
      const { startAngle, endAngle } = calculateArcAngles(
        at(10, 5),
        new Date(at(10, 5).getTime() + minutes * 60_000),
        origin,
        at(10, 0),
        at(11, 0),
        periodMinutes
      );
      return endAngle - startAngle;
    };

    // At 12 hours a 5- and a 15-minute event are drawn identically; at 1 hour they are not.
    expect(spanOf(5, TWELVE_HOUR_SCALE.periodMinutes)).toBeCloseTo(7.5, 10);
    expect(spanOf(15, TWELVE_HOUR_SCALE.periodMinutes)).toBeCloseTo(7.5, 10);

    expect(spanOf(5, ONE_HOUR_SCALE.periodMinutes)).toBeCloseTo(30, 10);
    expect(spanOf(15, ONE_HOUR_SCALE.periodMinutes)).toBeCloseTo(90, 10);

    // The floor still catches something genuinely too short to see: 1 minute is 6°.
    expect(spanOf(1, ONE_HOUR_SCALE.periodMinutes)).toBeCloseTo(7.5, 10);
  });
});

describe('the 12-hour scale is unchanged by the new parameter', () => {
  it.each([
    ['angleForTime', () => angleForTime(at(9, 30), at(0, 0))],
    [
      'calculateTrueArcAngles start',
      () => calculateTrueArcAngles(at(9, 30), at(10, 0), at(0, 0)).startAngle
    ],
    ['calculateArcAngles start', () => calculateArcAngles(at(9, 30), at(10, 0), at(0, 0)).startAngle]
  ])('%s still defaults to 720 minutes per revolution', (_name, compute) => {
    expect(compute()).toBeCloseTo(285, 10);
  });

  it('still defaults the window to one whole revolution from the origin', () => {
    // 11:30–12:30 against a midnight origin: clamped at noon, and reported as continuing past it.
    const clamped = calculateTrueArcAngles(at(11, 30), at(12, 30), at(0, 0));
    expect(clamped.endAngle).toBeCloseTo(360, 10);
    expect(clamped.continuesAfter).toBe(true);
  });
});
