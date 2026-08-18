import { describe, expect, it } from 'vitest';
import {
  angleForTime,
  calculateArcAngles,
  calculateTrueArcAngles,
  combineTitleWithEmoji,
  describeArc,
  elapsedEventIds,
  eventsToClockEvents,
  filterEventsForPeriod,
  getDayStart,
  getFetchWindow,
  getPeriodBounds,
  getPeriodStart,
  getRollingWindow,
  hasEventInProgress,
  parseEventTitle,
  polarToCartesian,
  roundCoord
} from './clock-utils';
import type { ClockEventInput } from './types';

const FALLBACK = '#3B82F6';

function makeEvent(overrides: Partial<ClockEventInput> = {}): ClockEventInput {
  return {
    id: 'e1',
    title: 'Event',
    startDate: new Date(2026, 3, 12, 9, 0, 0).toISOString(),
    endDate: new Date(2026, 3, 12, 10, 0, 0).toISOString(),
    isAllDay: false,
    fallbackColor: FALLBACK,
    ...overrides
  };
}

describe('parseEventTitle', () => {
  it.each([
    ['🔴', '#EF4444'],
    ['🟠', '#F97316'],
    ['🟡', '#EAB308'],
    ['🟢', '#22C55E'],
    ['🔵', '#3B82F6'],
    ['🟣', '#A855F7'],
    ['⚫', '#1F2937'],
    ['⚪', '#F3F4F6'],
    ['🟤', '#92400E']
  ])('maps the %s prefix to %s', (emoji, expected) => {
    const result = parseEventTitle(`${emoji} Test`, '#000000');
    expect(result.colorEmoji).toBe(emoji);
    expect(result.color).toBe(expected);
  });

  it('strips the colour prefix from the title', () => {
    const result = parseEventTitle('🔴 Deadline', FALLBACK);
    expect(result.cleanTitle).toBe('Deadline');
  });

  it('extracts an event emoji following the colour emoji', () => {
    const result = parseEventTitle('🟢 🎮 Family Game Night', FALLBACK);
    expect(result.colorEmoji).toBe('🟢');
    expect(result.eventEmoji).toBe('🎮');
    expect(result.color).toBe('#22C55E');
    expect(result.cleanTitle).toBe('Family Game Night');
  });

  it('treats a leading non-colour emoji as the event emoji and keeps the fallback colour', () => {
    const result = parseEventTitle('🏋️ Gym Session', '#F97316');
    expect(result.colorEmoji).toBeUndefined();
    expect(result.eventEmoji).toBe('🏋️');
    expect(result.color).toBe('#F97316');
    expect(result.cleanTitle).toBe('Gym Session');
  });

  it('returns the fallback colour when there is no emoji prefix', () => {
    const result = parseEventTitle('Team Meeting', '#A855F7');
    expect(result.colorEmoji).toBeUndefined();
    expect(result.eventEmoji).toBeUndefined();
    expect(result.color).toBe('#A855F7');
    expect(result.cleanTitle).toBe('Team Meeting');
  });

  it('handles an empty title', () => {
    const result = parseEventTitle('', FALLBACK);
    expect(result.cleanTitle).toBe('');
    expect(result.color).toBe(FALLBACK);
  });

  it('handles a title that is only a colour emoji', () => {
    const result = parseEventTitle('🔴', FALLBACK);
    expect(result.colorEmoji).toBe('🔴');
    expect(result.cleanTitle).toBe('');
  });

  it('handles a title that is only a colour emoji and an event emoji', () => {
    const result = parseEventTitle('🟢 🎮', FALLBACK);
    expect(result.eventEmoji).toBe('🎮');
    expect(result.cleanTitle).toBe('');
  });

  it('strips only the single delimiter space after the emoji', () => {
    const result = parseEventTitle('🔴  Multiple  Spaces', FALLBACK);
    expect(result.cleanTitle).toBe(' Multiple  Spaces');
  });
});

