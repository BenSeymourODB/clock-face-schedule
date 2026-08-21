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
 * From #30's list-label costing, which chose 8 over 4 because the cost is measured in characters and
 * floors to the same integer either way: at `CHAR_WIDTH_RATIO` 0.6 and the dial's 17.52 label font a
 * character is 10.512 units, so 4 + 3 and 8 + 4 both cost **one character a line** — 13 → 12 on a
 * 16:9 board and 8 → 7 on 16:10. A patch rather than a glyph, so the distance/150 rule does not
 * apply to it; it is 14.1 mm on a 4 ft board at the dial's rendered 85.4% of the height.
 *
 * **"One character a line" is the per-line cost, and rendering says it is not the whole of it.** A
 * title sitting on a wrap boundary buys a whole extra *line*, and there the two widths part company.
 * Swept over every half hour on both scales — 251 cards — counting wrapped title lines:
 *
 * | | title lines | ellipsized |
 * | --- | --- | --- |
 * | before the swatch | 384 | 33 |
 * | 4 + 3 | 398 | 36 |
 * | **8 + 4, as decided** | **421** | 36 |
 *
 * So the narrow version costs 14 lines and the wide one 37, against #30's arithmetic that they cost
 * the same. Both figures are honest and the difference is real: #30 priced them against ADR 0009's
 * band-clearing widths (151.3 and 98.0 units), and today's cards are bound by `faceClearanceLimit`
 * at 186.88, where the two reserves floor differently. ⚫ Staff Debrief at `?now=03:00` is the visible
 * case — two lines at 4 + 3, three at 8 + 4. The duration count is 208 either way.
 *
 * Kept at 8 because the width is #118's decision and not this module's; the measurement is on that
 * issue, and moving it is these two constants.
 */
export const SWATCH_WIDTH = 8;
export const SWATCH_GAP = 4;

/** Width a card gives up to the swatch, which is what a caller takes out of its text budget. */
export const SWATCH_RESERVE = SWATCH_WIDTH + SWATCH_GAP;

export interface CardSwatchLayout {
  /** The patch itself, inset by the card's own padding. */
  swatch: Rect;
  /**
   * Centre of the room left for text: the card's centre shifted by half the reserve.
   *
   * It is only *clear* of the patch if the caller sized the card with `SWATCH_RESERVE` included —
   * which is the contract, and `floatingLabel` keeps it. A card sized to its text alone leaves a
   * line's ink 2 units over the patch and hard against the far border, because centring cannot make
   * room that the width does not contain. Stated here rather than defended against: the alternative
   * is this function silently returning a centre the text is too wide for either way.
   */
  textCentreX: number;
}

/**
 * Place the swatch inside a card's box, and say where the text now centres.
 *
 * The swatch spans the card's full height inside the padding rather than aligning to the first line:
 * a card may be four lines tall, and a patch beside the first of them reads as belonging to that
 * line rather than to the card.
 *
 * Both extents are clamped to the room the padding leaves, so the patch cannot be painted outside
 * the card it belongs to. Neither clamp binds for any card `floatingLabel` produces — its narrowest
 * is 24 units — and they exist because the next caller is #39's agenda card, whose widths come from
 * a panel rather than from this geometry.
 */
export function cardSwatchLayout(
  { x, y, width, height }: Rect,
  padding: { x: number; y: number }
): CardSwatchLayout {
  return {
    swatch: {
      x: x + padding.x,
      y: y + padding.y,
      width: Math.max(0, Math.min(SWATCH_WIDTH, width - padding.x * 2)),
      height: Math.max(0, height - padding.y * 2)
    },
    textCentreX: x + (width + SWATCH_RESERVE) / 2
  };
}
