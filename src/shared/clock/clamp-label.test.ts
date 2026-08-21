import { describe, expect, it } from 'vitest';
import {
  type ClockBox,
  clampLabelPosition,
  faceClearanceLimit,
  labelWidthLimit
} from './clamp-label';

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

/** The 600-unit dial: band outer edge at 8 → 592, so the 10% allowance is 58.4 either side. */
const DIAL = {
  top: 8,
  bottom: 592,
  left: 8,
  right: 592,
  height: 584,
  width: 584
};
const CX = 300;
const CY = 300;
const FACE_RADIUS = 204.4;

describe('labelWidthLimit', () => {
  it('is widest directly above or below the dial, where the frame is symmetric', () => {
    // 350.4 either side of centre — which is why a label at twelve o'clock may be very wide.
    expect(labelWidthLimit(CX, DIAL)).toBeCloseTo(700.8, 4);
  });

  // Derived the same way the function does, so the edge cases land exactly on the boundary
  // rather than a float's width inside it.
  const ALLOWANCE = DIAL.width * 0.1;

  it.each([
    ['left allowance edge', DIAL.left - ALLOWANCE],
    ['right allowance edge', DIAL.right + ALLOWANCE],
    ['past the allowance entirely', -200]
  ])('leaves no room at the %s', (_label, x) => {
    expect(labelWidthLimit(x, DIAL)).toBe(0);
  });

  it('is symmetric about the dial centre', () => {
    expect(labelWidthLimit(CX - 120, DIAL)).toBeCloseTo(labelWidthLimit(CX + 120, DIAL), 4);
  });

  // The invariant the whole approach rests on: size a card to the limit and the clamp has nothing
  // left to do. A clamp with something to do is how a card ended up over the face (#21).
  it.each([0, 45, 90, 135, 180, 225, 270, 315])(
    'sizing to the limit makes the horizontal clamp a no-op at %i°',
    (degrees) => {
      const radians = (degrees * Math.PI) / 180;
      const position = {
        x: CX + 297.84 * Math.sin(radians),
        y: CY - 297.84 * Math.cos(radians)
      };
      const width = labelWidthLimit(position.x, DIAL);

      expect(clampLabelPosition(position, DIAL, width / 2).x).toBeCloseTo(position.x, 4);
    }
  );
});

/**
 * The host-measured allowance (#30 item 1, ADR 0009). The band-clearing locus is the fork's (#138),
 * so what is asserted here is only that a granted margin is spent and a scarce one cannot take away
 * what the page's frame already pays for.
 */