describe('combineTitleWithEmoji', () => {
  it.each([
    ['puts the emoji ahead of the title', 'Lunch', '🍽️', '🍽️ Lunch'],
    ['leaves a title with no emoji alone', 'Team Meeting', undefined, 'Team Meeting'],
    // No trailing separator, which would otherwise reach the arc's aria-label.
    ['keeps an emoji-only title to just the emoji', '', '🎮', '🎮']
  ])('%s', (_label, cleanTitle, eventEmoji, expected) => {
    expect(combineTitleWithEmoji(cleanTitle, eventEmoji)).toBe(expected);
  });

  it('round-trips what parseEventTitle split, minus the colour dot', () => {
    // The colour prefix selects the arc colour and must never render; the event's own emoji must.
    const parsed = parseEventTitle('🟡 🍽️ Lunch', FALLBACK);

    expect(combineTitleWithEmoji(parsed.cleanTitle, parsed.eventEmoji)).toBe('🍽️ Lunch');
  });

  it('round-trips a ZWJ emoji without splitting the sequence', () => {
    // Found by rendering, not by testing. The splitter took only "👩" and left "‍🏫 Parent…" as the
    // title, so recombining inserted a space *inside* the sequence and the label drew "👩 ‍🏫" — a
    // woman, a space, then a stray school. Both ends use one shared pattern now.
    const teacher = '\u{1F469}‍\u{1F3EB}';
    const parsed = parseEventTitle(`🔵 ${teacher} Parent Evening`, FALLBACK);

    expect(parsed.eventEmoji).toBe(teacher);
    expect(parsed.cleanTitle).toBe('Parent Evening');
    expect(combineTitleWithEmoji(parsed.cleanTitle, parsed.eventEmoji)).toBe(
      `${teacher} Parent Evening`
    );
  });
});

describe('getPeriodStart', () => {
  it.each([
    [9, 30, 0],
    [0, 0, 0],
    [11, 59, 0],
    [12, 0, 12],
    [14, 30, 12],
    [23, 59, 12]
  ])('puts %i:%i in the period starting at %i:00', (hour, minute, expectedHour) => {
    const periodStart = getPeriodStart(new Date(2026, 3, 12, hour, minute, 0));
    expect(periodStart.getHours()).toBe(expectedHour);
  });

  it('zeroes minutes, seconds, and milliseconds', () => {
    const periodStart = getPeriodStart(new Date(2026, 3, 12, 9, 30, 45, 123));
    expect(periodStart.getMinutes()).toBe(0);
    expect(periodStart.getSeconds()).toBe(0);
    expect(periodStart.getMilliseconds()).toBe(0);
  });
});

describe('getPeriodBounds', () => {
  it('spans midnight to noon for a morning time', () => {
    const { periodStart, periodEnd } = getPeriodBounds(new Date(2026, 3, 12, 9, 30, 0));
    expect(periodStart.getHours()).toBe(0);
    expect(periodEnd.getHours()).toBe(12);
  });

  it('ends at midnight of the following day for an afternoon time', () => {
    const { periodEnd } = getPeriodBounds(new Date(2026, 3, 12, 14, 30, 0));
    expect(periodEnd.getDate()).toBe(13);
    expect(periodEnd.getHours()).toBe(0);
  });

  it('places periodEnd exactly 12 hours after periodStart', () => {
    const { periodStart, periodEnd } = getPeriodBounds(new Date(2026, 3, 12, 14, 30, 0));
    expect(periodEnd.getTime() - periodStart.getTime()).toBe(12 * 60 * 60 * 1000);
  });

  it('agrees with getPeriodStart', () => {
    const time = new Date(2026, 3, 12, 7, 0, 0);
    expect(getPeriodBounds(time).periodStart.getTime()).toBe(getPeriodStart(time).getTime());
  });
});

