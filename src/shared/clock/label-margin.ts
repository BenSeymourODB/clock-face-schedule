/**
 * How much of the board's spare width the floating labels get (#30 item 1).
 *
 * The dial fills a square viewBox on a page that is wider than it is tall, and ADR 0009 allocates
 * the slack: a 180-unit panel on the right, the dial keeping the board's height and centred in what
 * remains. The renderer cannot work that out for itself — its inherited allowance is a fraction of
 * its *own* width, so it is the same on a 4K board as on a phone — so the host measures it and
 * hands it in.
 *
 * Pure arithmetic over numbers the caller reads off the DOM, so it is node-testable and carries no
 * host types: `src/shared/` compiles without the DOM lib (ADR 0003).
 */

/**
 * Width held back for the agenda panel (#36), per ADR 0009.
 *
 * Reserved before the panel exists, and the margin granted is the one the *finished* layout gives:
 * `(board − dial − panel) / 2`, because the dial re-centres in the remainder when the panel lands.
 * Today's room per side is `(board − dial) / 2`, which is 90 units more, so nothing clips before the
 * panel arrives and nothing has to narrow when it does. Holding the 180 out of one side instead
 * would grant 90 units less than the layout affords, permanently, and buy nothing.
 */
export const PANEL_RESERVE_UNITS = 180;

/**
 * The margin above which a card's usable width stops growing — ADR 0009's knee.
 *
 * > Guaranteed card width — `min(labelWidthLimit, faceClearanceLimit)` minimised over the half-dial
 * > — saturates at **155.2 units, 13 chars a line, for any margin at or above 75.4**.
 *
 * `clamp-label.ts` names the same figure from the other side: *"Above a 75.4-unit margin the face
 * becomes the binding constraint instead and the width saturates at 155.2, so no board gets more
 * than thirteen."* `panel-layout.test.ts` derives the saturation rather than trusting the number.
 *
 * It is the panel's admission test (#39): a board that cannot leave this much beside the dial is one
 * where the panel and the labels have started trading width one-for-one, which is the trade ADR 0009
 * says its 180 units must not make.
 */
export const LABEL_MARGIN_KNEE_UNITS = 75.4;

/** The box the dial is drawn into, in CSS pixels, as `getBoundingClientRect` reports it. */
export interface DrawingBox {
  width: number;
  height: number;
}

/**
 * Units of margin the labels may spend to each side, or `null` where there is nothing to measure.
 *
 * `size` is the dial's viewBox extent. The drawing is square and fits the shorter axis of its box
 * (`preserveAspectRatio` defaults to `xMidYMid meet`), so the rendered length of that shorter axis
 * against `size` is the scale everything else converts through — including `viewportWidth`, which is
 * the board's width and is what ADR 0009's allocation divides up.
 *
 * The box is not the board: on a 16:9 display it is the grid column left after `--label-frame`, so
 * it is wider than the drawing and already holds most of the margin returned here. Measuring the
 * *viewport* rather than the box is what makes this the allocation ADR 0009 decided rather than a
 * description of the padding that happens to be there.
 *
 * Returns `null` rather than a number when the box has no layout — jsdom, a hidden page, a
 * measurement taken before paint — so a caller can leave the renderer on its inherited allowance
 * instead of being handed a zero that reads as "no room at all".
 */
export function labelMarginUnits(
  box: DrawingBox,
  viewportWidth: number,
  size: number
): number | null {
  const drawn = Math.min(box.width, box.height);
  if (!(drawn > 0) || !(viewportWidth > 0) || !(size > 0)) return null;

  const boardUnits = (viewportWidth * size) / drawn;

  // Negative on a portrait or near-square board, where the reserved panel wants more width than
  // the board has spare. Zero is the honest answer to "how much of the slack is yours"; the floor
  // that stops it emptying a card belongs to `clamp-label.ts`, which owns the inherited allowance.
  return Math.max(0, (boardUnits - size - PANEL_RESERVE_UNITS) / 2);
}
