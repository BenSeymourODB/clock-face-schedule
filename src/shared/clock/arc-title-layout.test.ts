import { describe, expect, it } from 'vitest';
import {
  TITLE_FONT_SIZE_RATIO,
  TITLE_RADIUS_RATIO,
  TWO_LINE_MIN_SPAN_DEGREES,
  computeArcTitleLayout
} from './arc-title-layout';

const baseInput = {
  title: 'Family Game Night',
  innerRadius: 244,
  outerRadius: 292
};

describe('computeArcTitleLayout', () => {
  it.each([
    [TWO_LINE_MIN_SPAN_DEGREES - 1, 1],
    [TWO_LINE_MIN_SPAN_DEGREES, 2],
    [TWO_LINE_MIN_SPAN_DEGREES + 15, 2]
  ])('allows %i° a maximum of %i line(s)', (arcSpan, expected) => {
    expect(computeArcTitleLayout({ ...baseInput, arcSpan }).maxLines).toBe(expected);
  });

  describe('titleRadius', () => {
    it('sits TITLE_RADIUS_RATIO across the arc band from the inner radius', () => {
      const arcHeight = baseInput.outerRadius - baseInput.innerRadius;
      expect(computeArcTitleLayout({ ...baseInput, arcSpan: 60 }).titleRadius).toBe(
        baseInput.innerRadius + arcHeight * TITLE_RADIUS_RATIO
      );
    });

    it('scales linearly with the arc band thickness', () => {
      const thin = computeArcTitleLayout({
        title: 'x',
        innerRadius: 200,
        outerRadius: 220,
        arcSpan: 60
      });
      const thick = computeArcTitleLayout({
        title: 'x',
        innerRadius: 200,
        outerRadius: 280,
        arcSpan: 60
      });
      expect(thin.titleRadius).toBe(200 + 20 * TITLE_RADIUS_RATIO);
      expect(thick.titleRadius).toBe(200 + 80 * TITLE_RADIUS_RATIO);
    });
  });

  describe('titleFontSize', () => {
    it('scales with arc height by TITLE_FONT_SIZE_RATIO', () => {
      const arcHeight = baseInput.outerRadius - baseInput.innerRadius;
      const { titleFontSize } = computeArcTitleLayout({ ...baseInput, arcSpan: 60 });
      expect(titleFontSize).toBeCloseTo(arcHeight * TITLE_FONT_SIZE_RATIO, 4);
    });

    it('keeps scaling on a very thick arc rather than hitting a ceiling', () => {
      // There used to be a cap of 18 here. It meant widening the band — the entire response to
      // "it cannot be read from there" — bought a thicker arc carrying the same small text.
      const result = computeArcTitleLayout({
        title: 'x',
        innerRadius: 100,
        outerRadius: 600,
        arcSpan: 60
      });

      expect(result.titleFontSize).toBeCloseTo(500 * TITLE_FONT_SIZE_RATIO, 4);
    });
  });

  describe('didOverflow', () => {
    it('is false for a title that fits the arc budget', () => {
      const result = computeArcTitleLayout({
        title: 'Lunch',
        innerRadius: 244,
        outerRadius: 292,
        arcSpan: 60
      });
      expect(result.fit.didOverflow).toBe(false);
    });

    it('is true for a title that exceeds even the two-line budget', () => {
      const result = computeArcTitleLayout({
        title: 'the quick brown fox jumps over the lazy dog',
        innerRadius: 244,
        outerRadius: 292,
        arcSpan: 30
      });
      expect(result.fit.didOverflow).toBe(true);
    });

    it('is true for a narrow arc where the title cannot fit its single line', () => {
      const result = computeArcTitleLayout({
        title: 'Team Standup',
        innerRadius: 244,
        outerRadius: 292,
        arcSpan: 15
      });
      expect(result.maxLines).toBe(1);
      expect(result.fit.didOverflow).toBe(true);
    });
  });

  // The dial computes this once and shares it with both the arc and the floating
  // label. Were the two to compute independently and disagree, an event would render
  // its title twice or not at all — so determinism is the contract, not an incidental.
  it('is deterministic for identical inputs', () => {
    const a = computeArcTitleLayout({ ...baseInput, arcSpan: 45 });
    const b = computeArcTitleLayout({ ...baseInput, arcSpan: 45 });
    expect(a).toEqual(b);
  });
});
