/**
 * Where a floating label's connector line should stop.
 * Extracted from next-digital-wall-calendar's `floating-label.tsx`.
 */

/**
 * Point where the ray from `center` toward `toward` crosses the boundary of an
 * axis-aligned rectangle centred on `center`. Returns `center` when the two points
 * coincide.
 *
 * Lets a connector terminate at the label card's edge rather than running under it.
 */
export function rectEdgeIntersection(
  center: { x: number; y: number },
  width: number,
  height: number,
  toward: { x: number; y: number }
): { x: number; y: number } {
  const dx = toward.x - center.x;
  const dy = toward.y - center.y;
  if (dx === 0 && dy === 0) return center;

  // Scale the ray until it first touches a vertical or horizontal edge, whichever
  // comes first. Infinity for a zero component so the other axis wins.
  const tx = dx === 0 ? Number.POSITIVE_INFINITY : width / 2 / Math.abs(dx);
  const ty = dy === 0 ? Number.POSITIVE_INFINITY : height / 2 / Math.abs(dy);
  const t = Math.min(tx, ty);

  return { x: center.x + t * dx, y: center.y + t * dy };
}
