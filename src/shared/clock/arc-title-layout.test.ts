import { describe, expect, it } from 'vitest';
import {
  TITLE_FONT_SIZE_RATIO,
  TITLE_LINE_OFFSET_RATIO,
  TITLE_RADIUS_RATIO,
  TWO_LINE_MIN_SPAN_DEGREES,
  computeArcTitleLayout,
  fitDurationLine
} from './arc-title-layout';
import { arcCharBudget } from './fit-title';

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

describe('fitDurationLine', () => {
  const OUTER = 292;
  const BAND = OUTER * 0.26;
  const RING_GAP = Math.max(2, BAND * 0.06);
  /** The halo, the widest stroke the renderer draws on an arc's outline — sized from the band. */
  const HALO = BAND * 0.12;

  /** One ring of a `depth`-deep cluster on the 600-unit dial, outermost first. */
  function ring(depth: number) {
    const gap = depth > 1 ? RING_GAP : 0;
    const thickness = (BAND - (depth - 1) * gap) / depth;
    const innerRadius = OUTER - thickness;

    return {
      innerRadius,
      outerRadius: OUTER,
      titleRadius: innerRadius + thickness * TITLE_RADIUS_RATIO,
      fontSize: thickness * TITLE_FONT_SIZE_RATIO,
      edgeStrokeWidth: HALO,
      titleLine: 'Lunch'
    };
  }

  const loneArc = ring(1);

  it('returns the formatted duration when the arc can carry it', () => {
    expect(fitDurationLine({ ...loneArc, durationMinutes: 120, arcSpan: 60 })).toBe('2 hr');
    expect(fitDurationLine({ ...loneArc, durationMinutes: 145, arcSpan: 60 })).toBe('2 hr 25');
  });

  it('returns nothing when the string exceeds the budget at its own radius', () => {
    // 7 units of "2 hr 25" against a 10° arc, whose budget at the second line's radius is 3.
    const lineRadius = loneArc.titleRadius - loneArc.fontSize * TITLE_LINE_OFFSET_RATIO;
    expect(arcCharBudget(10, lineRadius, loneArc.fontSize)).toBeLessThan(7);
    expect(fitDurationLine({ ...loneArc, durationMinutes: 145, arcSpan: 10 })).toBeUndefined();
  });

  // The two lines straddle the band's centre, so the *same* string on the same arc can fit one and
  // not the other. Budgeting at the title's own radius would silently overrun the inner line.
  it("budgets against the inner radius, not the title's own", () => {
    const wide = { ...loneArc, durationMinutes: 145, arcSpan: 21 };

    expect(arcCharBudget(21, wide.titleRadius, wide.fontSize)).toBeGreaterThanOrEqual(7);
    expect(fitDurationLine(wide)).toBeUndefined();
  });

  // Adding this line displaces the title onto the opposite radius, and which one that is flips with
  // the half of the dial — so on the lower half a title fitted at the centre is moved *inward* onto
  // a 4.6% smaller budget. Measuring only the duration would let the title overrun the arc it was
  // measured against, and the two mirror-image arcs would disagree about whether it fits.
  it('refuses when the title itself would not fit the radius it is displaced onto', () => {
    const arcSpan = 33;
    const innerBudget = arcCharBudget(
      arcSpan,
      loneArc.titleRadius - loneArc.fontSize * TITLE_LINE_OFFSET_RATIO,
      loneArc.fontSize
    );
    // A title one character past what the inner line can carry, and a duration well within it.
    const titleLine = 'x'.repeat(innerBudget + 1);

    expect(fitDurationLine({ ...loneArc, titleLine, durationMinutes: 120, arcSpan })).toBeUndefined();
    expect(
      fitDurationLine({ ...loneArc, titleLine: titleLine.slice(1), durationMinutes: 120, arcSpan })
    ).toBe('2 hr');
  });

  it.each([[0], [0.2], [-30]])('returns nothing for a %s-minute event', (durationMinutes) => {
    expect(fitDurationLine({ ...loneArc, durationMinutes, arcSpan: 60 })).toBeUndefined();
  });

  // No compact fallback by design: one format across the whole dial, or nothing on this arc.
  it('never abbreviates to fit', () => {
    expect(fitDurationLine({ ...loneArc, durationMinutes: 145, arcSpan: 12 })).toBeUndefined();
  });

  /**
   * The radial gate, and the reason it exists. An elapsed arc's outline is sized from the whole
   * *band* so its weight does not thin with overlap depth (#26); the text is sized from this arc's
   * own *ring*. Pushing a one-line title onto the two-line radii closes the gap between them, and
   * on a crowded cluster it closes it completely — 0.03 units at three deep, and −1.35 at four.
   * Rendering the fixture at 04:15 is what found this: "🎮 Game Time / 1 hr 30" sat on the elapsed
   * outline of its own arc.
   */
  describe('clearing what is stroked on the ring edges', () => {
    it.each([
      [1, '2 hr'],
      [2, '2 hr'],
      [3, undefined],
      [4, undefined]
    ])('at %i deep → %s', (depth, expected) => {
      expect(fitDurationLine({ ...ring(depth), durationMinutes: 120, arcSpan: 60 })).toBe(expected);
    });

    it('admits a three-deep ring once nothing is stroked on its edges', () => {
      // Proves the gate is about the stroke and not about the ring being thin: the same ring with
      // no outline on it has room for both lines.
      expect(
        fitDurationLine({ ...ring(3), edgeStrokeWidth: 0, durationMinutes: 120, arcSpan: 60 })
      ).toBe('2 hr');
    });

    it('checks both edges, not just the outward one', () => {
      // The stack is symmetric about titleRadius, so a title pushed off-centre fails on whichever
      // side it was pushed toward. Neither is more forgiving than the other.
      const centred = ring(1);
      const shiftedIn = { ...centred, titleRadius: centred.innerRadius + centred.fontSize * 0.4 };
      const shiftedOut = { ...centred, titleRadius: centred.outerRadius - centred.fontSize * 0.4 };

      expect(fitDurationLine({ ...shiftedIn, durationMinutes: 120, arcSpan: 60 })).toBeUndefined();
      expect(fitDurationLine({ ...shiftedOut, durationMinutes: 120, arcSpan: 60 })).toBeUndefined();
    });
  });
});
