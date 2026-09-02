import { describe, expect, it } from 'vitest';
import {
  SIDE_SECTOR_END,
  SIDE_SECTOR_START,
  adrBandClearingCircle,
  separationDegrees,
  sideCardAngles,
  sideForAngle,
  sideSectorBounds,
  spreadInSector
} from './side-placement';

/** The dial's own constants, so the figures below are the ones the renderer works in. */
const BAND_OUTER = 292;
const RIGHT = sideSectorBounds('right');
const LEFT = sideSectorBounds('left');

describe('sideForAngle', () => {
  it.each([
    ['twelve o’clock', 0, 'right'],
    ['one o’clock', 30, 'right'],
    ['three o’clock', 90, 'right'],
    ['just before six', 179, 'right'],
    ['six o’clock', 180, 'left'],
    ['nine o’clock', 270, 'left'],
    ['just before twelve', 359, 'left'],
    ['a second revolution', 450, 'right'],
    ['a negative bearing', -90, 'left']
  ])('puts %s on the %s', (_label, angle, side) => {
    expect(sideForAngle(angle as number)).toBe(side);
  });
});

describe('sideSectorBounds', () => {
  it('mirrors the right sector about the vertical axis', () => {
    expect(RIGHT).toEqual({ start: SIDE_SECTOR_START, end: SIDE_SECTOR_END });
    expect(LEFT).toEqual({ start: 360 - SIDE_SECTOR_END, end: 360 - SIDE_SECTOR_START });
  });

  it('keeps both sectors clear of twelve and six, which is the point of the change', () => {
    // #138's argument is that top and bottom stop being label positions at all.
    for (const { start, end } of [RIGHT, LEFT]) {
      expect(start % 180).toBeGreaterThan(0);
      expect(end % 180).toBeLessThan(180);
    }
  });
});

/** Vertical distance between two bearings on one locus — what a card actually has to clear. */
function verticalGap(radius: number, first: number, second: number): number {
  const y = (bearing: number) => radius * Math.cos((bearing * Math.PI) / 180);
  return Math.abs(y(first) - y(second));
}

describe('separationDegrees', () => {
  /**
   * The defect this function exists to fix, asserted as the shortfall the arc-length rule left. Two
   * four-line cards (104 units) separated by `height / radius` overlap by 19.2 units at the sector's
   * own edge and by 2.1 even at three o'clock — measured on review, and latent because `stackLabels`
   * was nudging it away.
   */
  it.each([
    ['at 45°, the sector edge', 45, 297.84, 19.2],
    ['at 90°, three o’clock', 90, 297.84, 2.1],
    ['at 45° on a wider locus', 45, 418, 22.1]
  ])('records what the arc-length rule left short %s', (_label, bearing, radius, shortfall) => {
    const arcRule = (104 / (radius as number)) * (180 / Math.PI);
    const achieved = verticalGap(radius as number, bearing as number, (bearing as number) + arcRule);

    expect(104 - achieved).toBeCloseTo(shortfall as number, 1);
  });

  /**
   * The guarantee: the gap clears the card's height at *every* position the sector allows, which is
   * the claim the local-slope correction could not make — at three o'clock it delivered 101.9.
   */
  it('clears the card’s height wherever in the sector the pair sits', () => {
    const gap = separationDegrees(104, 297.84);

    for (let start = SIDE_SECTOR_START; start + gap <= SIDE_SECTOR_END + 1e-9; start += 0.5) {
      expect(verticalGap(297.84, start, start + gap)).toBeGreaterThanOrEqual(104 - 1e-6);
    }
  });

  it('is the tightest gap that does, not merely a safe one', () => {
    const gap = separationDegrees(104, 297.84);

    // A hair narrower and the worst position — the midpoint nearest an end — falls short.
    const narrower = gap - 0.05;
    expect(
      verticalGap(297.84, SIDE_SECTOR_START, SIDE_SECTOR_START + narrower)
    ).toBeLessThan(104);
  });

  it('asks more than the arc-length rule, and says how much', () => {
    // 24.03° against 20.01° at the shipped locus: the price of being right at both ends, and the
    // figure the docstring quotes.
    expect(separationDegrees(104, 297.84)).toBeCloseTo(24.03, 2);
    expect((104 / 297.84) * (180 / Math.PI)).toBeCloseTo(20.01, 2);
  });

  it('prices decision 2’s wider range instead of leaving it a capacity gain', () => {
    // [30°, 150°] separates more slowly at its ends, so the same card costs more of the sector:
    // 28.88° against 24.03°, which is the figure the docstring quotes.
    expect(separationDegrees(104, 297.84, 30)).toBeCloseTo(28.88, 2);
  });

  it('shrinks as the locus moves outward', () => {
    expect(separationDegrees(104, 452)).toBeLessThan(separationDegrees(104, 297.84));
  });

  it('gives up the whole sector rather than a gap no sector can grant', () => {
    // A card taller than the sector's own vertical span cannot be separated from anything inside it.
    expect(separationDegrees(10_000, 297.84)).toBe(SIDE_SECTOR_END - SIDE_SECTOR_START);
  });

  it.each([
    ['a radius of zero', 104, 0],
    ['a card of no height', 0, 297.84]
  ])('answers zero for %s', (_label, height, radius) => {
    expect(separationDegrees(height as number, radius as number)).toBe(0);
  });
});

