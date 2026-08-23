/**
 * Dropping a floating label whose event the agenda panel already names (#172).
 *
 * 39.4% of the floating labels the dial draws — 99 of 251 over a 96-pin sweep on `main` after #190,
 * and 3 of 5 at `?now=03:00&freeze=1` — carry a name that is already on screen in the panel, larger,
 * on a plain ground, off the band entirely. (Pre-#190 the same sweep measured 66 of 251, 26.3%; the
 * smaller panel body fits more cards in the column, so more labels are discharged. The plan doc
 * records both columns.) Every other proposal for #98 and #135 pays for relief with content:
 * drop the card's duration line, narrow its title, or move it away from its arc. This one pays with
 * nothing, because the information is not lost, moved or shrunk.
 *
 * **Why this does not need #98's threshold.** #98 is open on *"when a card and an arc's content
 * collide, which one moves?"*, and that question is hard because every mechanism it prices spends
 * something. For a card the panel has already discharged there is nothing to spend, so *any*
 * collision is sufficient reason and no threshold has to be chosen. That is what lets this land
 * ahead of #98 rather than behind it, which is the opposite of what #172's body assumed.
 *
 * **What is kept, and why it is not "suppress the redundant ones".** The owner's decision is to
 * suppress *on collision* rather than unconditionally, which keeps the angular anchor — the card's
 * position, which says *which arc* the name belongs to, and which the panel has no channel for.
 * Measured, that costs nothing: the two rules clear the same 20 band covers, because a card in no
 * collision is by definition covering nothing, and suppressing on collision keeps 86 of the 99
 * anchors that suppressing unconditionally throws away. (The cover count is on the pre-#190 base,
 * where the mechanisms were priced against each other; the anchor count is as shipped, on `main`.)
 *
 * Pure arithmetic over rects — no host types, so `src/shared/` compiles without the DOM lib
 * (ADR 0003) and every figure here is checkable in node.
 */
import { type Rect, rectsOverlap } from './rect-edge';

/** One candidate card, as the dial has it before any duration line or displacement is decided. */
export interface SuppressibleLabel {
  /** The event id, which is what both surfaces key their cards on. */
  id: string;
  /**
   * The card's box at its **natural** position — before `planOptionalLines` offers a duration line
   * and before `stackLabels` displaces anything.
   *
   * Measuring after the resolver would be measuring the wrong thing: only 2 of 251 cards still
   * overlap once it has run — `rectsOverlap` over the rendered rects, on either base — because it has
   * already paid for the rest in declined duration lines and vertical displacement. Suppressing first
   * is what makes this relief free rather than retrospective.
   */
  rect: Rect;
}

/**
 * Indices of the cards to drop, given the ids the panel is naming.
 *
 * A card is dropped when its event has a panel card **and** its natural rect overlaps another
 * card's. Both halves are required: the panel discharges the *name*, and the collision is what makes
 * spending the anchor worth it.
 *
 * Collisions are computed over the whole set, including cards that are themselves about to be
 * dropped. Two panel-named cards that overlap only each other are therefore both dropped — which is
 * correct, since both names are on the panel — and the result does not depend on the order they are
 * considered in. Resolving iteratively instead would keep whichever happened to be looked at first,
 * and would make the dial's output depend on the fixture's sort order.
 *
 * `panelNamed` is passed in rather than derived here so the panel's card set has exactly one
 * derivation. The dial re-deriving it from the same events would be two answers that agree today —
 * and the column holds only what fits, so they would stop agreeing the moment the panel overflowed.
 *
 * An empty `panelNamed` — a board too narrow to carry the panel (#171), or a page with none —
 * suppresses nothing, which is the safe direction: with no panel there is no other surface carrying
 * the name, and the card is the only thing naming that arc.
 */
export function labelsDischargedByPanel(
  labels: SuppressibleLabel[],
  panelNamed: ReadonlySet<string>
): Set<number> {
  const dropped = new Set<number>();
  if (panelNamed.size === 0) return dropped;

  for (let index = 0; index < labels.length; index += 1) {
    if (!panelNamed.has(labels[index].id)) continue;

    const collides = labels.some(
      (other, otherIndex) => otherIndex !== index && rectsOverlap(labels[index].rect, other.rect)
    );
    if (collides) dropped.add(index);
  }

  return dropped;
}

/**
 * A stable key for the set of ids the panel is naming, for a caller using it as a rebuild trigger.
 *
 * The dial rebuilds on a calendar minute, on an event ending, and every tick while anything is in
 * progress. The panel rebuilds when its **card set** changes, which is a different trigger and can
 * fire when none of the dial's do — the column holds only what fits, so an event entering the top of
 * it can push the last one out with no arc on the dial changing at all.
 *
 * Without this in the trigger, a label suppressed because the panel named its event stays suppressed
 * after the panel has dropped the row, and the event is then named **nowhere** — #146's defect
 * arriving as a race rather than as a policy.
 *
 * Sorted, so the key is about membership rather than the order the panel happened to lay the column
 * out in; newline-joined for `cardKey`'s reason — calendar ids carry no spaces today, but
 * `["a b", "c"]` and `["a", "b c"]` would share a space-joined key, and a collision here is a dial
 * that stops rebuilding.
 */
export function panelNamedKey(panelNamed: ReadonlySet<string>): string {
  return [...panelNamed].sort().join('\n');
}
