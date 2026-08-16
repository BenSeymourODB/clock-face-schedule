/**
 * Lay out an event title along an arc on up to two lines.
 * Ported from next-digital-wall-calendar's `analog-clock/fit-title.ts`.
 *
 * No DOM measurement: the budget is approximated from the arc circumference
 * (`(arcSpan / 360) × 2π × titleRadius`) against a monospace heuristic of
 * ~`fontSize × 0.6` per character. Good enough for the 1-vs-2 line decision,
 * and it runs anywhere — including at build time and in a plain node test.
 */

const CHAR_WIDTH_RATIO = 0.6;

/** Single-character ellipsis (U+2026), for budgets too tight to spend three chars on a marker. */
const ELLIPSIS_CHAR = '…';

/** Three-dot ellipsis — wider, but reads more clearly when there's room. */
const ELLIPSIS_ASCII = '...';

export interface FitTitleResult {
  /** 0, 1, or 2 lines to render along the arc. */
  lines: string[];
  /** True when the title did not fit and was truncated. */
  didOverflow: boolean;
}

/**
 * Characters that fit on one curved line. Floors to a whole character so ascenders
 * and descenders don't bleed past the arc edges at sub-character precision.
 */
function charBudgetForArc(arcSpanDegrees: number, titleRadius: number, fontSize: number): number {
  if (arcSpanDegrees <= 0 || titleRadius <= 0 || fontSize <= 0) return 0;
  const circumference = (arcSpanDegrees / 360) * 2 * Math.PI * titleRadius;
  const charWidth = fontSize * CHAR_WIDTH_RATIO;
  return Math.floor(circumference / charWidth);
}

/** Truncate to `budget` characters, appending an ellipsis. Returns `text` unchanged if it fits. */
function truncateWithEllipsis(text: string, budget: number): string {
  if (budget <= 0) return '';
  if (text.length <= budget) return text;
  if (budget <= 3) {
    if (budget === 1) return ELLIPSIS_CHAR;
    return `${text.slice(0, budget - 1)}${ELLIPSIS_CHAR}`;
  }
  return `${text.slice(0, budget - ELLIPSIS_ASCII.length)}${ELLIPSIS_ASCII}`;
}

/**
 * Mark a final line as truncated. Unlike `truncateWithEllipsis`, this always emits a
 * marker even when `line` fits — the marker means "more content was cut", not "this
 * string was too long".
 */
function appendOverflowMarker(line: string, budget: number): string {
  if (budget <= 0) return '';
  if (budget === 1) return ELLIPSIS_CHAR;
  if (budget <= 3) {
    return `${line.slice(0, budget - 1)}${ELLIPSIS_CHAR}`;
  }
  return `${line.slice(0, budget - ELLIPSIS_ASCII.length)}${ELLIPSIS_ASCII}`;
}

/**
 * Greedily pull as many whole words as fit within `budget` onto one line.
 * Returns the line plus the index of the first word that didn't fit.
 */
function packLine(
  words: string[],
  startIndex: number,
  budget: number
): { line: string; nextIndex: number } {
  let line = '';
  let i = startIndex;
  while (i < words.length) {
    const word = words[i];
    const candidate = line.length === 0 ? word : `${line} ${word}`;
    if (candidate.length > budget) break;
    line = candidate;
    i += 1;
  }
  return { line, nextIndex: i };
}

export function fitTitleToArc(
  cleanTitle: string,
  arcSpanDegrees: number,
  titleRadius: number,
  fontSize: number,
  maxLines: 1 | 2 = 2
): FitTitleResult {
  const budget = charBudgetForArc(arcSpanDegrees, titleRadius, fontSize);
  const normalised = cleanTitle.trim().replace(/\s+/g, ' ');

  if (normalised.length === 0) {
    return { lines: [], didOverflow: false };
  }
  if (budget <= 0) {
    return { lines: [], didOverflow: true };
  }
  if (normalised.length <= budget) {
    return { lines: [normalised], didOverflow: false };
  }

  const words = normalised.split(' ');

  // Does NOT split mid-word — a single over-long word is ellipsized on one line.
  if (words.length === 1) {
    return { lines: [truncateWithEllipsis(normalised, budget)], didOverflow: true };
  }

  const { line: line1, nextIndex } = packLine(words, 0, budget);

  // Every individual word exceeds the budget, so nothing packed onto line 1.
  if (line1.length === 0) {
    return { lines: [truncateWithEllipsis(words[0], budget)], didOverflow: true };
  }

  if (maxLines === 1) {
    return { lines: [truncateWithEllipsis(normalised, budget)], didOverflow: true };
  }

  const { line: line2, nextIndex: afterLine2 } = packLine(words, nextIndex, budget);

  if (afterLine2 >= words.length) {
    return { lines: [line1, line2], didOverflow: false };
  }

  // Words remain past line 2. Always mark line 2, even when its packed words happen
  // to fit exactly, so the cut is visible.
  let truncatedLine2: string;
  if (line2.length > 0) {
    truncatedLine2 = appendOverflowMarker(line2, budget);
  } else if (nextIndex < words.length) {
    truncatedLine2 = truncateWithEllipsis(words[nextIndex], budget);
  } else {
    truncatedLine2 = '';
  }

  return { lines: [line1, truncatedLine2], didOverflow: true };
}
