/**
 * Vertical clamp for floating off-arc labels.
 * Ported from next-digital-wall-calendar's `analog-clock/clamp-label.ts`.
 *
 * Keeps the dial's layout height stable no matter how many labels overflow. X is
 * deliberately preserved — the label slides vertically rather than being re-projected
 * around the circle, so it stays visually attached to its arc.
 */

const VERTICAL_OVERFLOW_RATIO = 0.1;

export interface ClockBox {
  /** SVG y of the top edge of the dial, including the arc band. */
  top: number;
  /** SVG y of the bottom edge of the dial, including the arc band. */
  bottom: number;
  /** Dial height used to derive the 10% allowance. */
  height: number;
}

/** Clamp `position.y` into `[top − 0.10×height, bottom + 0.10×height]`, inclusive. */
export function clampLabelPosition(
  position: { x: number; y: number },
  clockBox: ClockBox
): { x: number; y: number } {
  const allowance = clockBox.height * VERTICAL_OVERFLOW_RATIO;
  const upperLimit = clockBox.top - allowance;
  const lowerLimit = clockBox.bottom + allowance;
  return { x: position.x, y: Math.min(Math.max(position.y, upperLimit), lowerLimit) };
}
