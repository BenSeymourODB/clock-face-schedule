import { describe, expect, it } from 'vitest';
import { FEATHER_DEGREES, computeArcFeathers } from './feather';

const contained = { startAngle: 30, endAngle: 90, continuesBefore: false, continuesAfter: false };

describe('computeArcFeathers', () => {
  it('leaves an arc alone when the period cut neither end', () => {
    expect(computeArcFeathers(contained)).toEqual({ start: undefined, end: undefined });
  });

  it('fades inward from the leading boundary', () => {
    const { start, end } = computeArcFeathers({ ...contained, continuesBefore: true });
    expect(start).toEqual({ fromAngle: 30, toAngle: 30 + FEATHER_DEGREES });
    expect(end).toBeUndefined();
  });

  it('fades inward from the trailing boundary, which runs anticlockwise', () => {
    const { start, end } = computeArcFeathers({ ...contained, continuesAfter: true });
    expect(end).toEqual({ fromAngle: 90, toAngle: 90 - FEATHER_DEGREES });
    expect(start).toBeUndefined();
  });

  it('fades both ends of an event that spans the whole period', () => {
    const feathers = computeArcFeathers({
      startAngle: 0,
      endAngle: 360,
      continuesBefore: true,
      continuesAfter: true
    });
    expect(feathers.start).toEqual({ fromAngle: 0, toAngle: FEATHER_DEGREES });
    expect(feathers.end).toEqual({ fromAngle: 360, toAngle: 360 - FEATHER_DEGREES });
  });

  // The arc that most needs to be seen is the one starting now, which is the one on the boundary.
  it.each([
    ['a wide arc takes the fixed depth', 60, FEATHER_DEGREES],
    ['the ratio and the fixed depth agree', 28.5715, FEATHER_DEGREES],
    ['a narrow arc keeps most of itself', 7.5, 2.625],
    ['a hairline arc fades proportionally', 2.5, 0.875]
  ])('%s: a %s° arc fades over %s°', (_label, arcSpan, expected) => {
    const { start } = computeArcFeathers({
      startAngle: 0,
      endAngle: arcSpan,
      continuesBefore: true,
      continuesAfter: false
    });
    expect(start?.toAngle).toBeCloseTo(expected, 4);
  });

  it('never leaves an arc entirely transparent, even feathered at both ends', () => {
    const arcSpan = 7.5;
    const { start, end } = computeArcFeathers({
      startAngle: 0,
      endAngle: arcSpan,
      continuesBefore: true,
      continuesAfter: true
    });
    // Fully opaque core, between where the leading fade finishes and the trailing one begins.
    expect((end?.toAngle ?? 0) - (start?.toAngle ?? 0)).toBeGreaterThan(0);
  });

  it('has nothing to fade on a zero-width arc', () => {
    expect(
      computeArcFeathers({
        startAngle: 45,
        endAngle: 45,
        continuesBefore: true,
        continuesAfter: true
      })
    ).toEqual({});
  });
});
