/**
 * Where a floating label's *card* sits when cards are confined to two side arcs instead of being
 * spaced round a ring (#138).
 *
 * The dial's two budgets are mismatched and that is the whole of the argument: at twelve and six a
 * card has the page's full width and two cards there cannot be separated at all (`dy/dθ = 0`), while
 * at three and nine they separate fastest and there is no width. Confining cards to the sides spends
 * the budget that exists where it exists.
 *
 * **This is a spike.** #138's three decisions — sector assignment, the angular range, and the gap
 * term — are answered by looking at what this draws, not by this module. What is implemented here is
 * the issue's own stated *default* for each, so the pictures show the proposal rather than a variant
 * of it.
 *
 * Angles are the dial's own: degrees, 0° at twelve o'clock, increasing clockwise.
 */

/**
 * The sector a card may occupy on the right of the dial, mirrored on the left.
 *
 * #138's decision 2, taking its stated first choice: [45°, 135°] spans y 42…558 at today's locus, so
 * it fits the 600-unit box exactly. [30°, 150°] buys three more one-line cards a side and puts the
 * end cards 33.5 units outside it — worth reaching for only if capacity binds, and the issue's
 * capacity table says fourteen two-line slots against a fixture that peaks at five.
 */
export const SIDE_SECTOR_START = 45;
export const SIDE_SECTOR_END = 135;

export type DialSide = 'right' | 'left';

/** An angle reduced to `[0, 360)`. */
function normalise(angle: number): number {
  return ((angle % 360) + 360) % 360;
}

/**
 * Which side sector an arc's card belongs to — the right half to the right, the left to the left.
 *
 * #138's decision 1, taking its stated default. Twelve o'clock goes right and six goes left, which
 * is arbitrary at exactly those two bearings and is the clockwise reading everywhere else.
 */
export function sideForAngle(angle: number): DialSide {
  return normalise(angle) < 180 ? 'right' : 'left';
}

/** The sector's bounds on one side, in the dial's own angle space. */
export function sideSectorBounds(side: DialSide): { start: number; end: number } {
  return side === 'right'
    ? { start: SIDE_SECTOR_START, end: SIDE_SECTOR_END }
    : { start: 360 - SIDE_SECTOR_END, end: 360 - SIDE_SECTOR_START };
}

/**
 * The bearing a card would take if nothing else were on the dial — its own arc's, pulled into the
 * nearest sector.
 *
 * Exported because the renderer needs it before `sideCardAngles` can run: a card's angular height
 * comes from the card, and the card has to be laid out somewhere to have one.
 */
export function sectorTarget(angle: number): number {
  const { start, end } = sideSectorBounds(sideForAngle(angle));
  return Math.min(Math.max(normalise(angle), start), end);
}

/**
 * How much of the sector a card of `height` occupies at `radius`, in degrees.
 *
 * The chord approximation rather than `2·asin(h/2R)`. Measured at the tightest case the dial reaches
 * — a four-line card, 104 units, on today's 297.84 locus — the two differ by **0.103°**, and the
 * chord is the *smaller*, so this under-states what a card needs rather than over-stating it. At
 * 5.20 units of vertical travel per degree that is half a unit of card, and the exact form would
 * still be an approximation of the real requirement: a card is a rectangle, so what it needs to clear
 * its neighbour depends on both bearings and not on one. The spread pass below is a separation rule,
 * not a proof of non-overlap; the vertical nudges `planOptionalLines` returns, bounded by
 * `labelVerticalBand`, remain the thing that resolves what it leaves overlapping.
 */
export function angularHeight(height: number, radius: number): number {
  if (radius <= 0) return 0;
  return (height / radius) * (180 / Math.PI);
}

/**
 * ADR 0009's band-clearing circle, generalised over the board rather than restated.
 *
 * The ADR solves "the card's inner edge is on the band" and "its outer edge is on the board" together
 * at three o'clock: `R = bandOuter + W/2` and `R + W/2 = boardHalf`. Subtracting one from the other
 * removes `W` entirely and leaves the **midpoint of the band's outer edge and the board's edge** —
 * which is why the ADR's `W = m + 8` carries an 8 that is `EDGE_MARGIN` rather than a tolerance.
 *
 * It is a three-o'clock point solution and the brainstorm says so: away from three o'clock a card's
 * *corner* reaches inward and this circle re-enters the band. It is on the table as a candidate
 * because it is the widest of the three (19 characters a line at the measured 16:9 grant against the
 * ring's 12), not because it clears anything.
 */