describe('adrBandClearingCircle', () => {
  it.each([
    // Board half-width from centre is 300 + the granted margin; margins measured in #213.
    ['16:9, margin 244.1', 544.1, 418.05],
    ['16:10, margin 175.0', 475.0, 383.5],
    ["ADR 0009's own premise, margin 143.3", 443.3, 367.65]
  ])('reproduces the ADR figure at %s', (_label, boardHalf, expected) => {
    expect(adrBandClearingCircle(BAND_OUTER, boardHalf as number)).toBeCloseTo(
      expected as number,
      2
    );
  });

  it('satisfies both constraints the ADR solves together', () => {
    const boardHalf = 544.1;
    const radius = adrBandClearingCircle(BAND_OUTER, boardHalf);
    const width = 2 * (radius - BAND_OUTER);
    // Inner edge on the band, outer edge on the board — at three o'clock, where it was solved.
    expect(radius - width / 2).toBeCloseTo(BAND_OUTER, 6);
    expect(radius + width / 2).toBeCloseTo(boardHalf, 6);
  });
});

describe('spreadInSector', () => {
  it('leaves an uncrowded card exactly where its arc is', () => {
    expect(spreadInSector([60, 110], [8, 8], 45, 135)).toEqual([60, 110]);
  });

  it('clamps a single card into the sector', () => {
    expect(spreadInSector([10], [8], 45, 135)).toEqual([45]);
    expect(spreadInSector([200], [8], 45, 135)).toEqual([135]);
  });

  it('separates a colliding pair by exactly what their heights ask, centred on their targets', () => {
    const [first, second] = spreadInSector([90, 92], [10, 10], 45, 135);
    expect(second - first).toBeCloseTo(10, 6);
    expect((first + second) / 2).toBeCloseTo(91, 6);
  });

  it('honours each pair’s own requirement rather than one gap for the dial', () => {
    // A tall card either side of a short one must not be charged the short one's separation.
    const placed = spreadInSector([90, 90, 90], [20, 4, 20], 45, 135);
    expect(placed[1] - placed[0]).toBeCloseTo(12, 6);
    expect(placed[2] - placed[1]).toBeCloseTo(12, 6);
  });

  it('slides a run inside the sector instead of letting it overhang', () => {
    const placed = spreadInSector([130, 134], [20, 20], 45, 135);
    expect(placed[0]).toBeGreaterThanOrEqual(45);
    expect(placed[placed.length - 1]).toBeLessThanOrEqual(135);
    expect(placed[1] - placed[0]).toBeCloseTo(20, 6);
  });

  it('spreads evenly across the sector once the cards cannot fit', () => {
    // Five cards each demanding 30° need 120° of a 90° sector.
    const placed = spreadInSector([50, 60, 90, 120, 130], [30, 30, 30, 30, 30], 45, 135);
    expect(placed[0]).toBeCloseTo(45, 6);
    expect(placed[placed.length - 1]).toBeCloseTo(135, 6);
    expect(placed[1] - placed[0]).toBeCloseTo(22.5, 6);
  });

  it.each([
    ['uncrowded', [50, 70, 100], [6, 6, 6]],
    ['crowded', [90, 91, 92], [16, 16, 16]],
    ['overfull', [50, 60, 90, 120, 130], [30, 30, 30, 30, 30]],
    ['pinned at the top', [40, 41, 42], [12, 12, 12]],
    ['pinned at the bottom', [140, 141, 142], [12, 12, 12]]
  ])(
    'keeps the order it was given and stays inside the sector when %s',
    (_label, targets, heights) => {
      const placed = spreadInSector(targets as number[], heights as number[], 45, 135);
      for (let i = 1; i < placed.length; i += 1) {
        expect(placed[i]).toBeGreaterThanOrEqual(placed[i - 1]);
      }
      expect(Math.min(...placed)).toBeGreaterThanOrEqual(45 - 1e-9);
      expect(Math.max(...placed)).toBeLessThanOrEqual(135 + 1e-9);
    }
  );

  it('returns nothing for no cards', () => {
    expect(spreadInSector([], [], 45, 135)).toEqual([]);
  });
});

