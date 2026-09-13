/**
 * Moving floating-label cards vertically so they stop overlapping each other (#30 item 2).
 *
 * A card exists because its title did not fit its arc, so two overlapping cards can leave a title
 * unreadable with no other copy of it anywhere on the dial. Measured on the shipped fixture at
 * `?now=11:00&freeze=1`, three cards pile up at the bottom of the dial with 29.47 and 9.83 units of
 * overlap — and #68's mitigation has already declined three duration lines trying to avoid it.
 *
 * Vertical rather than along the locus, which was the owner's call on #30 for simplicity, and it
 * buys the safety argument this module rests on:
 *
 * - `labelWidthLimit` depends only on `x`, so moving a card vertically cannot invalidate the width
 *   its text was wrapped to. Sizing stays upstream and nothing is re-derived.
 * - `faceClearanceLimit` depends on `y` through `|centre.y − cy|`, and is monotone in it. So a card
 *   that only ever moves *away* from the dial's horizontal centre line stays clear of the face by
 *   construction — no re-check, and no circular dependency between a card's width and its position.
 *
 * Every rule below is chosen to keep that second property true of every card that moves. Packing a
 * group about its own centre would break it: on the fixture's `11:00` pile the innermost card would
 * move 23 units toward the face against 3.6 units of spare clearance, so it is a live risk rather
 * than a theoretical one.
 */
import { type Rect, rectsOverlap } from './rect-edge';

/**
 * The band a displaced card must stay **entirely** inside — both edges, not just its centre.
 *
 * Edges, because the clamp's own vertical rule bounds a centre and lets a card's edges sit outside
 * (`clampLabelPosition` says why: horizontally a long title makes width the binding axis). That is
 * survivable for a card sitting at its natural place on the locus, where the worst overhang past the
 * 600-unit box is the locus plus a four-line card's half-height — 49.90 units. It is not survivable
 * for a displaced one: bounding the *centre* by the same band would let that card's bottom edge
 * reach 102.5 units past the box, and the page's own frame is sized from exactly this quantity
 * (#121, #115). Bounding the edges holds it at 50.4 for any card height, so the envelope the frame
 * pays for is the one the natural layout already needed.
 */
export interface VerticalBand {
  top: number;
  bottom: number;
}

/**
 * Cards that overlap, directly or through a chain of other cards.
 *
 * Transitive because separating a pair can push one of them onto a third: the set that has to be
 * laid out together is the connected component, not the colliding pair. Returns indices, so the
 * caller keeps its own ordering, and only components that actually collide — a card overlapping
 * nothing is not this pass's business.
 */
export function overlapComponents(rects: Rect[]): number[][] {
  const seen = new Set<number>();
  const components: number[][] = [];

  for (let start = 0; start < rects.length; start += 1) {
    if (seen.has(start)) continue;

    const component: number[] = [];
    const queue = [start];
    seen.add(start);

    while (queue.length > 0) {
      const index = queue.pop() as number;
      component.push(index);

      for (let other = 0; other < rects.length; other += 1) {
        if (seen.has(other) || !rectsOverlap(rects[index], rects[other])) continue;
        seen.add(other);
        queue.push(other);
      }
    }

    if (component.length > 1) components.push(component.sort((a, b) => a - b));
  }

  return components;
}

function centreOf(rect: Rect): number {
  return rect.y + rect.height / 2;
}

/**
 * Where each card in one component should sit: top edges, keyed by index.
 *
 * Cards are taken in order **outward from `cy`** and pushed only as far as they have to go to clear
 * the one before them, so a card that already had room does not move. `cy` itself divides the two
 * halves when a component has cards on both sides of it — without that divider the innermost card
 * above and the innermost card below are each their own half's anchor, and neither would move off
 * the other.
 */
function placeComponent(
  rects: Rect[],
  component: number[],
  centreY: number
): Map<number, number> {
  const below = component
    .filter((index) => centreOf(rects[index]) >= centreY)
    .sort((a, b) => centreOf(rects[a]) - centreOf(rects[b]));
  const above = component
    .filter((index) => centreOf(rects[index]) < centreY)
    .sort((a, b) => centreOf(rects[b]) - centreOf(rects[a]));

  const straddles = below.length > 0 && above.length > 0;
  const placed = new Map<number, number>();

  let floor = straddles ? centreY : Number.NEGATIVE_INFINITY;
  for (const index of below) {
    const top = Math.max(rects[index].y, floor);
    placed.set(index, top);
    floor = top + rects[index].height;
  }

  let ceiling = straddles ? centreY : Number.POSITIVE_INFINITY;
  for (const index of above) {
    const bottom = Math.min(rects[index].y + rects[index].height, ceiling);
    placed.set(index, bottom - rects[index].height);
    ceiling = bottom - rects[index].height;
  }

  return placed;
}

/**
 * How far each card should move vertically so that no two overlap, as a `dy` per input rect.
 *
 * Cards that overlap nothing are never moved, so a dial with no collision is untouched and this
 * cannot disturb a layout that was already correct.
 *
 * A component **grows to take in whatever its own packing would land on**. Separating a pile pushes
 * its outermost card further out, and that card can arrive on a bystander which was not overlapping
 * anything to begin with; the bystander joins the component and the packing runs again, so it is
 * moved along rather than sat on. The component can only grow, which is what makes that terminate.
 *
 * A component is then taken **all or nothing**. Its placement is accepted only if it leaves every
 * one of its cards wholly inside `band` and clear of every other card on the dial; otherwise it
 * is left exactly as it is today. Part-resolving is not worth having: pushing a card past the clamp
 * is how a label leaves the board (#121), and a pile that cannot be separated is the combined
 * list-label's case (#180) rather than something to approximate here. Components are independent,
 * so one that cannot be placed does not cost the others their fix.
 */
export function displaceVertically(
  rects: Rect[],
  centreY: number,
  band: VerticalBand
): number[] {
  const dy = rects.map(() => 0);
  /** Committed positions, so a later component is tested against where the earlier ones ended up. */
  const current = rects.map((rect) => ({ ...rect }));

  for (const component of overlapComponents(rects)) {
    const members = new Set(component);
    let moved = new Map<number, Rect>();

    // Bounded by the card count, since each round either finishes or adds a member.
    for (let round = 0; round <= rects.length; round += 1) {
      moved = new Map<number, Rect>();
      // Against committed positions, not natural ones: a card an earlier component already
      // moved must be reasoned about where it now sits, or this would undo that fix.
      const placed = placeComponent(current, [...members], centreY);
      for (const [index, top] of placed) moved.set(index, { ...current[index], y: top });

      const struck = current
        .map((rect, index) => ({ rect, index }))
        .filter(
          ({ rect, index }) =>
            !members.has(index) &&
            [...moved.values()].some((placedRect) => rectsOverlap(placedRect, rect))
        );
      if (struck.length === 0) break;

      for (const { index } of struck) members.add(index);
    }

    const inBand = [...moved.values()].every(
      (rect) => rect.y >= band.top && rect.y + rect.height <= band.bottom
    );

    const clear = [...moved].every(([index, rect]) =>
      current.every(
        (other, otherIndex) =>
          otherIndex === index ||
          rectsOverlap(moved.get(otherIndex) ?? other, rect) === false
      )
    );

    if (!inBand || !clear) continue;

    for (const [index, rect] of moved) {
      dy[index] = rect.y - rects[index].y;
      current[index] = rect;
    }
  }

  return dy;
}
