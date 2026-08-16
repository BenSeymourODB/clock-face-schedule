import { describe, expect, it } from 'vitest';
import {
  calculateArcAngles,
  describeArc,
  eventsToClockEvents,
  filterEventsForPeriod,
  getPeriodBounds,
  getPeriodStart,
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
