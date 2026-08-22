/**
 * Keeping floating off-arc labels inside the dial's layout box.
 * Ported from next-digital-wall-calendar's `analog-clock/clamp-label.ts`.
 *
 * Vertically this holds the dial's height stable however many labels overflow. Horizontally it
 * stops a wide card running off the side and being clipped mid-word — the original clamped only
 * `y`, on the reasoning that preserving `x` keeps a label visually attached to its arc. True, but
 * a card's width grows with its title without bound, and an unreadable label attached to the
 * right arc is no better than a readable one slightly out of line.
 */

const OVERFLOW_RATIO = 0.1;

export interface ClockBox {
  /** SVG y of the top edge of the dial, including the arc band. */
  top: number;
  /** SVG y of the bottom edge of the dial, including the arc band. */
  bottom: number;
  /** SVG x of the left edge of the dial, including the arc band. */
  left: number;
  /** SVG x of the right edge of the dial, including the arc band. */
  right: number;
  /** Dial height, used to derive the vertical 10% allowance. */
  height: number;
  /** Dial width, used to derive the horizontal 10% allowance. */
  width: number;
  /**
   * Room a card's edge may use beyond `left` and `right`, per side, measured from the dial's own
   * box and **not** from the viewBox — see `AnalogClockParams.labelMargin`, which is the same
   * quantity from the viewBox and is what the ADR's figures are in.
   *
   * The inherited allowance is a fraction of the dial's own width, so it is the same on a 4K board
   * as on a phone and knows nothing about the page it is drawn on. ADR 0009 allocates the board's
   * spare width, and #30 item 1's answer is that the host measures it and hands it in: the geometry
   * stays pure and node-testable and the layout question stays with the layout.
   *
   * Absent for any caller that cannot measure — jsdom has no layout — which is the inherited
   * behaviour rather than a degraded one.
   */
  labelAllowance?: number;
}

function clamp(value: number, lower: number, upper: number): number {
  return Math.min(Math.max(value, lower), upper);
}

/**
 * The room a card's edge may use to each side, in viewBox units.
 *
 * Floored against the inherited allowance rather than taken as given, in one place so no caller can
 * forget it. A measured margin can be *smaller* than the inherited one — on a portrait board ADR
 * 0009's reserved panel wants more width than the board has spare — and an allowance of zero leaves
 * a card at three o'clock no width at all, so it renders as an empty chip. The floor is what the
 * page already pays for either way: `--label-frame: 7.3vmin` is 51.29 units on every viewport,
 * against the 50.4 past the viewBox this allowance permits.
 */
function horizontalAllowance(clockBox: ClockBox): number {
  return Math.max(clockBox.width * OVERFLOW_RATIO, clockBox.labelAllowance ?? 0);
}

/**
 * The band `clampLabelPosition` holds a card's centre inside, for a caller that has to place several
 * cards at once (#30's displacement pass).
 *
 * Derived here rather than by the caller so `OVERFLOW_RATIO` keeps one definition: two independent
 * derivations of the same allowance is how a pass ends up moving a card to a position the clamp then
 * moves again.
 */
export function labelVerticalBand(clockBox: ClockBox): { top: number; bottom: number } {
  const allowance = clockBox.height * OVERFLOW_RATIO;
  return { top: clockBox.top - allowance, bottom: clockBox.bottom + allowance };
}

/**
 * Clamp a label's centre into the dial's box plus a 10% allowance on each axis.
 *
 * `halfWidth` is the card's half-width. The vertical clamp positions the centre and lets a short
 * card's edges sit slightly outside; horizontally that is not good enough, because a long title
 * makes a card far wider than it is tall, so the card's *edges* are what get held inside.
 */
export function clampLabelPosition(
  position: { x: number; y: number },
  clockBox: ClockBox,
  halfWidth = 0
): { x: number; y: number } {
  const verticalAllowance = clockBox.height * OVERFLOW_RATIO;
  const y = clamp(
    position.y,
    clockBox.top - verticalAllowance,
    clockBox.bottom + verticalAllowance
  );

  const allowance = horizontalAllowance(clockBox);
  const leftLimit = clockBox.left - allowance + halfWidth;
  const rightLimit = clockBox.right + allowance - halfWidth;

  // A card wider than the whole allowance band cannot satisfy both edges. Centring it spills
  // evenly on both sides, which reads far better than pinning it hard against one.
  const x =
    leftLimit > rightLimit
      ? (clockBox.left + clockBox.right) / 2
      : clamp(position.x, leftLimit, rightLimit);

  return { x, y };
}

/**
 * Widest card that can sit centred at `x` without the horizontal clamp having to move it.
 *
 * Sizing a card to this and then clamping is a no-op by construction, which is the point: the
 * clamp's only remaining option for an oversized card is to pull it inward over the face (#21),
 * so the fix is to never hand it one. Callers wrap their text to this width instead.
 *
 * The room is the *nearer* of the two edges, because the card is centred and both of its sides
 * have to land inside. At 3 and 9 o'clock that is where the allowance is spent rather than the
 * face: on the inherited allowance it is 105.1 units, eight characters a line, which is what
 * `labelAllowance` exists to widen (#30 item 1). Above a 75.4-unit margin the face becomes the
 * binding constraint instead and the width saturates at 155.2, so no board gets more than thirteen.
 */
export function labelWidthLimit(x: number, clockBox: ClockBox): number {
  const allowance = horizontalAllowance(clockBox);
  const room = Math.min(
    x - (clockBox.left - allowance),
    clockBox.right + allowance - x
  );
  return Math.max(0, room * 2);
}

/**
 * Widest card centred at `centre` that stays clear of a circle of `faceRadius` about the dial.
 *
 * The frame limit above is not enough on its own: it constrains a card against the *edges of the
 * page*, and the thing #21 is about is the card reaching the clock face. Those bind in different
 * places — on the diagonals the frame leaves plenty of width and the card's inner corner walks
 * into the face anyway, since a centred card grows toward the dial as well as away from it.
 *
 * `maxHeight` is a height the card will not exceed. A taller card passes closer to the face from
 * the side, so the clearance is only sound against a height the card actually stays inside.
 *
 * Passing the *tallest* the card may grow to is the cheap way to guarantee that, and it is what
 * this function was written for: it sidesteps the circular dependency, since height comes from the
 * line count and the line count comes from the width. It also charges a card for lines it never
 * draws, which was 356 of 496 cards over a 192-state sweep (#183). `fitLabelToClearedWidth` is what
 * resolves the circularity instead — it scans that upper bound down to the smallest height the card
 * does not outgrow, and carries the termination and safety argument. This function is unchanged
 * either way: it
 * answers for the height it is handed.
 *
 * Returns `Infinity` where there is no horizontal constraint to apply: directly above or below the
 * dial the card clears the face however wide it gets, which is why a label at twelve o'clock may
 * be the full width of the page.
 */
export function faceClearanceLimit(
  centre: { x: number; y: number },
  cx: number,
  cy: number,
  faceRadius: number,
  maxHeight: number
): number {
  const verticalGap = Math.abs(centre.y - cy) - maxHeight / 2;
  if (verticalGap >= faceRadius) return Number.POSITIVE_INFINITY;

  const faceHalfWidth = Math.sqrt(faceRadius ** 2 - Math.max(0, verticalGap) ** 2);
  return Math.max(0, (Math.abs(centre.x - cx) - faceHalfWidth) * 2);
}
