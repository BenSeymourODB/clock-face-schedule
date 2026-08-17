import { describe, expect, it } from 'vitest';
import { type ClockBox, clampLabelPosition } from './clamp-label';

// allowance = 0.10 × 600 = 60 on each axis.
// Vertical band [40, 760]; horizontal band [-40, 560].
const clockBox: ClockBox = {
  top: 100,
  bottom: 700,
  height: 600,
  left: 20,
  right: 500,
  width: 600
};

describe('clampLabelPosition', () => {
  describe('vertically', () => {
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

    it('derives the allowance from the supplied height rather than bottom minus top', () => {
      // Non-physical box: height 1000 → allowance 100 → band [0, 800].
      const oddBox: ClockBox = { ...clockBox, height: 1000 };
      expect(clampLabelPosition({ x: 0, y: -50 }, oddBox).y).toBe(0);
      expect(clampLabelPosition({ x: 0, y: 900 }, oddBox).y).toBe(800);
    });
  });

  describe('horizontally', () => {
    it.each([400, -1000, 99999])('leaves a fitting label where it is, at y %i', (y) => {
      expect(clampLabelPosition({ x: 123.456, y }, clockBox).x).toBe(123.456);
    });

    it.each([
      ['inside the band', 250, 0, 250],
      ['past the left limit', -500, 0, -40],
      ['past the right limit', 9999, 0, 560],
      // The card's edges are held inside, not just its centre — a wide card centred on the limit
      // would still hang off the side.
      ['a wide card near the left edge', -30, 100, 60],
      ['a wide card near the right edge', 550, 100, 460]
    ])('maps x %s (%i, half-width %i) to %i', (_label, x, halfWidth, expected) => {
      expect(clampLabelPosition({ x, y: 400 }, clockBox, halfWidth).x).toBeCloseTo(expected, 4);
    });

    it('centres a card too wide to fit rather than pinning it to one side', () => {
      // Half-width 400 against a 600-wide band: the limits cross, so neither edge can be
      // honoured. Spilling evenly reads far better than jamming it against an edge.
      const centred = clampLabelPosition({ x: 9999, y: 400 }, clockBox, 400);

      expect(centred.x).toBeCloseTo((clockBox.left + clockBox.right) / 2, 4);
    });
  });
});
