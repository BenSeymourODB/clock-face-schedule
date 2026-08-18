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

  it('fades the fill toward what is left, straddling the boundary', () => {
    const { fillSpan, boundaryAngle } = computeDrainMasks(0, 100, 0.5);
    expect(fillSpan.fromAngle).toBeLessThan(boundaryAngle);
    expect(fillSpan.toAngle).toBeGreaterThan(boundaryAngle);
  });

  it('fades the spent treatment the opposite way, straddling the same boundary', () => {
    const { spentSpan, boundaryAngle } = computeDrainMasks(0, 100, 0.5);
    expect(spentSpan.fromAngle).toBeGreaterThan(boundaryAngle);
    expect(spentSpan.toAngle).toBeLessThan(boundaryAngle);
  });

  // Anchored *at* the boundary, as this was before the masks hid anything, the fill reached full
  // strength `depth` degrees past `now` and the outline `depth` before it — so at `now` neither was
  // at any strength. Rendered and measured on a 10° ramp: 50% fill 5.0° late, full fill 10° late,
  // which is 10 and 20 minutes on a 12-hour dial. Centred, the two cross at half strength on `now`.
  it.each([
    ['both sides roomy', 0, 100, 0.5],
    ['a short spent side', 0, 100, 0.05],
    ['a short remaining side', 0, 100, 0.95],
    ['an off-centre boundary on a small arc', 10, 20, 0.3]
  ])('%s: centres each ramp on the boundary, so half strength lands on now', (
    _label,
    start,
    end,
    fraction
  ) => {
    const { fillSpan, spentSpan, boundaryAngle } = computeDrainMasks(start, end, fraction);

    expect((fillSpan.fromAngle + fillSpan.toAngle) / 2).toBeCloseTo(boundaryAngle, 6);
    expect((spentSpan.fromAngle + spentSpan.toAngle) / 2).toBeCloseTo(boundaryAngle, 6);
  });

  it('uses the full feather depth when both sides have room', () => {
    const { fillSpan, spentSpan } = computeDrainMasks(0, 100, 0.5);
    expect(fillSpan.toAngle - fillSpan.fromAngle).toBeCloseTo(FEATHER_DEGREES, 6);
    expect(spentSpan.fromAngle - spentSpan.toAngle).toBeCloseTo(FEATHER_DEGREES, 6);
  });

  it('shrinks the depth, symmetrically, when the shorter side cannot carry the full feather', () => {
    // 5° spent, 95° remaining: both fades are capped by the 5°-spent side times the feather ratio.
    const { fillSpan, spentSpan } = computeDrainMasks(0, 100, 0.05);
    const depth = spentSpan.fromAngle - spentSpan.toAngle;

    expect(depth).toBeLessThan(FEATHER_DEGREES);
    expect(depth).toBeCloseTo(fillSpan.toAngle - fillSpan.fromAngle, 6);
    expect(depth).toBeCloseTo(5 * 0.35, 6);
  });

  // #71: the fades alone drained nothing. A mask built from an opaque ground plus one ramp leaves
  // everything the ramp does not reach at full strength, so each side also needs a region hidden
  // outright — measured at 65% of the spent side left fully filled on a 12° arc, and 83% on a 120°
  // one.
  it('hides the whole spent side from the fill, not just the approach to the boundary', () => {
    const { fillOccluded, fillSpan } = computeDrainMasks(20, 120, 0.5);

    // Up to the fill ramp's own opaque end, not to the boundary — a solid region reaching the
    // boundary would paint over the half of the ramp that lies on the spent side.
    expect(fillOccluded.fromAngle).toBe(fillSpan.fromAngle);
    expect(fillOccluded.toAngle).toBe(20);
  });

  it('hides the whole remaining side from the elapsed outline', () => {
    // Otherwise the part of the event that has not happened yet wears an "already over" outline.
    const { spentOccluded, spentSpan } = computeDrainMasks(20, 120, 0.5);

    expect(spentOccluded.fromAngle).toBe(spentSpan.fromAngle);
    expect(spentOccluded.toAngle).toBe(120);
  });

  it.each([
    ['barely started', 0.02, 1.6],
    ['a quarter in', 0.25, 20],
    ['halfway', 0.5, 40],
    ['almost spent', 0.98, 78.4]
  ])('%s: hides exactly the side each mask does not own, and it tracks the fraction', (
    _label,
    fraction,
    expectedSpent
  ) => {
    // 10°–90°, so the spent side is `fraction × 80°`. The old assertion here summed the two
    // regions and got 80 for every fraction, which is true of any split at all — including a NaN or
    // negative depth. These pin each side's own extent.
    const { fillOccluded, spentOccluded, fillSpan } = computeDrainMasks(10, 90, fraction);
    const half = (fillSpan.toAngle - fillSpan.fromAngle) / 2;

    expect(fillOccluded.toAngle).toBe(10);
    expect(spentOccluded.toAngle).toBe(90);
    // Each solid region is its side, less the half-ramp that side lends to the seam.
    expect(fillOccluded.fromAngle - fillOccluded.toAngle).toBeCloseTo(expectedSpent - half, 6);
    expect(spentOccluded.toAngle - spentOccluded.fromAngle).toBeCloseTo(80 - expectedSpent - half, 6);
    expect(half).toBeGreaterThan(0);
  });

  it('never asks a fade to reach past the arc it is drawn on', () => {
    const { fillSpan, spentSpan, boundaryAngle } = computeDrainMasks(10, 20, 0.5);
    expect(fillSpan.toAngle).toBeLessThanOrEqual(20);
    expect(spentSpan.toAngle).toBeGreaterThanOrEqual(10);
    expect(boundaryAngle).toBe(15);
  });
});

