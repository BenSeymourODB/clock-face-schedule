import { describe, expect, it } from 'vitest';
import {
  TITLE_EDGE_CLEARANCE,
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

  /**
   * The clearance nothing used to check (#67). An elapsed arc's outline is sized from the whole
   * band, deliberately (#26), while the text is sized from this arc's own ring — two quantities that
   * move independently, compared against each other nowhere. At the 0.12 halo #27 retired, a
   * two-line stack three deep cleared the stroke by 0.03 units and four deep by −1.35; at today's
   * 0.07 outline it clears by 1.93 and 0.55, so the only thing standing between the text and the
   * stroke is a constant that changed for an unrelated reason.
   *
   * These cases assert the property rather than the numbers: whatever the caller strokes on the
   * ring's edges, both lines stay `TITLE_EDGE_CLEARANCE` clear of it.
   */
  describe('clearing what is stroked on the ring edges', () => {
    /** One ring of a `depth`-deep cluster on a dial of `size`, as `analog-clock.ts` derives it. */
    function ring(size: number, depth: number) {
      const outerRadius = size / 2 - 8;
      const band = outerRadius * 0.26;
      const gap = depth > 1 ? Math.max(2, band * 0.06) : 0;
      const thickness = (band - (depth - 1) * gap) / depth;

      return {
        innerRadius: outerRadius - thickness,
        outerRadius,
        // The elapsed outline: `ELAPSED_BORDER_RATIO` of the band, capped by the ring, floored at 1.
        edgeStrokeWidth: Math.max(1, Math.min(band * 0.07, thickness * 0.4))
      };
    }

    /** How far the outward and inward lines fall short of the stroke's near edge. */
    function clearances(shape: ReturnType<typeof ring>, title: string, arcSpan: number) {
      const { titleRadius, titleFontSize, lineOffset, maxLines } = computeArcTitleLayout({
        ...shape,
        title,
        arcSpan
      });
      const reach = (maxLines === 2 ? lineOffset : 0) + titleFontSize / 2;
      const strokeReach = shape.edgeStrokeWidth / 2;

      return {
        outward: shape.outerRadius - strokeReach - (titleRadius + reach),
        inward: titleRadius - reach - (shape.innerRadius + strokeReach),
        titleFontSize
      };
    }

    const depths = [1, 2, 3, 4];
    const sizes = [300, 600, 900];
    const cases = sizes.flatMap((size) => depths.map((depth): [number, number] => [size, depth]));

    it.each(cases)('at size %i, %i deep', (size, depth) => {
      const { outward, inward } = clearances(ring(size, depth), 'Study Skills and Revision', 60);

      expect(outward).toBeGreaterThanOrEqual(TITLE_EDGE_CLEARANCE);
      expect(inward).toBeGreaterThanOrEqual(TITLE_EDGE_CLEARANCE);
    });

    it('holds under the 0.12 halo #27 retired, which the ratio alone did not', () => {
      // The stroke is the caller's to choose and has been half again this wide inside this repo's
      // own history, so the guarantee has to survive a change to it rather than depend on one.
      const shape = ring(600, 3);
      const halo = { ...shape, edgeStrokeWidth: (shape.outerRadius * 0.26) * 0.12 };

      expect(clearances(halo, 'Study Skills and Revision', 60).outward).toBeGreaterThanOrEqual(
        TITLE_EDGE_CLEARANCE
      );
    });

    it('holds for a single line on an arc too narrow for two', () => {
      const shape = { ...ring(600, 4), edgeStrokeWidth: 12 };
      const { outward, inward } = clearances(shape, 'Study', TWO_LINE_MIN_SPAN_DEGREES - 1);

      expect(outward).toBeGreaterThanOrEqual(TITLE_EDGE_CLEARANCE);
      expect(inward).toBeGreaterThanOrEqual(TITLE_EDGE_CLEARANCE);
    });

    it.each([[1], [2], [3]])(
      'leaves the font at the ring ratio where the stroke leaves room (%i deep)',
      (depth) => {
        const shape = ring(600, depth);
        const arcHeight = shape.outerRadius - shape.innerRadius;

        expect(clearances(shape, 'Study Skills and Revision', 60).titleFontSize).toBeCloseTo(
          arcHeight * TITLE_FONT_SIZE_RATIO,
          2
        );
      }
    );

    it('takes the font no lower than the stroke demands', () => {
      // Four deep at size 600 is the case that binds: 4.13 units of usable half-height against a
      // stack wanting 4.58. Yielding more than that would cost legibility for nothing.
      const shape = ring(600, 4);
      const arcHeight = shape.outerRadius - shape.innerRadius;
      const usableHalf = arcHeight / 2 - (shape.edgeStrokeWidth / 2 + TITLE_EDGE_CLEARANCE);
      const { titleFontSize } = clearances(shape, 'Study Skills and Revision', 60);

      expect(titleFontSize).toBeLessThan(arcHeight * TITLE_FONT_SIZE_RATIO);
      expect(titleFontSize).toBeCloseTo(usableHalf / (TITLE_LINE_OFFSET_RATIO + 0.5), 1);
    });

    it('keeps lineOffset at TITLE_LINE_OFFSET_RATIO of whatever font it resolved', () => {
      // The renderer draws the stack at this offset, so a font the cap moved and an offset derived
      // from the uncapped one would put the lines back where they started.
      const shape = ring(600, 4);
      const layout = computeArcTitleLayout({ ...shape, title: 'Study Skills', arcSpan: 60 });

      expect(layout.lineOffset).toBeCloseTo(layout.titleFontSize * TITLE_LINE_OFFSET_RATIO, 6);
    });

    it('is a no-op when nothing is stroked on the edges', () => {
      const shape = ring(600, 4);
      const arcHeight = shape.outerRadius - shape.innerRadius;
      const bare = computeArcTitleLayout({ ...shape, edgeStrokeWidth: 0, title: 'x', arcSpan: 60 });

      expect(bare.titleFontSize).toBeCloseTo(arcHeight * TITLE_FONT_SIZE_RATIO, 2);
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
  /** The elapsed outline, the widest stroke the renderer draws on an arc's own outline. */
  const OUTLINE = BAND * 0.07;

  /** One ring of a `depth`-deep cluster on the 600-unit dial, outermost first. */
  function ring(depth: number) {
    const gap = depth > 1 ? RING_GAP : 0;
    const thickness = (BAND - (depth - 1) * gap) / depth;
    const innerRadius = OUTER - thickness;

    return {
      innerRadius,
      outerRadius: OUTER,
      bandThickness: BAND,
      titleRadius: innerRadius + thickness * TITLE_RADIUS_RATIO,
      fontSize: thickness * TITLE_FONT_SIZE_RATIO,
      edgeStrokeWidth: OUTLINE,
      titleLine: 'Lunch'
    };
  }

  /** The same ring, with the band pretended down to it, so only the radial gate is in play. */
  function ringAlone(depth: number) {
    const shape = ring(depth);
    return { ...shape, bandThickness: shape.outerRadius - shape.innerRadius };
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
   * The legibility gate. Title text is `TITLE_FONT_SIZE_RATIO` of the *ring*, so dividing the band
   * by overlap depth takes it below the size the dial deliberately chooses for text a room has to
   * read (a floating label's 17.52 units): 21.26 on a lone arc, 9.99 two deep, 6.24 three deep. The
   * title is drawn small anyway because a name is worth having; a redundant channel is not, and
   * rendering the fixture's three-deep cluster showed 6.24-unit text to be a smear rather than words.
   */
  describe('needing the band to itself', () => {
    it.each([
      [1, '2 hr'],
      [2, undefined],
      [3, undefined],
      [4, undefined]
    ])('at %i deep → %s', (depth, expected) => {
      expect(fitDurationLine({ ...ring(depth), durationMinutes: 120, arcSpan: 60 })).toBe(expected);
    });

    it.each([[2], [3]])('at %i deep the title itself is still well under the label font', (depth) => {
      // The measurement the gate rests on, pinned so a change to either ratio has to face it.
      expect(ring(depth).fontSize).toBeLessThan(292 * 0.06);
      expect(ring(1).fontSize).toBeGreaterThan(292 * 0.06);
    });
  });

  /**
   * The radial gate, which is about not drawing text on a stroke and moves independently of the
   * legibility one. An elapsed arc's outline is sized from the whole *band* so its weight does not
   * thin with overlap depth (#26); the text is sized from this arc's own *ring*. Pushing a one-line
   * title onto the two-line radii closes the gap between them — to 1.93 units three deep and 0.55
   * four deep at today's 0.07 outline, and to **0.03** three deep at the 0.12 the neutral halo used
   * before #27 retired it. Rendering the fixture at 04:15 with that halo still in place is what found
   * it: "🎮 Game Time / 1 hr 30" sat on the elapsed outline of its own arc.
   */
  describe('clearing what is stroked on the ring edges', () => {
    it.each([
      [1, '2 hr'],
      [2, '2 hr'],
      [3, '2 hr'],
      [4, undefined]
    ])('at %i deep, band aside → %s', (depth, expected) => {
      expect(fitDurationLine({ ...ringAlone(depth), durationMinutes: 120, arcSpan: 60 })).toBe(
        expected
      );
    });

    it('would have refused a three-deep ring under the halo #27 retired', () => {
      // The regression this gate was written for, kept as a case because the stroke it measures is
      // the caller's to choose and could widen again.
      expect(
        fitDurationLine({
          ...ringAlone(3),
          edgeStrokeWidth: BAND * 0.12,
          durationMinutes: 120,
          arcSpan: 60
        })
      ).toBeUndefined();
    });

    it('is about the stroke, not about the ring being thin', () => {
      // The same four-deep ring that fails above passes with nothing stroked on its edges.
      expect(fitDurationLine({ ...ringAlone(4), durationMinutes: 120, arcSpan: 60 })).toBeUndefined();
      expect(
        fitDurationLine({ ...ringAlone(4), edgeStrokeWidth: 0, durationMinutes: 120, arcSpan: 60 })
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
