import { describe, expect, it } from 'vitest';
import { type Rect, rectsOverlap } from './rect-edge';
import { type VerticalBand, displaceVertically, overlapComponents } from './stack-labels';

const CY = 300;
/** Wide enough that the band is never what declines a placement, except where a test narrows it. */
const WIDE: VerticalBand = { top: -1000, bottom: 1000 };

/** A card of `height` whose top edge is at `y`, overlapping horizontally with every other here. */
function card(y: number, height = 30): Rect {
  return { x: 100, y, width: 120, height };
}

function moved(rects: Rect[], dy: number[]): Rect[] {
  return rects.map((rect, index) => ({ ...rect, y: rect.y + dy[index] }));
}

function anyOverlap(rects: Rect[]): boolean {
  return rects.some((rect, index) =>
    rects.some((other, otherIndex) => otherIndex !== index && rectsOverlap(rect, other))
  );
}

describe('overlapComponents', () => {
  it('chains transitively — a pair that a third card bridges is one component', () => {
    // b overlaps both a and c; a and c do not touch each other.
    const rects = [card(0), card(20), card(40)];

    expect(overlapComponents(rects)).toEqual([[0, 1, 2]]);
  });

  it.each([
    ['nothing overlapping', [card(0), card(100), card(200)], []],
    ['one pair, one loner', [card(0), card(20), card(200)], [[0, 1]]],
    [
      'two independent pairs',
      [card(0), card(20), card(200), card(220)],
      [
        [0, 1],
        [2, 3]
      ]
    ]
  ])('%s', (_name, rects, expected) => {
    expect(overlapComponents(rects)).toEqual(expected);
  });

  it('leaves a card that touches another edge-to-edge alone', () => {
    // Cards abut all over this dial; `rectsOverlap` already treats a shared boundary as clear.
    expect(overlapComponents([card(0), card(30)])).toEqual([]);
  });
});

describe('displaceVertically', () => {
  it('moves nothing when nothing overlaps', () => {
    const rects = [card(0), card(100), card(400)];

    expect(displaceVertically(rects, CY, WIDE)).toEqual([0, 0, 0]);
  });

  it('separates a pair below the centre line by pushing the lower card down', () => {
    // Both centres below cy, overlapping by 10. The upper card is the one nearer cy, so it holds.
    const rects = [card(400), card(420)];
    const dy = displaceVertically(rects, CY, WIDE);

    expect(dy[0]).toBe(0);
    expect(dy[1]).toBe(10);
    expect(anyOverlap(moved(rects, dy))).toBe(false);
  });

  it('separates a pair above the centre line by pushing the upper card up', () => {
    const rects = [card(100), card(120)];
    const dy = displaceVertically(rects, CY, WIDE);

    // The lower card is nearer cy here, so it is the one that holds still.
    expect(dy[1]).toBe(0);
    expect(dy[0]).toBe(-10);
    expect(anyOverlap(moved(rects, dy))).toBe(false);
  });

  it('separates a three-deep pile, which is the fixture case at 11:00', () => {
    const rects = [card(560), card(578), card(579)];
    const dy = displaceVertically(rects, CY, WIDE);

    expect(anyOverlap(moved(rects, dy))).toBe(false);
    // Order down the page is preserved: nothing leapfrogs its neighbour.
    const tops = moved(rects, dy).map((rect) => rect.y);
    expect(tops).toEqual([...tops].sort((a, b) => a - b));
  });

  it('splits a component that straddles the centre line at the line itself', () => {
    // Centres either side of the line — without the divider these two are each their own half's
    // anchor and neither would move off the other.
    const rects = [card(260), card(285)];
    const dy = displaceVertically(rects, CY, WIDE);

    const placed = moved(rects, dy);
    expect(anyOverlap(placed)).toBe(false);
    expect(placed[0].y + placed[0].height).toBeLessThanOrEqual(CY);
    expect(placed[1].y).toBeGreaterThanOrEqual(CY);
  });

  it.each([
    ['below the line', [card(400), card(420), card(430)]],
    ['above the line', [card(100), card(110), card(130)]],
    ['straddling it', [card(270), card(285), card(295), card(310)]]
  ])('never moves a card toward the dial centre — %s', (_name, rects) => {
    const dy = displaceVertically(rects, CY, WIDE);

    moved(rects, dy).forEach((rect, index) => {
      const before = Math.abs(rects[index].y + rects[index].height / 2 - CY);
      const after = Math.abs(rect.y + rect.height / 2 - CY);
      // The whole safety argument: `faceClearanceLimit` is monotone in this distance, so a card
      // that never approaches the centre line cannot be pushed over the face.
      expect(after).toBeGreaterThanOrEqual(before);
    });
  });

  it('leaves a component alone when separating it would leave the band', () => {
    const rects = [card(400), card(420)];
    // Room for the first card and not for the second once it has been pushed down to 430..460.
    const band = { top: -1000, bottom: 450 };

    expect(displaceVertically(rects, CY, band)).toEqual([0, 0]);
  });

  it('bounds the card by its edges, not by its centre', () => {
    // The defect this pass nearly shipped. `clampLabelPosition` bounds a centre and lets the edges
    // sit outside, which is survivable at a card's natural place on the locus — worst overhang past
    // the 600-unit box is 49.90 units — and not survivable once a card is displaced: a centre held
    // at the band's own edge puts a four-line card's bottom edge 102.5 units past the box, and the
    // page's frame is sized from that exact quantity (#121). A tall card is where the two rules
    // disagree, so it is the case worth pinning.
    // The dial's own band, and two four-line cards. Packed, the lower one would land at 554..658:
    // centre 606, inside the band, bottom edge 658, outside it. So a centre rule accepts this and
    // an edge rule declines it, which is the whole of the difference.
    const tall = 104;
    const rects = [card(450, tall), card(500, tall)];
    const band = { top: -50.4, bottom: 650.4 };
    const dy = displaceVertically(rects, CY, band);

    expect(dy).toEqual([0, 0]);
    for (const rect of moved(rects, dy)) {
      expect(rect.y + rect.height).toBeLessThanOrEqual(band.bottom);
    }
  });

  it('fixes one component even when another cannot be fixed', () => {
    // Bottom edge room for the first card below the line and not for the second.
    const tight = { top: -1000, bottom: 450 };
    const rects = [card(400), card(420), card(100), card(120)];
    const dy = displaceVertically(rects, CY, tight);

    // The pair below the line does not fit the band; the pair above it is unaffected by that.
    expect([dy[0], dy[1]]).toEqual([0, 0]);
    expect(dy[2]).toBe(-10);
    expect(dy[3]).toBe(0);
  });

  it('moves a bystander along rather than landing on it', () => {
    // 0 and 1 overlap; 2 overlaps nothing. Separating 0 and 1 pushes 1 onto 2, so 2 is taken into
    // the component and moved on down — the cascade, which a single pass over the natural overlap
    // graph would have missed.
    const rects = [card(400), card(420), card(455)];
    const dy = displaceVertically(rects, CY, WIDE);

    expect(anyOverlap(moved(rects, dy))).toBe(false);
    expect(dy[2]).toBeGreaterThan(0);
  });

  it('ignores cards that do not share horizontal extent', () => {
    // Same vertical run, different sides of the dial: `rectsOverlap` is a box test, so these are
    // not in one component and neither moves.
    const rects = [{ x: 0, y: 400, width: 80, height: 30 }, { x: 500, y: 405, width: 80, height: 30 }];

    expect(displaceVertically(rects, CY, WIDE)).toEqual([0, 0]);
  });
});