describe('getRollingWindow', () => {
  it('looks 3 hours behind and 8 ahead by default', () => {
    const now = new Date(2026, 3, 12, 9, 0, 0);
    const { windowStart, windowEnd } = getRollingWindow(now);
    expect(windowStart.getTime()).toBe(now.getTime() - 3 * 60 * 60 * 1000);
    expect(windowEnd.getTime()).toBe(now.getTime() + 8 * 60 * 60 * 1000);
  });

  it('accepts explicit look-behind/look-ahead hours', () => {
    const now = new Date(2026, 3, 12, 9, 0, 0);
    const { windowStart, windowEnd } = getRollingWindow(now, 1, 2);
    expect(windowStart.getTime()).toBe(now.getTime() - 1 * 60 * 60 * 1000);
    expect(windowEnd.getTime()).toBe(now.getTime() + 2 * 60 * 60 * 1000);
  });

  // The whole point of #25: near the end of the old fixed period there was almost no look-ahead
  // left on the band. A rolling window keeps a full 8 hours regardless of where "now" falls.
  it('keeps the full look-ahead right at the old period boundary', () => {
    const justBeforeMidnight = new Date(2026, 3, 12, 23, 45, 0);
    const { windowEnd } = getRollingWindow(justBeforeMidnight);
    expect(windowEnd.getTime() - justBeforeMidnight.getTime()).toBe(8 * 60 * 60 * 1000);
  });

  it('can look behind into the previous day', () => {
    const justAfterMidnight = new Date(2026, 3, 12, 0, 30, 0);
    const { windowStart } = getRollingWindow(justAfterMidnight);
    expect(windowStart.getDate()).toBe(11);
    expect(windowStart.getHours()).toBe(21);
    expect(windowStart.getMinutes()).toBe(30);
  });
});

describe('getFetchWindow', () => {
  // #37: the agenda panel epic (#36) needs the whole calendar day, not just what the dial
  // renders — so the fetch must cover today's midnight regardless of the rolling window's own
  // (much shorter) lookbehind.
  it('covers the whole day even when the rolling lookbehind alone would not reach midnight', () => {
    const afternoon = new Date(2026, 3, 12, 14, 30, 0);
    const { windowStart } = getFetchWindow(afternoon, 1);
    expect(windowStart.getDate()).toBe(12);
    expect(windowStart.getHours()).toBeLessThanOrEqual(0);
  });

  // The regression #36 sub-issues would otherwise reintroduce: early enough in the day, the
  // rolling window's 3-hour lookbehind reaches *before* today's midnight, which a naive
  // day-start-only anchor would still clip.
  it('extends earlier than today\'s midnight when the rolling lookbehind reaches into yesterday', () => {
    const justAfterMidnight = new Date(2026, 3, 12, 0, 30, 0);
    const { windowStart } = getFetchWindow(justAfterMidnight, 0);
    const rolling = getRollingWindow(justAfterMidnight);
    expect(windowStart.getTime()).toBe(rolling.windowStart.getTime());
    expect(windowStart.getDate()).toBe(11);
  });

  it('extends the end past the rolling window\'s own look-ahead by the margin', () => {
    const now = new Date(2026, 3, 12, 9, 0, 0);
    const { windowEnd } = getFetchWindow(now, 1);
    const rolling = getRollingWindow(now);
    expect(windowEnd.getTime()).toBe(rolling.windowEnd.getTime() + 60 * 60 * 1000);
  });

  // Regression guard for #37's original failure, restated for the rolling window: whatever the
  // margin, the fetched range must still fully contain both what the dial draws and today.
  it('always contains the rolling window and the whole day', () => {
    const now = new Date(2026, 3, 12, 14, 30, 0);
    const { windowStart, windowEnd } = getFetchWindow(now, 1);
    const rolling = getRollingWindow(now);
    expect(windowStart.getTime()).toBeLessThanOrEqual(rolling.windowStart.getTime());
    expect(windowStart.getTime()).toBeLessThanOrEqual(getDayStart(now).getTime());
    expect(windowEnd.getTime()).toBeGreaterThanOrEqual(rolling.windowEnd.getTime());
  });

  it('never starts the window after the fetch time', () => {
    const time = new Date(2026, 3, 12, 0, 0, 0);
    const { windowStart } = getFetchWindow(time, 0);
    expect(windowStart.getTime()).toBeLessThanOrEqual(time.getTime());
  });
});