describe('sideCardAngles', () => {
  const LOCUS = 297.84;
  const request = (anchorAngle: number, cardHeight = 8) => ({ anchorAngle, cardHeight });

  it('answers in the order it was asked, whichever side each card lands on', () => {
    const angles = sideCardAngles([request(300), request(60), request(200)], LOCUS);
    expect(angles).toHaveLength(3);
    expect(sideForAngle(angles[0])).toBe('left');
    expect(sideForAngle(angles[1])).toBe('right');
    expect(sideForAngle(angles[2])).toBe('left');
  });

  it('puts every card inside one of the two sectors — never at twelve or six', () => {
    const angles = sideCardAngles(
      [0, 15, 90, 170, 185, 250, 300, 350].map((angle) => request(angle)),
      LOCUS
    );
    for (const angle of angles) {
      const inRight = angle >= RIGHT.start - 1e-9 && angle <= RIGHT.end + 1e-9;
      const inLeft = angle >= LEFT.start - 1e-9 && angle <= LEFT.end + 1e-9;
      expect(inRight || inLeft).toBe(true);
    }
  });

  it('keeps a card that already sits in its sector exactly where it is', () => {
    expect(sideCardAngles([request(70), request(280)], LOCUS)).toEqual([70, 280]);
  });

  it('does not let a card on one side spend the other side’s room', () => {
    // Four cards crowding three o'clock and one lone card at nine: the lone one must not move.
    const angles = sideCardAngles(
      [request(88, 20), request(89, 20), request(90, 20), request(91, 20), request(270, 20)],
      LOCUS
    );
    expect(angles[4]).toBeCloseTo(270, 6);
    expect(Math.min(...angles.slice(0, 4))).toBeGreaterThanOrEqual(RIGHT.start - 1e-9);
    expect(Math.max(...angles.slice(0, 4))).toBeLessThanOrEqual(RIGHT.end + 1e-9);
  });

  it('keeps each card nearest its own arc, which even spacing would not', () => {
    // Two cards in the upper right: even spacing would drop one to 3 o'clock and strand it.
    const angles = sideCardAngles([request(50), request(62)], LOCUS);
    expect(angles[0]).toBeCloseTo(50, 6);
    expect(angles[1]).toBeCloseTo(62, 6);
  });

  /**
   * The property the `sin θ` term exists for, asserted where the renderer would feel it: two
   * four-line cards on the same bearing must end up far enough apart to clear *vertically*, at the
   * sector's shallow ends as well as at three o'clock. The arc-length rule passed every other spec
   * in this file while leaving 19.2 units of overlap here.
   */
  it.each([
    ['at the sector’s upper end', 45],
    ['at three o’clock', 90],
    ['at the sector’s lower end', 135],
    ['on the left sector’s end', 225],
    ['at nine o’clock', 270]
  ])('separates a stacked pair vertically %s', (_label, bearing) => {
    const [first, second] = sideCardAngles(
      [request(bearing as number, 104), request(bearing as number, 104)],
      LOCUS
    );

    expect(verticalGap(LOCUS, first, second)).toBeGreaterThanOrEqual(104 - 1e-9);
  });
});
