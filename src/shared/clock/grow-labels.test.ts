import { describe, expect, it } from 'vitest';
import { type GrowthOffer, planOptionalLines } from './grow-labels';
import { type Rect, rectsOverlap } from './rect-edge';
import { type VerticalBand } from './stack-labels';

const CY = 300;
/** Wide enough that the band is never what declines a growth, except where a test narrows it. */
const WIDE: VerticalBand = { top: -1000, bottom: 1000 };

/** A card of `height` whose top edge is at `y`, overlapping horizontally with every other here. */
function card(y: number, height = 30): Rect {
  return { x: 100, y, width: 120, height };
}

/** The same card one line taller, grown about its own centre the way a real card does. */
function taller(base: Rect, by = 25): Rect {
  return { ...base, y: base.y - by / 2, height: base.height + by };
}

function offer(base: Rect, grown: Rect | null = taller(base)): GrowthOffer {
  return { base, grown };
}

function laidOut(offers: GrowthOffer[], plan: { accepted: boolean[]; nudges: number[] }): Rect[] {
  return offers.map((each, index) => {
    const rect = plan.accepted[index] ? (each.grown as Rect) : each.base;
    return { ...rect, y: rect.y + plan.nudges[index] };
  });
}

function collisions(rects: Rect[]): number {
  let count = 0;
  for (let a = 0; a < rects.length; a += 1) {
    for (let b = a + 1; b < rects.length; b += 1) {
      if (rectsOverlap(rects[a], rects[b])) count += 1;
    }
  }
  return count;
}

describe('planOptionalLines', () => {
  it('grows a card with the whole dial to itself', () => {
    const plan = planOptionalLines([offer(card(400))], CY, WIDE);

    expect(plan).toEqual({ accepted: [true], nudges: [0] });
  });

  it('offers nothing to a card that has nothing to offer', () => {
    const plan = planOptionalLines([offer(card(400), null)], CY, WIDE);

    expect(plan).toEqual({ accepted: [false], nudges: [0] });
  });

  it('leaves a lone card alone when its own growth would leave the band', () => {
    // The base card fits; one more line does not, and nothing is there to displace it against.
    const base = card(400, 30);
    const plan = planOptionalLines([offer(base)], CY, { top: 0, bottom: 440 });

    expect(plan.accepted).toEqual([false]);
  });

  it('hands back a line that displacement has made room for — the whole of #136', () => {
    // Two cards 20 units apart: they overlap at their title-only size, so #68's pass compared the
    // grown card against an un-displaced neighbour and declined. Displacement separates them, and
    // then there is room for both lines.
    const offers = [offer(card(400)), offer(card(420))];

    const plan = planOptionalLines(offers, CY, WIDE);

    expect(plan.accepted).toEqual([true, true]);
    expect(collisions(laidOut(offers, plan))).toBe(0);
  });

  it('declines the growth that would reintroduce an overlap, and keeps the one that does not', () => {
    // Room below for one extra line and no more: the band's floor is 25 units under the lower
    // card's displaced bottom edge.
    const offers = [offer(card(400)), offer(card(420))];
    const band: VerticalBand = { top: -1000, bottom: 480 };

    const plan = planOptionalLines(offers, CY, band);

    expect(plan.accepted).toEqual([true, false]);
    expect(collisions(laidOut(offers, plan))).toBe(0);
  });

  it('never leaves more collisions than the title-only layout already had', () => {
    // A pile of four in a band too short to separate them, so the layout starts with collisions
    // this pass is not there to fix. It must not add to them either.
    const offers = [offer(card(300)), offer(card(310)), offer(card(320)), offer(card(330))];
    const band: VerticalBand = { top: 200, bottom: 400 };

    const titleOnly = offers.map((each) => ({ ...each, grown: null }));
    const before = collisions(laidOut(titleOnly, planOptionalLines(titleOnly, CY, band)));

    expect(before).toBeGreaterThan(0);
    expect(collisions(laidOut(offers, planOptionalLines(offers, CY, band)))).toBeLessThanOrEqual(
      before
    );
  });

  it('measures a candidate against its neighbours at their title-only size', () => {
    // #68's rule, and the reason it survives iteration: the second card's growth is refused, so
    // the first card's acceptance cannot have been priced against a size the second never takes.
    const offers = [offer(card(400)), offer(card(430), null), offer(card(460))];

    const plan = planOptionalLines(offers, CY, WIDE);

    expect(plan.accepted[1]).toBe(false);
    expect(collisions(laidOut(offers, plan))).toBe(0);
  });

  it('takes offers in the order given, so the earlier card wins a contested gap', () => {
    // Two neighbours with room below them for one extra line between them, not two. Whichever is
    // offered first takes it — so reversing the offers reverses the winner, and the clockwise sort
    // in `analogClock` is a decision rather than an accident.
    const room: VerticalBand = { top: 280, bottom: 425 };
    const early = offer(card(340));
    const late = offer(card(380));

    expect(planOptionalLines([early, late], CY, room).accepted).toEqual([true, false]);
    expect(planOptionalLines([late, early], CY, room).accepted).toEqual([true, false]);
  });

  it('keeps every card inside the band, including one it never had to displace', () => {
    // A lone card is never part of an overlap component, so `displaceVertically` never looks at it.
    // Its grown box is still what the page's frame has to cover (#121).
    const offers = [offer(card(100)), offer(card(430))];
    const band: VerticalBand = { top: 80, bottom: 470 };

    const plan = planOptionalLines(offers, CY, band);

    for (const rect of laidOut(offers, plan)) {
      expect(rect.y).toBeGreaterThanOrEqual(band.top);
      expect(rect.y + rect.height).toBeLessThanOrEqual(band.bottom);
    }
  });

  it('settles: re-offering what it declined against its own result accepts nothing more', () => {
    // The fixed point #136 asks for, stated as the property rather than as a round count. Feeding
    // the committed sizes back in must be a no-op, or the pass stopped short of one.
    const offers = [offer(card(300)), offer(card(330)), offer(card(362)), offer(card(395))];
    const band: VerticalBand = { top: 250, bottom: 470 };

    const plan = planOptionalLines(offers, CY, band);
    const settled = offers.map((each, index) =>
      plan.accepted[index] ? { base: each.grown as Rect, grown: null } : each
    );

    expect(plan.accepted).toContain(false);
    expect(planOptionalLines(settled, CY, band).accepted).toEqual(offers.map(() => false));
  });

  it('returns one entry per offer, in order, for an empty dial', () => {
    expect(planOptionalLines([], CY, WIDE)).toEqual({ accepted: [], nudges: [] });
  });
});