describe('getDayStart', () => {
  it.each([
    [0, 0],
    [9, 30],
    [11, 59],
    [12, 0],
    [23, 59]
  ])('puts %i:%i at midnight of the same day', (hour, minute) => {
    const time = new Date(2026, 3, 12, hour, minute, 0);
    const dayStart = getDayStart(time);
    expect(dayStart.getFullYear()).toBe(2026);
    expect(dayStart.getMonth()).toBe(3);
    expect(dayStart.getDate()).toBe(12);
    expect(dayStart.getHours()).toBe(0);
    expect(dayStart.getMinutes()).toBe(0);
    expect(dayStart.getSeconds()).toBe(0);
    expect(dayStart.getMilliseconds()).toBe(0);
  });
});

describe('angleForTime', () => {
  it('is 0° at periodStart and increases 0.5°/minute', () => {
    const periodStart = new Date(2026, 3, 12, 0, 0, 0);
    expect(angleForTime(periodStart, periodStart)).toBe(0);
    expect(angleForTime(new Date(2026, 3, 12, 1, 0, 0), periodStart)).toBe(30);
    expect(angleForTime(new Date(2026, 3, 12, 6, 0, 0), periodStart)).toBe(180);
  });

  it('does not wrap past 360° or below 0°', () => {
    const periodStart = new Date(2026, 3, 12, 0, 0, 0);
    expect(angleForTime(new Date(2026, 3, 12, 17, 0, 0), periodStart)).toBe(510);
    expect(angleForTime(new Date(2026, 3, 11, 21, 0, 0), periodStart)).toBe(-90);
  });

  it('agrees with the mod-360 hand position for any choice of periodStart', () => {
    const time = new Date(2026, 3, 12, 17, 0, 0);
    const fromMidnight = angleForTime(time, new Date(2026, 3, 12, 0, 0, 0));
    const fromNoon = angleForTime(time, new Date(2026, 3, 12, 12, 0, 0));
    expect(((fromMidnight % 360) + 360) % 360).toBeCloseTo(((fromNoon % 360) + 360) % 360, 10);
  });
});

