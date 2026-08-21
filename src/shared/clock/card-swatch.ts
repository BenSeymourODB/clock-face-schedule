/**
 * The colour swatch a card carries before its title, and the room it takes from the text.
 *
 * A card's other two colour channels are a 20% wash and a 40% border, both over the light
 * `--card-foreground` field — so for the light half of the palette they measure ~1.00:1 and the card
 * says nothing about which arc it belongs to (#118). The emoji is stripped from a card's title and
 * the connector is covered by its own card at every dial size (#117), so the swatch is the identity
 * channel rather than a fourth copy of one.
 *
 * Here rather than in `event-card.ts` so the arithmetic is exercised in node: the card's *paint* is a
 * looking question, but where the patch sits and how much width the text loses are not.
 */
import type { Rect } from './rect-edge';

/**
 * Swatch width and the gap to the title, in viewBox units.
 *
 * From #30's list-label costing, and 8 rather than 4 because the cost is measured in characters and
 * floors to the same integer either way: at `CHAR_WIDTH_RATIO` 0.6 and the dial's 17.52 label font a
 * character is 10.512 units, so 4 + 3 and 8 + 4 both cost **one character a line** — 13 → 12 on a
 * 16:9 board and 8 → 7 on 16:10. A patch rather than a glyph, so the distance/150 rule does not
 * apply to it; it is 14.1 mm on a 4 ft board at the dial's rendered 85.4% of the height.
 */
export const SWATCH_WIDTH = 8;
export const SWATCH_GAP = 4;

/** Width a card gives up to the swatch, which is what a caller takes out of its text budget. */
export const SWATCH_RESERVE = SWATCH_WIDTH + SWATCH_GAP;

export interface CardSwatchLayout {
  /** The patch itself, inset by the card's own padding. */
  swatch: Rect;
  /** Centre of the room left for text, which is the card's centre shifted by half the reserve. */
  textCentreX: number;
}

/**
 * Place the swatch inside a card's box, and say where the text now centres.
 *
 * The swatch spans the card's full height inside the padding rather than aligning to the first line:
 * a card may be four lines tall, and a patch beside the first of them reads as belonging to that
 * line rather than to the card.
 */
export function cardSwatchLayout(
  { x, y, width, height }: Rect,
  padding: { x: number; y: number }
): CardSwatchLayout {
  return {
    swatch: {
      x: x + padding.x,
      y: y + padding.y,
      width: SWATCH_WIDTH,
      height: Math.max(0, height - padding.y * 2)
    },
    textCentreX: x + (width + SWATCH_RESERVE) / 2
  };
}