describe('labelAllowance', () => {
  const LOCUS = 297.84;
  /** Three o'clock: where the allowance binds rather than the face. */
  const AT_THREE = CX + LOCUS;

  it('is the inherited fraction of the dial when the host cannot measure', () => {
    expect(labelWidthLimit(AT_THREE, DIAL)).toBeCloseTo(105.12, 2);
  });

  it.each([
    // m units past the viewBox is m + EDGE_MARGIN past the dial's own box, which is what
    // `analog-clock.ts` converts before handing it over.
    ['16:9 as shipped', 234.5, 473.32],
    ['16:10 as shipped', 172.1, 348.52],
    ['ADR 0009 at the knee', 75.4, 155.12]
  ])('spends a %s margin at three o\'clock', (_label, margin, expected) => {
    const granted: ClockBox = { ...DIAL, labelAllowance: margin + 8 };
    expect(labelWidthLimit(AT_THREE, granted)).toBeCloseTo(expected, 2);
  });

  /**
   * The floor, and the reason it is inside the geometry rather than at the call site: a portrait
   * board's reserved panel takes more width than the board has spare, so the measurement is legitimately
   * zero — and a zero allowance gives a card at three o'clock a width of zero, which renders as an
   * empty chip where a title used to be. `--label-frame` is 51.29 units on any viewport, so the
   * inherited allowance is covered at every aspect ratio and costs nothing to keep.
   */
  it.each([0, 10, 58.3])('never falls below the inherited allowance (%i)', (allowance) => {
    const scarce: ClockBox = { ...DIAL, labelAllowance: allowance };
    expect(labelWidthLimit(AT_THREE, scarce)).toBeCloseTo(labelWidthLimit(AT_THREE, DIAL), 6);
  });

  it('widens the clamp band by the same allowance the width limit spends', () => {
    const granted: ClockBox = { ...DIAL, labelAllowance: 242.5 };

    expect(clampLabelPosition({ x: -9999, y: CY }, granted).x).toBeCloseTo(DIAL.left - 242.5, 4);
    expect(clampLabelPosition({ x: 9999, y: CY }, granted).x).toBeCloseTo(DIAL.right + 242.5, 4);
  });

  it('leaves the vertical band alone, which is the frame\'s axis and #121\'s question', () => {
    const granted: ClockBox = { ...DIAL, labelAllowance: 242.5 };

    expect(clampLabelPosition({ x: CX, y: -9999 }, granted).y).toBe(
      clampLabelPosition({ x: CX, y: -9999 }, DIAL).y
    );
    expect(clampLabelPosition({ x: CX, y: 9999 }, granted).y).toBe(
      clampLabelPosition({ x: CX, y: 9999 }, DIAL).y
    );
  });

  it('keeps sizing-to-the-limit a no-op for the clamp at every angle', () => {
    const granted: ClockBox = { ...DIAL, labelAllowance: 242.5 };

    for (let degrees = 0; degrees < 360; degrees += 15) {
      const radians = (degrees * Math.PI) / 180;
      const position = {
        x: CX + LOCUS * Math.sin(radians),
        y: CY - LOCUS * Math.cos(radians)
      };
      const width = labelWidthLimit(position.x, granted);

      expect(clampLabelPosition(position, granted, width / 2).x).toBeCloseTo(position.x, 4);
    }
  });
});

describe('faceClearanceLimit', () => {
  const CARD_HEIGHT = 79.6;

  it('imposes no limit above the dial, where a card clears the face however wide it is', () => {
    const aboveTheFace = { x: CX, y: CY - 297.84 };

    expect(faceClearanceLimit(aboveTheFace, CX, CY, FACE_RADIUS, CARD_HEIGHT)).toBe(
      Number.POSITIVE_INFINITY
    );
  });

  it('measures from the face edge when the card straddles the dial centre line', () => {
    // Level with the centre, the face blocks its full radius.
    const beside = { x: CX - 297.84, y: CY };

    expect(faceClearanceLimit(beside, CX, CY, FACE_RADIUS, CARD_HEIGHT)).toBeCloseTo(
      (297.84 - FACE_RADIUS) * 2,
      4
    );
  });

  it('binds on the diagonals, where the frame limit alone does not', () => {
    // The case that failed first: at 45° the frame leaves 279 units, and a card that wide walks
    // its inner corner into the face.
    const diagonal = { x: CX + 210.6, y: CY - 210.6 };

    expect(faceClearanceLimit(diagonal, CX, CY, FACE_RADIUS, CARD_HEIGHT)).toBeLessThan(
      labelWidthLimit(diagonal.x, DIAL)
    );
  });

  it('leaves nothing for a card whose centre is already inside the face', () => {
    expect(faceClearanceLimit({ x: CX, y: CY }, CX, CY, FACE_RADIUS, CARD_HEIGHT)).toBe(0);
  });

  it('tightens as the card grows taller, since a taller card passes closer to the face', () => {
    const upperLeft = { x: CX - 251.2, y: CY - 160.3 };
    const short = faceClearanceLimit(upperLeft, CX, CY, FACE_RADIUS, 30.5);
    const tall = faceClearanceLimit(upperLeft, CX, CY, FACE_RADIUS, 79.6);

    expect(tall).toBeLessThan(short);
  });
});