describe('calculateArcAngles', () => {
  const periodStart = new Date(2026, 3, 12, 0, 0, 0);

  it.each([
    [0, 0, 1, 0, 0, 30],
    [3, 0, 4, 0, 90, 120],
    [6, 0, 6, 30, 180, 195],
    [9, 0, 10, 0, 270, 300]
  ])(
    'maps %i:%i–%i:%i onto %i°–%i°',
    (startHour, startMin, endHour, endMin, expectedStart, expectedEnd) => {
      const angles = calculateArcAngles(
        new Date(2026, 3, 12, startHour, startMin, 0),
        new Date(2026, 3, 12, endHour, endMin, 0),
        periodStart
      );
      expect(angles.startAngle).toBeCloseTo(expectedStart);
      expect(angles.endAngle).toBeCloseTo(expectedEnd);
    }
  );

  it('measures the PM period from noon', () => {
    const angles = calculateArcAngles(
      new Date(2026, 3, 12, 12, 0, 0),
      new Date(2026, 3, 12, 13, 0, 0),
      new Date(2026, 3, 12, 12, 0, 0)
    );
    expect(angles.startAngle).toBeCloseTo(0);
    expect(angles.endAngle).toBeCloseTo(30);
  });

  it('gives a 15-minute event exactly the minimum arc span', () => {
    const angles = calculateArcAngles(
      new Date(2026, 3, 12, 3, 0, 0),
      new Date(2026, 3, 12, 3, 15, 0),
      periodStart
    );
    expect(angles.endAngle - angles.startAngle).toBeCloseTo(7.5);
  });

  it('widens a sub-minimum event to the minimum arc span', () => {
    const angles = calculateArcAngles(
      new Date(2026, 3, 12, 3, 0, 0),
      new Date(2026, 3, 12, 3, 5, 0),
      periodStart
    );
    expect(angles.endAngle - angles.startAngle).toBeGreaterThanOrEqual(7.5);
  });

  it('clamps an event running past the end of the period', () => {
    const angles = calculateArcAngles(
      new Date(2026, 3, 12, 11, 0, 0),
      new Date(2026, 3, 12, 13, 0, 0),
      periodStart
    );
    expect(angles.startAngle).toBeCloseTo(330);
    expect(angles.endAngle).toBeCloseTo(360);
  });

  it('clamps an event starting before the period', () => {
    const angles = calculateArcAngles(
      new Date(2026, 3, 12, 11, 0, 0),
      new Date(2026, 3, 12, 13, 0, 0),
      new Date(2026, 3, 12, 12, 0, 0)
    );
    expect(angles.startAngle).toBeCloseTo(0);
    expect(angles.endAngle).toBeCloseTo(30);
  });

  it('pulls the start back rather than letting the arc wrap past the top of the dial', () => {
    // A 5-minute event at 11:58 would widen past 360° — the floor is applied inward.
    const angles = calculateArcAngles(
      new Date(2026, 3, 12, 11, 58, 0),
      new Date(2026, 3, 12, 11, 59, 0),
      periodStart
    );
    expect(angles.endAngle).toBe(360);
    expect(angles.endAngle - angles.startAngle).toBeCloseTo(7.5);
  });

  describe('against an explicit window', () => {
    it('clamps to the window rather than the whole period', () => {
      const angles = calculateArcAngles(
        new Date(2026, 3, 12, 1, 0, 0),
        new Date(2026, 3, 12, 5, 0, 0),
        periodStart,
        new Date(2026, 3, 12, 2, 0, 0),
        new Date(2026, 3, 12, 4, 0, 0)
      );
      expect(angles.startAngle).toBeCloseTo(60);
      expect(angles.endAngle).toBeCloseTo(120);
    });

    it('produces an angle past 360° for a window reaching past the period', () => {
      // A rolling window can extend past periodStart + 720min; the event drawn there must not
      // be wrapped back to a small angle, or it would sort before events earlier in the window.
      const angles = calculateArcAngles(
        new Date(2026, 3, 12, 13, 0, 0),
        new Date(2026, 3, 12, 13, 30, 0),
        periodStart,
        periodStart,
        new Date(2026, 3, 12, 14, 0, 0)
      );
      expect(angles.startAngle).toBeCloseTo(390);
      expect(angles.endAngle).toBeCloseTo(405);
    });

    it('produces a negative angle for a window starting before the period', () => {
      const angles = calculateArcAngles(
        new Date(2026, 3, 11, 22, 0, 0),
        new Date(2026, 3, 11, 22, 30, 0),
        periodStart,
        new Date(2026, 3, 11, 21, 0, 0),
        periodStart
      );
      expect(angles.startAngle).toBeCloseTo(-60);
      expect(angles.endAngle).toBeCloseTo(-45);
    });

    it('widens a short event against the window end rather than 360°', () => {
      // The window ends at 60° (2:00), well short of the period's own 360°. Widening this
      // 5-minute event must stop at the window's edge, not sail past it toward midnight.
      const angles = calculateArcAngles(
        new Date(2026, 3, 12, 1, 55, 0),
        new Date(2026, 3, 12, 2, 0, 0),
        periodStart,
        periodStart,
        new Date(2026, 3, 12, 2, 0, 0)
      );
      expect(angles.endAngle).toBeCloseTo(60);
      expect(angles.endAngle - angles.startAngle).toBeCloseTo(7.5);
    });

    it('pulls a widened start back to the window start rather than 0°', () => {
      // A 2°-wide window (0:56–1:00), narrower than MIN_ARC_DEGREES itself. Widening this
      // 1-minute event forward hits the window's own end and must pull the start back only to
      // the window's own start (28°) — pulling back to 0° would draw the arc into the previous
      // hour, well outside the window it was clamped to.
      const angles = calculateArcAngles(
        new Date(2026, 3, 12, 0, 58, 0),
        new Date(2026, 3, 12, 0, 59, 0),
        periodStart,
        new Date(2026, 3, 12, 0, 56, 0),
        new Date(2026, 3, 12, 1, 0, 0)
      );
      expect(angles.startAngle).toBeCloseTo(28);
      expect(angles.endAngle).toBeCloseTo(30);
    });
  });
});