/**
 * A title crossing the seam changes colour where the two candidate colours cross, which is somewhere
 * along the ramp rather than on the boundary — the fill arrives gradually, and text coloured for it
 * measured 1.09:1 where it had barely begun. `textFlipCoverage` supplies the fraction; this places it
 * on the ramp the masks actually draw.
 */
describe('computeDrainTextSplit', () => {
  const masks = computeDrainMasks(0, 100, 0.5);
  const rampStart = masks.fillSpan.fromAngle;
  const depth = masks.fillSpan.toAngle - masks.fillSpan.fromAngle;

  it.each([
    ['at the ramp&apos;s opaque end', 0],
    ['a quarter along', 0.25],
    ['at the crossing yellow actually reports', 0.681],
    ['most of the way along', 0.9]
  ])('%s: measures the coverage along the ramp itself', (_label, coverage) => {
    const { live } = computeDrainTextSplit(masks, coverage);

    // Coverage is fill coverage, so 0 is where no fill has arrived — the ramp's own opaque end, half
    // a depth *before* the boundary now that the ramp straddles it. Reading it from the boundary
    // instead put every split half a ramp late.
    expect(live.fromAngle).toBeCloseTo(rampStart + coverage * depth, 6);
  });

  it('lands the split inside the ramp, never on the boundary itself', () => {
    const { live } = computeDrainTextSplit(masks, 0.681);

    expect(live.fromAngle).toBeGreaterThan(rampStart);
    expect(live.fromAngle).toBeLessThan(masks.fillSpan.toAngle);
    expect(live.fromAngle).not.toBeCloseTo(masks.boundaryAngle, 3);
  });

  it('hides the arc either side of that one split, with no gap and no overlap', () => {
    const { live, spent } = computeDrainTextSplit(masks, 0.75);

    expect(live.fromAngle).toBe(spent.fromAngle);
    // Each copy is hidden all the way to the far end of the arc it does not own.
    expect(live.toAngle).toBe(0);
    expect(spent.toAngle).toBe(100);
  });

  it('scales with the capped depth when the shorter side cannot carry a full ramp', () => {
    // 0.02 of a 100° arc leaves 2° spent, so depth is 2 × 0.35 = 0.7 rather than FEATHER_DEGREES,
    // and the whole seam — split included — has to fit inside it.
    const shallow = computeDrainMasks(0, 100, 0.02);
    const shallowDepth = shallow.fillSpan.toAngle - shallow.fillSpan.fromAngle;
    const { live } = computeDrainTextSplit(shallow, 0.681);

    expect(shallowDepth).toBeCloseTo(0.7, 6);
    expect(live.fromAngle).toBeCloseTo(shallow.fillSpan.fromAngle + 0.681 * 0.7, 6);
    expect(live.fromAngle).toBeGreaterThan(0);
    expect(live.fromAngle).toBeLessThan(100);
  });
});
