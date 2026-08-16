import { describe, expect, it } from 'vitest';
import { clampLabelPosition } from './clamp-label';

// allowance = 0.10 × 600 = 60 → band is [40, 760].
const clockBox = { top: 100, bottom: 700, height: 600 };

describe('clampLabelPosition', () => {
  it.each([
    ['inside the band', 400, 400],
    ['at the upper limit', 40, 40],
    ['at the lower limit', 760, 760],
    ['just above the upper limit', 39, 40],
    ['just below the lower limit', 761, 760],
    ['far above', -500, 40],
    ['far below', 9999, 760]
  ])('maps y %s (%i) to %i', (_label, y, expected) => {
    expect(clampLabelPosition({ x: 250, y }, clockBox).y).toBe(expected);
  });

  it.each([400, -1000, 99999])('preserves x exactly when y is %i', (y) => {
    expect(clampLabelPosition({ x: 123.456, y }, clockBox).x).toBe(123.456);
  });

  it('derives the allowance from the supplied height rather than bottom minus top', () => {
    // Non-physical box: height 1000 → allowance 100 → band [0, 800].
    const oddBox = { top: 100, bottom: 700, height: 1000 };
    expect(clampLabelPosition({ x: 0, y: -50 }, oddBox).y).toBe(0);
    expect(clampLabelPosition({ x: 0, y: 900 }, oddBox).y).toBe(800);
  });
});
