import { describe, expect, it } from 'vitest';
import {
  SIDE_SECTOR_END,
  SIDE_SECTOR_START,
  adrBandClearingCircle,
  angularHeight,
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

describe('angularHeight', () => {
  it('under-states the exact form by 0.103° at the dial’s tightest case', () => {
    // A four-line card at 17.52 units is about 104 tall; 297.84 is today's locus, the innermost
    // candidate. The docstring quotes this figure, so the test is what keeps it honest.
    const exact = 2 * Math.asin(104 / 2 / 297.84) * (180 / Math.PI);
    expect(exact - angularHeight(104, 297.84)).toBeCloseTo(0.103, 3);
  });

  it('shrinks as the locus moves outward', () => {
    expect(angularHeight(104, 452)).toBeLessThan(angularHeight(104, 297.84));
  });

  it('answers zero rather than dividing by a radius of zero', () => {
    expect(angularHeight(104, 0)).toBe(0);
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
  ])('keeps the order it was given and stays inside the sector when %s', (_label, targets, heights) => {
    const placed = spreadInSector(targets as number[], heights as number[], 45, 135);
    for (let i = 1; i < placed.length; i += 1) {
      expect(placed[i]).toBeGreaterThanOrEqual(placed[i - 1]);
    }
    expect(Math.min(...placed)).toBeGreaterThanOrEqual(45 - 1e-9);
    expect(Math.max(...placed)).toBeLessThanOrEqual(135 + 1e-9);
  });

  it('returns nothing for no cards', () => {
    expect(spreadInSector([], [], 45, 135)).toEqual([]);
  });
});

describe('sideCardAngles', () => {
  const request = (anchorAngle: number, height = 8) => ({ anchorAngle, angularHeight: height });

  it('answers in the order it was asked, whichever side each card lands on', () => {
    const angles = sideCardAngles([request(300), request(60), request(200)]);
    expect(angles).toHaveLength(3);
    expect(sideForAngle(angles[0])).toBe('left');
    expect(sideForAngle(angles[1])).toBe('right');
    expect(sideForAngle(angles[2])).toBe('left');
  });

  it('puts every card inside one of the two sectors — never at twelve or six', () => {
    const angles = sideCardAngles(
      [0, 15, 90, 170, 185, 250, 300, 350].map((angle) => request(angle))
    );
    for (const angle of angles) {
      const inRight = angle >= RIGHT.start - 1e-9 && angle <= RIGHT.end + 1e-9;
      const inLeft = angle >= LEFT.start - 1e-9 && angle <= LEFT.end + 1e-9;
      expect(inRight || inLeft).toBe(true);
    }
  });

  it('keeps a card that already sits in its sector exactly where it is', () => {
    expect(sideCardAngles([request(70), request(280)])).toEqual([70, 280]);
  });

  it('does not let a card on one side spend the other side’s room', () => {
    // Four cards crowding three o'clock and one lone card at nine: the lone one must not move.
    const angles = sideCardAngles([
      request(88, 20),
      request(89, 20),
      request(90, 20),
      request(91, 20),
      request(270, 20)
    ]);
    expect(angles[4]).toBeCloseTo(270, 6);
    expect(Math.min(...angles.slice(0, 4))).toBeGreaterThanOrEqual(RIGHT.start - 1e-9);
    expect(Math.max(...angles.slice(0, 4))).toBeLessThanOrEqual(RIGHT.end + 1e-9);
  });

  it('keeps each card nearest its own arc, which even spacing would not', () => {
    // Two cards in the upper right: even spacing would drop one to 3 o'clock and strand it.
    const angles = sideCardAngles([request(50), request(62)]);
    expect(angles[0]).toBeCloseTo(50, 6);
    expect(angles[1]).toBeCloseTo(62, 6);
  });
});