export function adrBandClearingCircle(bandOuterRadius: number, boardHalfWidth: number): number {
  return (bandOuterRadius + boardHalfWidth) / 2;
}

export interface SideCardRequest {
  /** The arc's own bearing — where the connector points. */
  anchorAngle: number;
  /** Degrees the card needs to itself, from `angularHeight`. */
  angularHeight: number;
}

/**
 * Isotonic regression under L2 with equal weights — the largest non-decreasing sequence closest to
 * `targets`. Pool-adjacent-violators, which is linear and exact.
 */
function isotonic(targets: readonly number[]): number[] {
  const blocks: { sum: number; count: number }[] = [];

  for (const target of targets) {
    let block = { sum: target, count: 1 };
    while (blocks.length > 0) {
      const previous = blocks[blocks.length - 1];
      if (previous.sum / previous.count <= block.sum / block.count) break;
      blocks.pop();
      block = { sum: previous.sum + block.sum, count: previous.count + block.count };
    }
    blocks.push(block);
  }

  const fitted: number[] = [];
  for (const block of blocks) {
    for (let i = 0; i < block.count; i += 1) fitted.push(block.sum / block.count);
  }
  return fitted;
}

/**
 * Bearings for one sector's cards: as close to where each card's own arc is as the others allow.
 *
 * `targets` must be sorted ascending, and the result is the nearest sequence to them that keeps
 * every neighbouring pair `(h_i + h_{i+1})/2` apart and the whole run inside `[lo, hi]`. Solved
 * rather than iterated: subtracting each card's accumulated separation turns the minimum-gap
 * constraint into plain monotonicity, which is what isotonic regression answers exactly.
 *
 * **An uncrowded card therefore does not move**, which is the property that matters — a card beside
 * its own arc is how a viewer pairs the two, and even spacing throws that away at every card count.
 * A full sector degrades to even spacing on its own, because the constraints leave nothing else.
 *
 * Where the cards cannot fit at all the pass spreads them evenly across the sector and lets them
 * overlap. Deliberate: the alternative is pushing cards outside the sector, which is the overhang
 * #138's decision 2 is choosing [45°, 135°] to avoid, and the vertical nudge pass still runs
 * afterwards.
 */
export function spreadInSector(
  targets: readonly number[],
  heights: readonly number[],
  lo: number,
  hi: number
): number[] {
  if (targets.length === 0) return [];
  if (targets.length === 1) return [Math.min(Math.max(targets[0], lo), hi)];

  const offsets: number[] = [0];
  for (let i = 1; i < targets.length; i += 1) {
    offsets.push(offsets[i - 1] + (heights[i - 1] + heights[i]) / 2);
  }
  const needed = offsets[offsets.length - 1];

  if (needed > hi - lo) {
    const step = (hi - lo) / (targets.length - 1);
    return targets.map((_target, index) => lo + index * step);
  }

  const fitted = isotonic(targets.map((target, index) => target - offsets[index]));
  return fitted.map((value, index) =>
    Math.min(Math.max(value, lo), hi - needed) + offsets[index]
  );
}

/**
 * Card bearings for a whole dial's overflowing labels, in the order they were handed in.
 *
 * Order within a sector is *angular* and not chronological, and the difference is recorded because
 * #138 states both as if they were one thing: "ordered by time down each side" and "matches the
 * existing clockwise sort" contradict each other on the left half, where the clockwise sort runs
 * bottom-to-top. Angular order is the one that keeps each card nearest its own arc, which is the
 * cost decision 1 names.
 */
export function sideCardAngles(requests: readonly SideCardRequest[]): number[] {
  const angles = new Array<number>(requests.length).fill(0);

  for (const side of ['right', 'left'] as const) {
    const { start, end } = sideSectorBounds(side);
    const members = requests
      .map((request, index) => ({ request, index }))
      .filter(({ request }) => sideForAngle(request.anchorAngle) === side)
      .map(({ request, index }) => ({
        index,
        target: sectorTarget(request.anchorAngle),
        height: request.angularHeight,
      }))
      .sort((a, b) => a.target - b.target);

    const placed = spreadInSector(
      members.map((member) => member.target),
      members.map((member) => member.height),
      start,
      end
    );
    members.forEach((member, position) => {
      angles[member.index] = placed[position];
    });
  }

  return angles;
}
