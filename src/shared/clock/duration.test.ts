import { describe, expect, it } from 'vitest';
import { formatEventDuration } from './duration';
import { visualWidth } from './emoji';

describe('formatEventDuration', () => {
  it.each([
    [1, '1 min'],
    [5, '5 min'],
    [10, '10 min'],
    [24, '24 min'],
    [45, '45 min'],
    [59, '59 min'],
    [60, '1 hr'],
    [70, '1 hr 10'],
    [90, '1 hr 30'],
    [120, '2 hr'],
    [145, '2 hr 25'],
    [720, '12 hr']
  ])('formats %i minutes as %s', (minutes, expected) => {
    expect(formatEventDuration(minutes)).toBe(expected);
  });

  it('switches units where the dial does, at the hour', () => {
    expect(formatEventDuration(59)).toBe('59 min');
    expect(formatEventDuration(60)).toBe('1 hr');
  });

  it('rounds to the nearest whole minute', () => {
    expect(formatEventDuration(29.4)).toBe('29 min');
    expect(formatEventDuration(29.6)).toBe('30 min');
  });

  it.each([[0], [0.4], [-15], [Number.NaN], [Number.POSITIVE_INFINITY]])(
    'returns nothing for %s, which no arc should carry',
    (minutes) => {
      expect(formatEventDuration(minutes)).toBe('');
    }
  );

  // The format was chosen against a character budget, not for looks: at an arc title's font size
  // every extra character costs roughly 3° of the arc span needed to carry the string. A change
  // that widens the common cases silently shrinks how many arcs can show a duration at all.
  it.each([
    [10, 6],
    [45, 6],
    [60, 4],
    [90, 7],
    [145, 7],
    [720, 5]
  ])('keeps %i minutes within %i visual units', (minutes, width) => {
    expect(visualWidth(formatEventDuration(minutes))).toBe(width);
  });
});