describe('calculateTrueArcAngles', () => {
  const periodStart = new Date(2026, 3, 12, 0, 0, 0);

  it.each([
    { label: 'wholly inside', start: [3, 0], end: [4, 0], before: false, after: false },
    { label: 'starting before', start: [-1, 0], end: [1, 0], before: true, after: false },
    { label: 'ending after', start: [11, 0], end: [13, 0], before: false, after: true },
    { label: 'spanning the period', start: [-1, 0], end: [13, 0], before: true, after: true },
    { label: 'flush with both ends', start: [0, 0], end: [12, 0], before: false, after: false }
  ])('$label → continuesBefore=$before, continuesAfter=$after', ({ start, end, before, after }) => {
    const angles = calculateTrueArcAngles(
      new Date(2026, 3, 12, start[0], start[1], 0),
      new Date(2026, 3, 12, end[0], end[1], 0),
      periodStart
    );
    expect(angles.continuesBefore).toBe(before);
    expect(angles.continuesAfter).toBe(after);
  });

  it('reports continuesBefore/After against the window, not the period', () => {
    // The event runs 1:00–5:00, wholly inside the period, but the window is narrower than the
    // period — so relative to the window (not the period) both ends are cut off.
    const angles = calculateTrueArcAngles(
      new Date(2026, 3, 12, 1, 0, 0),
      new Date(2026, 3, 12, 5, 0, 0),
      periodStart,
      new Date(2026, 3, 12, 2, 0, 0),
      new Date(2026, 3, 12, 4, 0, 0)
    );
    expect(angles.continuesBefore).toBe(true);
    expect(angles.continuesAfter).toBe(true);
  });
});

describe('filterEventsForPeriod', () => {
  const periodStart = new Date(2026, 3, 12, 0, 0, 0);
  const periodEnd = new Date(2026, 3, 12, 12, 0, 0);

  function idsFor(events: ClockEventInput[]): string[] {
    return filterEventsForPeriod(events, periodStart, periodEnd).map((e) => e.id);
  }

  it('excludes all-day events', () => {
    const events = [
      makeEvent({ id: 'all-day', isAllDay: true }),
      makeEvent({ id: 'timed', isAllDay: false })
    ];
    expect(idsFor(events)).toEqual(['timed']);
  });

  it.each([
    { label: 'wholly inside', start: [3, 0], end: [4, 0], included: true },
    { label: 'starting before, ending inside', start: [-1, 30], end: [1, 0], included: true },
    { label: 'starting inside, ending after', start: [11, 30], end: [13, 0], included: true },
    { label: 'ending exactly at period start', start: [-2, 0], end: [0, 0], included: false },
    { label: 'starting exactly at period end', start: [12, 0], end: [13, 0], included: false },
    { label: 'wholly before', start: [-4, 0], end: [-3, 0], included: false },
    { label: 'wholly after', start: [14, 0], end: [15, 0], included: false }
  ])('$label → included=$included', ({ start, end, included }) => {
    const events = [
      makeEvent({
        id: 'x',
        startDate: new Date(2026, 3, 12, start[0], start[1], 0).toISOString(),
        endDate: new Date(2026, 3, 12, end[0], end[1], 0).toISOString()
      })
    ];
    expect(idsFor(events)).toEqual(included ? ['x'] : []);
  });

  it('returns an empty array for empty input', () => {
    expect(filterEventsForPeriod([], periodStart, periodEnd)).toEqual([]);
  });
});

