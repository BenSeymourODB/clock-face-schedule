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
 * Vertical distance between two bearings on one locus — what a pair of cards actually has to clear.
 *
 * `2R·sin(midpoint)·sin(half the gap)`, which is the same quantity as `R(cos a − cos b)` written so
 * the two things it depends on are separate: how wide the gap is, and where in the sector it sits.
 * Exact, not the chord approximation the first version of this file carried.
 */
function verticalSpan(radius: number, from: number, to: number): number {
  const half = (((to - from) / 2) * Math.PI) / 180;
  const midpoint = ((from + to) / 2) * (Math.PI / 180);
  return Math.abs(2 * radius * Math.sin(midpoint) * Math.sin(half));
}

/**
 * Degrees of sector a card of `height` needs to itself on `radius`, anywhere in the sector.
 *
 * **Not `height / radius`, and the difference is the whole of this function.** Cards clear each other
 * on *vertical* separation, and a degree of travel along the locus is worth `R·sin θ` of it — least
 * at the sector's own ends, which is where #138's argument says cards separate fastest and its
 * *arithmetic* quietly assumed they separate uniformly. Allotting arc length instead is what the
 * first version did, and the shortfall was measured on review: two four-line cards placed at that
 * rule's minimum overlap by **19.2 units at 45° on the shipped locus**, **22.1 at R = 418**, and by
 * 2.1 even at three o'clock. `displaceVertically` was covering it — its nudges arrive here
 * through `planOptionalLines`, which calls it once per trial — so nothing rendered a visible
 * overlap: the class of latent defect a green suite hides.
 *
 * Solved rather than approximated, because the obvious correction is wrong in the other direction:
 * dividing by `sin θ` at the card's own bearing uses the slope where the pair *starts*, and the slope
 * falls away on both sides of three o'clock, so at 90° it asks 20.0° and delivers 101.9 units against
 * the 104 needed. What this returns instead is the gap that clears `height` at the **worst position
 * the sector allows** — the midpoint nearest an end, `sectorStart + Δ/2`, which by the sector's
 * symmetry about three o'clock is the same on either side. `verticalSpan` is monotone in Δ over a
 * 90° sector, so a bisection is exact to the bit rather than iterative in the sense #184 warns about.
 *
 * The price is over-separation at three o'clock — **24.03° asked where the arc rule asked 20.01°**,
 * at the shipped locus for a four-line card — and it is worth paying: capacity is not the binding
 * constraint, at **7 two-line slots a side** (10 at R = 452) against a fixture that peaks at three a
 * side, and the alternative is a rule that is right on average and wrong at both ends.
 *
 * It also prices #138's decision 2 rather than leaving it a capacity question: dropping the sector's
 * start from 45° to 30° takes the same card from 24.03° to **28.88°**, so the three extra one-line
 * slots a side that range is costed as buying are partly spent separating what is already there.
 */
