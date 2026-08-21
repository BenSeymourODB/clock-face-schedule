/**
 * Choosing which floating-label cards may carry their optional line, once displacement has had its
 * say (#136).
 *
 * Two passes decide a card's shape and its place, and before this they ran in the wrong order to
 * cooperate. #68 declines a card's duration line wherever the taller box would land on another
 * card, comparing against **un-displaced** rects because that was all there was when it was
 * written; #134 then moves whatever still overlaps apart. A duration declined to avoid a collision
 * that displacement goes on to resolve is event information given up for nothing — and #35 put the
 * duration on the card precisely because `MIN_ARC_DEGREES` flattens ten minutes and fifteen into
 * the same 7.5°.
 *
 * Reordering the two does not work: displacement needs the rects, the rects need the line count,
 * and the line count is what the duration pass decides, so either order leaves one pass reasoning
 * about geometry the other is about to change. What settles it is iterating to a fixed point —
 * offer, re-displace, offer again — which terminates because every round strictly increases the
 * number of accepted lines and the card count bounds that.
 */
import { type Rect, rectsOverlap } from './rect-edge';
import { type VerticalBand, displaceVertically } from './stack-labels';

/**
 * One card, at both the sizes it could be drawn at.
 *
 * Deliberately two laid-out rects rather than a line count and a font size: the optional line
 * changes the height the card is *cleared* against, which can change how its title wraps and
 * therefore its width too, so only the caller that owns the text can say what the grown card
 * measures. This module knows nothing about durations — just that one of the two rects is optional.
 */
export interface GrowthOffer {
  /** The card at the size it is guaranteed: title only. */
  base: Rect;
  /** The same card carrying its optional line, or `null` where it has none to offer. */
  grown: Rect | null;
}

export interface GrowthPlan {
  /** True where the optional line was accepted, indexed as the offers were given. */
  accepted: boolean[];
  /** Vertical displacement per card, for the sizes `accepted` settles on. */
  nudges: number[];
}

/** `a` and `b` collide, as an index pair a set can hold. */
function pairKey(a: number, b: number): string {
  return `${a}:${b}`;
}

function collidingPairs(rects: Rect[]): string[] {
  const pairs: string[] = [];
  for (let a = 0; a < rects.length; a += 1) {
    for (let b = a + 1; b < rects.length; b += 1) {
      if (rectsOverlap(rects[a], rects[b])) pairs.push(pairKey(a, b));
    }
  }
  return pairs;
}

function displaced(rects: Rect[], nudges: number[]): Rect[] {
  return rects.map((rect, index) => ({ ...rect, y: rect.y + nudges[index] }));
}

function insideBand(rects: Rect[], band: VerticalBand): boolean {
  return rects.every((rect) => rect.y >= band.top && rect.y + rect.height <= band.bottom);
}

/**
 * Which cards may grow, and where every card ends up once they have.
 *
 * Offers are taken **in the order given**, which `analogClock` sorts clockwise — the order a reader
 * scans the dial, and the order the existing passes already use. It decides the outcome whenever
 * two candidates want the same room, so it is stated rather than fallen into.
 *
 * An offer is accepted when the layout it produces satisfies both of:
 *
 * - **No new overlapping pair.** Not *no overlaps*: a pile displacement cannot separate is #30's
 *   combined-label case and is not this pass's to fix, so the test is that the colliding pairs
 *   after the offer are a subset of the ones before it. A growth that resolves nothing and breaks
 *   nothing is still worth taking; one that trades a collision for a different collision is not.
 * - **Every card wholly inside `band`.** `displaceVertically` refuses a component it cannot place
 *   inside the band, but a card overlapping nothing is never displaced and so is never checked —
 *   and the page's frame is sized from exactly this envelope (#121, #115). Checking the whole trial
 *   layout keeps that true by construction rather than by the fixture happening not to reach it.
 *
 * #68's own rule carries over and generalises: a candidate is measured against its neighbours at
 * **the sizes committed so far**, so accepting a line here can never force one on anybody else —
 * an undecided neighbour is still at its title-only size, which is the worst it will be.
 */
export function planOptionalLines(
  offers: GrowthOffer[],
  centreY: number,
  band: VerticalBand
): GrowthPlan {
  const accepted = offers.map(() => false);
  let sizes = offers.map((offer) => offer.base);
  let nudges = displaceVertically(sizes, centreY, band);
  let collisions = new Set(collidingPairs(displaced(sizes, nudges)));

  // An acceptance changes the layout every later candidate is measured against, and it can change
  // which cards share a component — so a decline is not final until a whole round makes none.
  // Bounded by the offer count: a round either accepts something, leaving strictly fewer to offer,
  // or ends the loop.
  for (let round = 0; round < offers.length; round += 1) {
    let grew = false;

    offers.forEach((offer, index) => {
      if (accepted[index] || offer.grown === null) return;

      const trial = sizes.slice();
      trial[index] = offer.grown;
      const trialNudges = displaceVertically(trial, centreY, band);
      const placed = displaced(trial, trialNudges);

      if (!insideBand(placed, band)) return;
      if (collidingPairs(placed).some((pair) => !collisions.has(pair))) return;

      sizes = trial;
      nudges = trialNudges;
      collisions = new Set(collidingPairs(placed));
      accepted[index] = true;
      grew = true;
    });

    if (!grew) break;
  }

  return { accepted, nudges };
}
