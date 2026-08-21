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
import { type Rect } from './rect-edge';
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

/**
 * How much of one card the other buries. Zero for cards that clear each other, and for cards that
 * merely abut — a shared boundary is not an overlap, and this dial draws cards edge to edge.
 *
 * Area rather than a boolean, because the thing being protected is *buried text*: a pile the
 * displacement pass cannot separate already overlaps, and a rule that only asked "is this pair
 * still colliding" would let every card in it grow and double the depth. Measured on a six-card
 * pile at six o'clock, that took the overlaps from 27–30 units to 52–54.
 */
function overlapArea(a: Rect, b: Rect): number {
  const across = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const down = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return across > 0 && down > 0 ? across * down : 0;
}

/** One entry per pair of cards, in a fixed order, so two layouts compare element by element. */
function overlapAreas(rects: Rect[]): number[] {
  const areas: number[] = [];
  for (let a = 0; a < rects.length; a += 1) {
    for (let b = a + 1; b < rects.length; b += 1) areas.push(overlapArea(rects[a], rects[b]));
  }
  return areas;
}

function displaced(rects: Rect[], nudges: number[]): Rect[] {
  return rects.map((rect, index) => ({ ...rect, y: rect.y + nudges[index] }));
}

/** How far a card reaches past `band`, on either side. Zero for one wholly inside it. */
function overhang(rect: Rect, band: VerticalBand): number {
  return Math.max(0, band.top - rect.y) + Math.max(0, rect.y + rect.height - band.bottom);
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
 * - **No pair of cards buries more of each other than it already did.** Not *no overlaps*: a pile
 *   displacement cannot separate is #30's combined-label case and is not this pass's to fix. But
 *   "no *new* colliding pair" is too weak — inside such a pile every pair already collides, so it
 *   would wave every line through and double the depth. Comparing the overlapped **area** per pair
 *   covers both: a new collision goes from zero to positive, and a deeper one from positive to
 *   larger. A growth that leaves every pair no worse off is still worth taking.
 * - **No card further outside `band` than it already was.** `displaceVertically` refuses a component
 *   it cannot place inside the band, but a card overlapping nothing is never displaced and so is
 *   never checked — and the page's frame is sized from exactly this envelope (#121, #115). Stated
 *   as "no worse" rather than "wholly inside" for the same reason as the collisions: the natural
 *   layout's own worst overhang is 49.90 units against a band of 50.4, so a card sitting a hair
 *   outside it is reachable, and a flat rule would then decline every line on the dial and say
 *   nothing about why.
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
  let placement = displaced(sizes, nudges);
  let buried = overlapAreas(placement);
  let overhangs = placement.map((rect) => overhang(rect, band));

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
      const trialOverhangs = placed.map((rect) => overhang(rect, band));
      const trialBuried = overlapAreas(placed);

      if (trialOverhangs.some((reach, card) => reach > overhangs[card])) return;
      if (trialBuried.some((area, pair) => area > buried[pair])) return;

      sizes = trial;
      nudges = trialNudges;
      buried = trialBuried;
      overhangs = trialOverhangs;
      accepted[index] = true;
      grew = true;
    });

    if (!grew) break;
  }

  return { accepted, nudges };
}
