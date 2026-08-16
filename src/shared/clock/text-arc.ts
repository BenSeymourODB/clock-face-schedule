/**
 * Baseline path for curved arc text.
 * Extracted from next-digital-wall-calendar's `event-arc.tsx`.
 */
import { polarToCartesian } from './clock-utils';

/**
 * SVG path for a single arc used as a `<textPath>` baseline (not a donut).
 *
 * On the bottom half of the dial the path is emitted end→start with a
 * counter-clockwise sweep, so the glyphs sit right-side-up and read left-to-right
 * instead of upside down.
 */
export function describeTextArc(
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number
): string {
  const midAngle = (startAngle + endAngle) / 2;
  const isBottomHalf = midAngle > 90 && midAngle < 270;

  const fromAngle = isBottomHalf ? endAngle : startAngle;
  const toAngle = isBottomHalf ? startAngle : endAngle;

  const start = polarToCartesian(cx, cy, radius, fromAngle);
  const end = polarToCartesian(cx, cy, radius, toAngle);
  const arcSpan = Math.abs(endAngle - startAngle);
  const largeArcFlag = arcSpan > 180 ? 1 : 0;
  const sweepFlag = isBottomHalf ? 0 : 1;

  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} ${sweepFlag} ${end.x} ${end.y}`;
}
