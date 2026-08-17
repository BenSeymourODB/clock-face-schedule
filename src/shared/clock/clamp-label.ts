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
}

function clamp(value: number, lower: number, upper: number): number {
  return Math.min(Math.max(value, lower), upper);
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

  const horizontalAllowance = clockBox.width * OVERFLOW_RATIO;
  const leftLimit = clockBox.left - horizontalAllowance + halfWidth;
  const rightLimit = clockBox.right + horizontalAllowance - halfWidth;

  // A card wider than the whole allowance band cannot satisfy both edges. Centring it spills
  // evenly on both sides, which reads far better than pinning it hard against one.
  const x =
    leftLimit > rightLimit
      ? (clockBox.left + clockBox.right) / 2
      : clamp(position.x, leftLimit, rightLimit);

  return { x, y };
}
