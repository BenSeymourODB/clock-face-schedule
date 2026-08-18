import { describe, expect, it } from 'vitest';
import { computeDrainFraction, computeDrainMasks, computeDrainTextSplit } from './drain';
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

  // #71: the fades alone drained nothing. A mask built from an opaque ground plus one ramp leaves
  // everything the ramp does not reach at full strength, so each side also needs a region hidden
  // outright — measured at 65% of the spent side left fully filled on a 12° arc, and 83% on a 120°
  // one.
  it('hides the whole spent side from the fill, not just the approach to the boundary', () => {
    const { fillOccluded, boundaryAngle } = computeDrainMasks(20, 120, 0.5);

    expect(fillOccluded.fromAngle).toBe(boundaryAngle);
    expect(fillOccluded.toAngle).toBe(20);
  });

  it('hides the whole remaining side from the elapsed outline', () => {
    // Otherwise the part of the event that has not happened yet wears an "already over" outline.
    const { spentOccluded, boundaryAngle } = computeDrainMasks(20, 120, 0.5);

    expect(spentOccluded.fromAngle).toBe(boundaryAngle);
    expect(spentOccluded.toAngle).toBe(120);
  });

  it.each([
    ['barely started', 0.02],
    ['halfway', 0.5],
    ['almost spent', 0.98]
  ])('%s: the two hidden regions meet at the boundary and cover the arc between them', (
    _label,
    fraction
  ) => {
    const { fillOccluded, spentOccluded, boundaryAngle } = computeDrainMasks(10, 90, fraction);

    expect(fillOccluded.fromAngle).toBe(boundaryAngle);
    expect(spentOccluded.fromAngle).toBe(boundaryAngle);
    // No gap and no double cover: together they are the arc, split once.
    expect(boundaryAngle - fillOccluded.toAngle + (spentOccluded.toAngle - boundaryAngle)).toBeCloseTo(
      80,
      6
    );
  });

  it('never asks a fade to reach past the arc it is drawn on', () => {
    const { fillSpan, spentSpan, boundaryAngle } = computeDrainMasks(10, 20, 0.5);
    expect(fillSpan.toAngle).toBeLessThanOrEqual(20);
    expect(spentSpan.toAngle).toBeGreaterThanOrEqual(10);
    expect(boundaryAngle).toBe(15);
  });
});

/**
 * A title crossing the seam changes colour partway along the *ramp*, not at the boundary: the fill
 * has not arrived at the boundary, so text coloured for the fill sits on bare dial there (1.18:1,
 * measured). `textFlipCoverage` supplies the fraction; this places it.
 */
describe('computeDrainTextSplit', () => {
  const masks = computeDrainMasks(0, 100, 0.5);

  it('places the split that fraction of the way along the ramp, past the boundary', () => {
    const { live } = computeDrainTextSplit(masks, 0.75);
    const depth = masks.fillSpan.toAngle - masks.boundaryAngle;

    expect(live.fromAngle).toBeCloseTo(masks.boundaryAngle + 0.75 * depth, 6);
    expect(live.fromAngle).toBeGreaterThan(masks.boundaryAngle);
    expect(live.fromAngle).toBeLessThanOrEqual(masks.fillSpan.toAngle);
  });

  it('hides the arc either side of that one split, with no gap and no overlap', () => {
    const { live, spent } = computeDrainTextSplit(masks, 0.75);

    expect(live.fromAngle).toBe(spent.fromAngle);
    // Each copy is hidden all the way to the far end of the arc it does not own.
    expect(live.toAngle).toBe(0);
    expect(spent.toAngle).toBe(100);
  });

  it('keeps the split inside the ramp when the shorter side has capped its depth', () => {
    // 0.02 of a 100° arc leaves 2° spent, so the depth is capped well below FEATHER_DEGREES; the
    // split still has to land inside it rather than outside the arc.
    const shallow = computeDrainMasks(0, 100, 0.02);
    const { live } = computeDrainTextSplit(shallow, 0.679);

    expect(live.fromAngle).toBeGreaterThan(shallow.boundaryAngle);
    expect(live.fromAngle).toBeLessThan(shallow.fillSpan.toAngle);
  });
});
