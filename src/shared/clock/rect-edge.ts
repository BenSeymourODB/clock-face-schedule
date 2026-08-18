/**
 * Where a floating label's connector line should stop, and whether two cards would touch.
 * `rectEdgeIntersection` extracted from next-digital-wall-calendar's `floating-label.tsx`.
 */

/** A card's own box, as the renderer draws it. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Whether two cards share any area.
 *
 * Touching edges do not count: cards are drawn abutting all over this dial and a shared boundary
 * is not an overlap.
 *
 * Not the start of the displacement pass #30 asks for — nothing here moves a card. It exists so
 * that an *optional* line of card text (#35's duration) can be declined where adding it would put
 * one card over another, which would hide a title that is on a card precisely because it did not
 * fit its arc.
 */
export function rectsOverlap(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  );
}

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