export function separationDegrees(
  height: number,
  radius: number,
  sectorStart = SIDE_SECTOR_START
): number {
  if (radius <= 0 || height <= 0) return 0;

  const span = SIDE_SECTOR_END - SIDE_SECTOR_START;
  const clears = (gap: number) => verticalSpan(radius, sectorStart, sectorStart + gap) >= height;

  // The pair cannot be separated inside the sector at all — `spreadInSector` distributes evenly and
  // leaves the overlap to the displacement pass, which is the honest answer rather than a gap no
  // sector can grant.
  if (!clears(span)) return span;

  let low = 0;
  let high = span;
  for (let step = 0; step < 60; step += 1) {
    const middle = (low + high) / 2;
    if (clears(middle)) high = middle;
    else low = middle;
  }
  return high;
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

export interface BandClearingLocusParams {
  /** The band's outer edge — the circle no card may reach inside of. */
  bandOuterRadius: number;
  /** Half the dial's viewBox, which with `margin` gives the board's own edge. */
  halfViewBox: number;
  /** The board's spare width per side, as the host measured it (#30 item 1). */
  margin: number;
  /** The tallest a card may become — four lines, once a duration is offered (#183). */
  cardHeight: number;
}

/**
 * The locus at which **no card can cover the band, at any bearing the sector allows** — the curve
 * ADR 0009's three-o'clock point solution is read as and is not.
 *
 * Solved rather than scanned, which is the whole reason this can exist. An earlier version of this
 * plan recorded that a band-clearing mode "would have to solve for the radius", that iterating the
 * implicit form `R = 292 + extent(θ) + gap` never settles for 26.1% of cases (#184's whole-character
 * floor), and that a scan over the sector costs thousands of layout passes per render. All true of a
 * scan over *laid-out cards*. None of it is true here, because the widest card the frame can admit is
 * a closed form and needs no layout at all:
 *
 * ```
 * W(θ) = 2·(halfViewBox + margin − R·sin θ)        the frame limit, which binds on the outer side
 * dx    = R·sin θ − W/2 = 2R·sin θ − halfViewBox − margin
 * dy    = R·|cos θ| − cardHeight/2
 * clear = hypot(max(dx, 0), max(dy, 0)) ≥ bandOuterRadius
 * ```
 *
 * `dy` is why the ADR circle is not enough: at three o'clock it is the card's flat inner *edge* that
 * approaches the band, and away from three o'clock it is the *corner*. Solving only the first gives
 * 418.1 on a 16:9 board, which leaves a card **46.2 units inside the band** over the sector.
 *
 * Two things make this a bound rather than a prediction, both in the safe direction. `W` is the
 * widest card the frame admits, so a card carrying a short title is narrower and clears by more; and
 * `cardHeight` is the tallest a card may become, which makes `dy` smallest. Measured against the real
 * fixture the slack is about 11 units at 16:9 — the guarantee costs a little radius over the figure a
 * particular fixture needs, and buys not having to re-measure when the calendar changes.
 *
 * **The sector is the scope, and it is not the whole dial** — checked rather than assumed, because
 * `?locus=` applies to the ring too and the name would otherwise over-promise there. Swept over all
 * 360°, the solved radius still clears on 16:9 (worst 292.1 at 131.8°, inside the sector) but on
 * 16:10 the binding bearing is **43.5° — a degree and a half outside it** — where a ring card would
 * sit 0.3 units inside the band. Far too small to read as anything, and not a guarantee this
 * function makes: on the ring it is a good radius, not a clearing one.
 *
 * Returns `null` where the board cannot hold such a card at all: the radius is pushed past the
 * board's own edge, which a margin below ADR 0009's knee does. A caller falls back rather than
 * drawing off-screen.
 */
export function bandClearingLocus({
  bandOuterRadius,
  halfViewBox,
  margin,
  cardHeight,
}: BandClearingLocusParams): number | null {
  const clears = (radius: number): boolean => {
    for (let bearing = SIDE_SECTOR_START; bearing <= SIDE_SECTOR_END; bearing += 0.25) {
      const radians = (bearing * Math.PI) / 180;
      const width = 2 * (halfViewBox + margin - radius * Math.sin(radians));
      const dx = Math.max(radius * Math.sin(radians) - width / 2, 0);
      const dy = Math.max(radius * Math.abs(Math.cos(radians)) - cardHeight / 2, 0);
      if (Math.hypot(dx, dy) < bandOuterRadius) return false;
    }
    return true;
  };

  // The board's edge is the widest any card centre may sit at — past it the card is off-screen
  // whatever the band says.
  const boardEdge = halfViewBox + margin;
  if (!clears(boardEdge)) return null;

  let low = bandOuterRadius;
  let high = boardEdge;
  for (let step = 0; step < 60; step += 1) {
    const middle = (low + high) / 2;
    if (clears(middle)) high = middle;
    else low = middle;
  }
  return high;
}

export interface SideCardRequest {
  /** The arc's own bearing — where the connector points. */
  anchorAngle: number;
  /**
   * The card's drawn height in viewBox units.
   *
   * The height and not a pre-computed angle: converting one into the other needs the bearing *and*
   * the locus, and a caller that did it itself was how the `sin θ` term went missing in the first
   * place. `sideCardAngles` owns the conversion so there is one place it can be wrong.
   */
  cardHeight: number;
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
 * #138's decision 2 is choosing [45°, 135°] to avoid, and `displaceVertically` still runs
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
export function sideCardAngles(requests: readonly SideCardRequest[], radius: number): number[] {
  const angles = new Array<number>(requests.length).fill(0);

  for (const side of ['right', 'left'] as const) {
    const { start, end } = sideSectorBounds(side);
    const members = requests
      .map((request, index) => ({ request, index }))
      .filter(({ request }) => sideForAngle(request.anchorAngle) === side)
      .map(({ request, index }) => ({
        index,
        target: sectorTarget(request.anchorAngle),
        // The card's demand does not depend on where the spread ends up putting it: it is priced at
        // the worst position the sector allows, so the pass moving a card cannot invalidate it.
        height: separationDegrees(request.cardHeight, radius),
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
