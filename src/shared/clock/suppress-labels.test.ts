import { describe, expect, it } from 'vitest';

import { labelsDischargedByPanel, panelNamedKey } from './suppress-labels';

function card(id: string, x: number, y: number, width = 100, height = 40) {
  return { id, rect: { x, y, width, height } };
}

describe('labelsDischargedByPanel', () => {
  /**
   * The two halves of the owner's rule, one case each. Both are required: the panel discharges the
   * *name*, and the collision is what makes spending the card's angular anchor worth it.
   */
  it.each([
    ['named and colliding', ['a'], [0]],
    ['named but clear of everything', ['c'], []],
    ['colliding but not named', [], []]
  ])('drops a card %s', (_case, named, expected) => {
    const labels = [card('a', 0, 0), card('b', 50, 0), card('c', 500, 0)];

    expect([...labelsDischargedByPanel(labels, new Set(named))]).toEqual(expected);
  });

  /**
   * **The property that makes the result independent of the fixture's sort order.** Two panel-named
   * cards that overlap only each other are both dropped, because both names are on the panel.
   *
   * Resolving iteratively — drop one, re-test, find the other now clear — would keep whichever card
   * happened to be considered first, so the dial's output would depend on the clockwise sort that
   * `analog-clock` applies for an unrelated reason. Asserted from both orderings so a future
   * iterative rewrite fails here rather than in a screenshot.
   */
  it('drops both of a colliding pair when the panel names both, either way round', () => {
    const named = new Set(['a', 'b']);

    expect([...labelsDischargedByPanel([card('a', 0, 0), card('b', 50, 0)], named)]).toEqual([0, 1]);
    expect([...labelsDischargedByPanel([card('b', 50, 0), card('a', 0, 0)], named)]).toEqual([0, 1]);
  });

  /**
   * A card colliding with one the panel does not name is still dropped. The collision is what is
   * being relieved, and it does not matter whose card the other one is — the relief goes to the
   * card that stays.
   */
  it('drops a named card that collides with an unnamed one', () => {
    const labels = [card('named', 0, 0), card('unnamed', 50, 0)];

    expect([...labelsDischargedByPanel(labels, new Set(['named']))]).toEqual([0]);
  });

  /**
   * **The safe direction, and it is a real board rather than a hypothetical.** #171 has the panel
   * vanishing as the board approaches square, and ADR 0009's narrow-display fallback is still
   * undesigned — so panel-less boards exist today, chosen by nobody. With no panel there is no other
   * surface carrying the name, and a suppressed card would leave the arc anonymous.
   */
  it('suppresses nothing when the panel is not up', () => {
    const labels = [card('a', 0, 0), card('b', 50, 0)];

    expect(labelsDischargedByPanel(labels, new Set()).size).toBe(0);
  });

  /** Touching edges are not an overlap — `rectsOverlap`'s own rule, asserted at the seam. */
  it('does not drop a card that merely abuts another', () => {
    const labels = [card('a', 0, 0, 100, 40), card('b', 100, 0, 100, 40)];

    expect(labelsDischargedByPanel(labels, new Set(['a', 'b'])).size).toBe(0);
  });
});

describe('panelNamedKey', () => {
  /**
   * Membership, not order. The panel lays its column out in time order and re-sorts it as events
   * come and go, so a key that moved with the order would rebuild the whole dial for a reordering
   * that suppresses exactly the same cards.
   */
  it('is the same key for the same members in a different order', () => {
    expect(panelNamedKey(new Set(['b', 'a']))).toBe(panelNamedKey(new Set(['a', 'b'])));
  });

  /**
   * The collision `cardKey` is newline-joined to avoid, asserted here too: a key collision is a dial
   * that stops rebuilding, which is the staleness this key exists to prevent.
   */
  it('separates members that a space-joined key would confuse', () => {
    expect(panelNamedKey(new Set(['a b', 'c']))).not.toBe(panelNamedKey(new Set(['a', 'b c'])));
  });

  it('distinguishes an empty panel from a panel naming one event', () => {
    expect(panelNamedKey(new Set())).not.toBe(panelNamedKey(new Set(['a'])));
  });
});
