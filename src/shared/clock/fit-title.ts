/**
 * Lay out an event title along an arc on up to two lines.
 * Ported from next-digital-wall-calendar's `analog-clock/fit-title.ts`.
 *
 * The budget is approximated from the arc circumference; the packing itself is shared with
 * floating labels and lives in `pack-lines.ts`.
 */
import { type FitTextResult, charBudget, normaliseText, packLines } from './pack-lines';

export type FitTitleResult = FitTextResult;

/** Characters that fit on one curved line at `titleRadius`. */
function charBudgetForArc(arcSpanDegrees: number, titleRadius: number, fontSize: number): number {
  if (arcSpanDegrees <= 0 || titleRadius <= 0) return 0;
  const circumference = (arcSpanDegrees / 360) * 2 * Math.PI * titleRadius;
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
    charBudgetForArc(arcSpanDegrees, titleRadius, fontSize),
    maxLines
  );
}
