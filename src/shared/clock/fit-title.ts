/**
 * Lay out an event title along an arc on up to two lines.
 * Ported from next-digital-wall-calendar's `analog-clock/fit-title.ts`.
 *
 * The budget is approximated from the arc circumference; the packing itself is shared with
 * floating labels and lives in `pack-lines.ts`.
 */
import { type FitTextResult, charBudget, normaliseText, packLines } from './pack-lines';

export type FitTitleResult = FitTextResult;

/**
 * Characters that fit on one curved line at `radius`.
 *
 * Exported because a line's budget depends on the radius it is actually drawn at, and the arc
 * carries lines at more than one: the two title radii straddle the centre, and #35's duration line
 * takes whichever of them the title left free.
 */
export function arcCharBudget(arcSpanDegrees: number, radius: number, fontSize: number): number {
  if (arcSpanDegrees <= 0 || radius <= 0) return 0;
  const circumference = (arcSpanDegrees / 360) * 2 * Math.PI * radius;
  return charBudget(circumference, fontSize);
}

export function fitTitleToArc(
  cleanTitle: string,
  arcSpanDegrees: number,
  titleRadius: number,
  fontSize: number,
  maxLines: 1 | 2 = 2
): FitTitleResult {
  return packLines(
    normaliseText(cleanTitle),
    arcCharBudget(arcSpanDegrees, titleRadius, fontSize),
    maxLines
  );
}
