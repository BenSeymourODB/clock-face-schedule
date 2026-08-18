import { describe, expect, it } from 'vitest';
import { computeDrainFraction, computeDrainMasks } from './drain';
import { FEATHER_DEGREES } from './feather';

describe('computeDrainFraction', () => {
  it.each([
    ['a quarter in', 0, 40, 10, 0.25],
    ['halfway', 0, 40, 20, 0.5],
    ['almost done', 0, 40, 39, 0.975]
  ])('%s: reports the fraction', (_label, start, end, now, expected) => {
    expect(computeDrainFraction(start, end, now)).toBeCloseTo(expected, 6);
  });

  it.each([
    ['not yet started', 0, 40, -5],
    ['exactly at the start', 0, 40, 0],
    ['exactly at the end', 0, 40, 40],
    ['already finished', 0, 40, 50]
  ])('%s: has no partial position', (_label, start, end, now) => {
    expect(computeDrainFraction(start, end, now)).toBeUndefined();
  });

  it('has nothing to report on a zero-width event', () => {
    expect(computeDrainFraction(30, 30, 30)).toBeUndefined();
  });
});

describe('computeDrainMasks', () => {
  it('places the boundary at the fraction along the drawn arc, not the true one', () => {
    // The drawn arc can differ from the true span (MIN_ARC_DEGREES widening); the boundary must
    // track the drawn geometry it is rendered against.
    const { boundaryAngle } = computeDrainMasks(0, 100, 0.25);
    expect(boundaryAngle).toBe(25);
  });

  it('fades the fill from the boundary toward what is left', () => {
    const { fillSpan, boundaryAngle } = computeDrainMasks(0, 100, 0.5);
    expect(fillSpan.fromAngle).toBe(boundaryAngle);
    expect(fillSpan.toAngle).toBeGreaterThan(boundaryAngle);
  });

  it('fades the spent treatment from the boundary toward what is already elapsed', () => {
    const { spentSpan, boundaryAngle } = computeDrainMasks(0, 100, 0.5);
    expect(spentSpan.fromAngle).toBe(boundaryAngle);
    expect(spentSpan.toAngle).toBeLessThan(boundaryAngle);
  });

  it('uses the full feather depth when both sides have room', () => {
    const { fillSpan, spentSpan, boundaryAngle } = computeDrainMasks(0, 100, 0.5);
    expect(fillSpan.toAngle - boundaryAngle).toBeCloseTo(FEATHER_DEGREES, 6);
    expect(boundaryAngle - spentSpan.toAngle).toBeCloseTo(FEATHER_DEGREES, 6);
  });

  it('shrinks the depth, symmetrically, when the shorter side cannot carry the full feather', () => {
    // 5° spent, 95° remaining: both fades are capped by the 5°-spent side times the feather ratio.
    const { fillSpan, spentSpan, boundaryAngle } = computeDrainMasks(0, 100, 0.05);
    const depth = boundaryAngle - spentSpan.toAngle;

    expect(depth).toBeLessThan(FEATHER_DEGREES);
    expect(depth).toBeCloseTo(fillSpan.toAngle - boundaryAngle, 6);
    expect(depth).toBeCloseTo(5 * 0.35, 6);
  });

  it('never asks a fade to reach past the arc it is drawn on', () => {
    const { fillSpan, spentSpan, boundaryAngle } = computeDrainMasks(10, 20, 0.5);
    expect(fillSpan.toAngle).toBeLessThanOrEqual(20);
    expect(spentSpan.toAngle).toBeGreaterThanOrEqual(10);
    expect(boundaryAngle).toBe(15);
  });
});
