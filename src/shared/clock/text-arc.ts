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
 *
 * *Which* half is the one thing here that has to be reduced modulo 360. Everywhere else in the
 * pipeline angles stay unnormalised past a revolution on purpose (#33) — `largeArcFlag` below
 * derives from the raw span, and `assignRings` needs the ordering — but "is this text upside
 * down" is a question about a direction on screen, and 519° and 159° are the same direction. Left
 * raw, the comparison silently fails for every arc past 360°: the whole of the 1-hour scale's
 * wrapped half (#34), and on the 12-hour dial every window whose look-ahead crosses the period
 * end, which is most of an afternoon (#25).
 */
export function describeTextArc(
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number
): string {
  const midAngle = (((startAngle + endAngle) / 2) % 360 + 360) % 360;
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