describe('eventsToClockEvents', () => {
  const periodStart = new Date(2026, 3, 12, 0, 0, 0);

  it('resolves title, emoji, colour, and arc angles', () => {
    const [result] = eventsToClockEvents(
      [
        makeEvent({
          id: 'evt-1',
          title: '🟢 🎮 Game Night',
          startDate: new Date(2026, 3, 12, 3, 0, 0).toISOString(),
          endDate: new Date(2026, 3, 12, 4, 0, 0).toISOString()
        })
      ],
      periodStart
    );

    expect(result.id).toBe('evt-1');
    expect(result.cleanTitle).toBe('Game Night');
    expect(result.eventEmoji).toBe('🎮');
    expect(result.color).toBe('#22C55E');
    expect(result.startAngle).toBeCloseTo(90);
    expect(result.endAngle).toBeCloseTo(120);
    expect(result.isAllDay).toBe(false);
  });

  it('uses the event fallback colour when no colour emoji is present', () => {
    const [result] = eventsToClockEvents(
      [makeEvent({ title: 'Team Standup', fallbackColor: '#007AFF' })],
      periodStart
    );
    expect(result.color).toBe('#007AFF');
  });

  it('preserves the all-day flag rather than filtering', () => {
    const [result] = eventsToClockEvents([makeEvent({ isAllDay: true })], periodStart);
    expect(result.isAllDay).toBe(true);
  });

  it('carries the clamped ends through, so the renderer can fade them', () => {
    const [result] = eventsToClockEvents(
      [
        makeEvent({
          startDate: new Date(2026, 3, 11, 23, 0, 0).toISOString(),
          endDate: new Date(2026, 3, 12, 13, 0, 0).toISOString()
        })
      ],
      periodStart
    );
    expect(result.continuesBefore).toBe(true);
    expect(result.continuesAfter).toBe(true);
  });

  it('draws against an explicit window past the period, keeping periodStart as the angle origin', () => {
    // A rolling window reaching into the next period must not have its angle wrapped back
    // toward 0° — position still has to mean the same clock time as the unrolled period would.
    const [result] = eventsToClockEvents(
      [
        makeEvent({
          startDate: new Date(2026, 3, 12, 13, 0, 0).toISOString(),
          endDate: new Date(2026, 3, 12, 13, 30, 0).toISOString()
        })
      ],
      periodStart,
      periodStart,
      new Date(2026, 3, 12, 14, 0, 0)
    );
    expect(result.startAngle).toBeCloseTo(390);
    expect(result.endAngle).toBeCloseTo(405);
  });
});

describe('roundCoord', () => {
  it.each([
    [160.74060486414018, 160.7406],
    [160.74060486414015, 160.7406]
  ])('rounds %f to %f at the default precision', (input, expected) => {
    expect(roundCoord(input)).toBe(expected);
  });

  it.each([
    [1.23456789, 2, 1.23],
    [1.23456789, 0, 1]
  ])('rounds %f to %i decimals as %f', (input, decimals, expected) => {
    expect(roundCoord(input, decimals)).toBe(expected);
  });

  it('collapses inputs that differ only in floating-point noise', () => {
    expect(roundCoord(160.74060486414018)).toBe(roundCoord(160.74060486414015));
    expect(roundCoord(148.39668739008982)).toBe(roundCoord(148.39668739008985));
  });
});

describe('polarToCartesian', () => {
  it.each([
    [0, 100, 50],
    [90, 150, 100],
    [180, 100, 150],
    [270, 50, 100]
  ])('puts %i° at (%i, %i), measuring clockwise from the top', (angle, x, y) => {
    expect(polarToCartesian(100, 100, 50, angle)).toEqual({ x, y });
  });

  it('bounds output to four decimal places', () => {
    const p = polarToCartesian(300, 300, 244, 137);
    expect(p.x.toString().split('.')[1]?.length ?? 0).toBeLessThanOrEqual(4);
    expect(p.y.toString().split('.')[1]?.length ?? 0).toBeLessThanOrEqual(4);
  });
});

