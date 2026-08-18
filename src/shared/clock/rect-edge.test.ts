import { describe, expect, it } from 'vitest';
import { rectEdgeIntersection, rectsOverlap } from './rect-edge';

// 100 × 40 rect centred at (100, 100) → edges at x = 50/150, y = 80/120.
const CENTER = { x: 100, y: 100 };
const WIDTH = 100;
const HEIGHT = 40;

function edgeToward(x: number, y: number) {
  return rectEdgeIntersection(CENTER, WIDTH, HEIGHT, { x, y });
}

describe('rectEdgeIntersection', () => {
  it.each([
    ['right', 500, 100, 150, 100],
    ['left', -500, 100, 50, 100],
    ['below', 100, 500, 100, 120],
    ['above', 100, -500, 100, 80]
  ])('stops at the %s edge', (_label, towardX, towardY, expectedX, expectedY) => {
    expect(edgeToward(towardX, towardY)).toEqual({ x: expectedX, y: expectedY });
  });

  it('exits through the nearer edge when the rect is wider than it is tall', () => {
    // A 45° ray hits y = 120 first, because the rect is wider than it is tall.
    expect(edgeToward(200, 200)).toEqual({ x: 120, y: 120 });
  });

  it('returns the centre when the target coincides with it', () => {
    expect(rectEdgeIntersection(CENTER, WIDTH, HEIGHT, { ...CENTER })).toEqual(CENTER);
  });

  it('lands on the boundary, not beyond it, for a target inside the rect', () => {
    // The ray is scaled to the edge regardless of how near the target is.
    expect(edgeToward(110, 100)).toEqual({ x: 150, y: 100 });
  });

  it('is symmetric about the centre', () => {
    const right = edgeToward(500, 130);
    const left = edgeToward(-300, 70);
    expect(right.x - CENTER.x).toBeCloseTo(CENTER.x - left.x);
    expect(right.y - CENTER.y).toBeCloseTo(CENTER.y - left.y);
  });
});

describe('rectsOverlap', () => {
  const card = { x: 100, y: 100, width: 100, height: 40 };

  it.each([
    ['itself', { ...card }, true],
    ['a card fully inside it', { x: 120, y: 110, width: 20, height: 10 }, true],
    ['a card overlapping one corner', { x: 190, y: 130, width: 50, height: 50 }, true],
    ['a card clear to the right', { x: 210, y: 100, width: 50, height: 40 }, false],
    ['a card clear below', { x: 100, y: 150, width: 100, height: 40 }, false],
    // The real case: same angle, stacked vertically, which is how cards crowd on this dial.
    ['a card 9.5 units below', { x: 100, y: 149.5, width: 100, height: 40 }, false],
    ['the same card grown by a line into it', { x: 100, y: 137.2, width: 100, height: 64.5 }, true]
  ])('against %s → %s', (_label, other, expected) => {
    expect(rectsOverlap(card, other)).toBe(expected);
    // Order must not matter: the dial compares each new card against every placed one.
    expect(rectsOverlap(other, card)).toBe(expected);
  });

  it('does not count a shared edge, since cards abut all over this dial', () => {
    expect(rectsOverlap(card, { x: 200, y: 100, width: 50, height: 40 })).toBe(false);
    expect(rectsOverlap(card, { x: 100, y: 140, width: 100, height: 40 })).toBe(false);
  });
});