describe('describeArc', () => {
  /** Pull the large-arc flag out of the outer `A` command. */
  function largeArcFlag(path: string): string {
    return path.match(/A \d+ \d+ 0 (\d) 1 /)![1];
  }

  it('bounds every coordinate in the path to four decimal places', () => {
    const path = describeArc(300, 300, 292, 244, 90, 120);
    for (const token of path.match(/-?\d+(\.\d+)?/g) ?? []) {
      expect(token.split('.')[1]?.length ?? 0).toBeLessThanOrEqual(4);
    }
  });

  it.each([
    [90, '0'],
    [180, '0'],
    [181, '1'],
    [270, '1']
  ])('gives a %i° span a large-arc flag of %s', (span, flag) => {
    expect(largeArcFlag(describeArc(300, 300, 292, 244, 0, span))).toBe(flag);
  });

  it('closes the annular sector', () => {
    expect(describeArc(300, 300, 292, 244, 0, 90).endsWith('Z')).toBe(true);
  });
});

describe('elapsedEventIds', () => {
  const now = new Date(2026, 3, 12, 10, 0, 0);

  function endingAt(id: string, endHour: number) {
    return makeEvent({
      id,
      startDate: new Date(2026, 3, 12, endHour - 1, 0, 0).toISOString(),
      endDate: new Date(2026, 3, 12, endHour, 0, 0).toISOString()
    });
  }

  it('collects the events that have finished and no others', () => {
    const ids = elapsedEventIds(
      [endingAt('done', 9), endingAt('running', 11), endingAt('later', 15)],
      now
    );

    expect([...ids]).toEqual(['done']);
  });

  it('counts an event ending exactly now as finished', () => {
    // The boundary has to fall one way, and an arc still drawn as upcoming at its own end time
    // would be wrong for a whole render cycle.
    expect(elapsedEventIds([endingAt('flush', 10)], now).has('flush')).toBe(true);
  });

  it.each([
    ['nothing has finished', [15]],
    ['there is nothing at all', []]
  ])('reports none when %s', (_label, endHours) => {
    const events = (endHours as number[]).map((hour) => endingAt(`e${hour}`, hour));

    expect(elapsedEventIds(events, now).size).toBe(0);
  });
});

describe('hasEventInProgress', () => {
  const now = new Date(2026, 3, 12, 10, 0, 0);

  function spanning(id: string, startHour: number, endHour: number) {
    return makeEvent({
      id,
      startDate: new Date(2026, 3, 12, startHour, 0, 0).toISOString(),
      endDate: new Date(2026, 3, 12, endHour, 0, 0).toISOString()
    });
  }

  it('is true while an event straddles now', () => {
    expect(hasEventInProgress([spanning('running', 9, 11)], now)).toBe(true);
  });

  it.each([
    ['everything has finished', [spanning('done', 8, 9)]],
    ['everything is still to come', [spanning('later', 11, 12)]],
    ['there is nothing at all', []]
  ])('is false when %s', (_label, events) => {
    expect(hasEventInProgress(events as ReturnType<typeof spanning>[], now)).toBe(false);
  });

  it('counts an event starting exactly now as in progress', () => {
    expect(hasEventInProgress([spanning('starting', 10, 11)], now)).toBe(true);
  });

  it('counts an event ending exactly now as finished, not in progress', () => {
    // Matches elapsedEventIds' own boundary: the two must never both claim (or both disown) the
    // same instant, or an arc could be drawn neither live nor elapsed.
    expect(hasEventInProgress([spanning('flush', 9, 10)], now)).toBe(false);
  });

  it('ignores all-day events, which have no angle to drain', () => {
    expect(hasEventInProgress([makeEvent({ isAllDay: true })], now)).toBe(false);
  });
});
