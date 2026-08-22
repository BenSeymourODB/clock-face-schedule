/**
 * Wrap a floating label's text into a card of bounded width.
 *
 * A label exists because a title did not fit its arc. When the label does not fit either, the
 * answer is to wrap it — not to let the card grow, which is what produced #21: a 43-character
 * title needed 561 of the viewBox's 600 units, and the only position satisfying that lay across
 * the numerals and the hands.
 */
import { visualWidth } from './emoji';
import { type FitTextResult, charBudget, normaliseText, packLines, textWidth } from './pack-lines';

/** Line spacing, as a multiple of font size. */
export const LINE_HEIGHT_RATIO = 1.4;

export interface LabelLayout extends FitTextResult {
  /** Card width: the widest line, not the budget — a short label keeps a small card. */
  width: number;
  /** Card height, growing one line at a time. */
  height: number;
}

/** Card height for `lineCount` lines. Callers also need this before they know the line count. */
export function labelCardHeight(lineCount: number, fontSize: number, paddingY: number): number {
  return Math.max(1, lineCount) * fontSize * LINE_HEIGHT_RATIO + paddingY * 2;
}

/**
 * Lay out `text` inside a card no wider than `maxWidth`, over at most `maxLines` lines.
 *
 * `padding` is the card's inset on one side; it is subtracted from the text budget and added
 * back to the returned width, so callers pass the same number they draw with.
 *
 * `trailingLine` is a short line placed after the wrapped text and counted in the card's width and
 * height — #35's duration. It is never wrapped or ellipsized, because a duration cut in half is
 * worse than absent; if it exceeds the budget it is dropped instead, since widening the card past
 * `maxWidth` is exactly the defect #21 fixed. `maxLines` bounds the wrapped text only, so a caller
 * adding a trailing line must budget for one more line when it derives `maxWidth`.
 */
export function fitLabelToWidth(
  text: string,
  maxWidth: number,
  fontSize: number,
  maxLines: number,
  padding: { x: number; y: number },
  trailingLine?: string
): LabelLayout {
  const budget = charBudget(maxWidth - padding.x * 2, fontSize);
  const fit = packLines(normaliseText(text), budget, maxLines);

  const trailing =
    trailingLine !== undefined && visualWidth(trailingLine) <= budget ? trailingLine : undefined;
  const lines = trailing === undefined ? fit.lines : [...fit.lines, trailing];

  const widest = lines.reduce((longest, line) => Math.max(longest, visualWidth(line)), 0);

  return {
    ...fit,
    lines,
    width: textWidth('x'.repeat(widest), fontSize) + padding.x * 2,
    height: labelCardHeight(lines.length, fontSize, padding.y)
  };
}

export interface ClearedLabelLayout extends LabelLayout {
  /**
   * Lines the width was cleared against — never fewer than the card draws, and the fewest that any
   * height in range can be cleared against without the card outgrowing it.
   *
   * Returned rather than kept private because it is the property #183 buys: a card cleared against
   * more lines than it draws was charged for room it does not use, and a spec that can only see the
   * finished card cannot tell that from a card the frame legitimately squeezed.
   */
  clearedLines: number;
}

/** Lines a layout occupies, floored the way `labelCardHeight` floors it. */
function drawnLines(layout: LabelLayout): number {
  return Math.max(1, layout.lines.length);
}

/**
 * Lay out `text` against a width that depends on how tall the card turns out to be (#183).
 *
 * `widthForLines` is the caller's own width limit for a card of that many lines — for a floating
 * label, the nearer of the frame allowance and the face clearance at that height. Passing it as a
 * function rather than a number is what resolves the circularity `faceClearanceLimit`'s docstring
 * describes: width depends on the height cleared against, the height on the line count, and the
 * line count on the width.
 *
 * Sizing against the *tallest* the card may become is the safe way out of that loop and is what
 * shipped, but it charges a card that merely offers a duration line for a line it may never draw:
 * 356 of 496 cards over a 192-state sweep, 313 of them by two lines.
 *
 * A height is **admissible** when the card laid out at its width draws no more lines than the height
 * allows — that is the whole of the safety condition, since `labelCardHeight` is monotone. This
 * takes the smallest admissible height, which is the widest card, by trying each one: the starting
 * bound is admissible by construction, so there is always an answer, and there are only `maxLines`
 * of them to try.
 *
 * **Searching rather than iterating to a fixed point is the point, and this is the second attempt.**
 * The first walked from the bound straight to the line count the card turned out to draw, on the
 * reasoning that a wider budget can only wrap to fewer lines. That is false in this repo, and
 * `pack-lines.ts` is where: a word too long for the budget is ellipsized onto a line of its own
 * rather than hyphenated, so a *narrower* budget can produce *fewer* lines. `Extracurricular
 * Activities` with a duration, at 2 o'clock on a 600-unit dial, draws two lines at the four-line
 * width of 151.2 (the long word cut) and three at the three-line width of 184.7 (both words whole).
 * The jump therefore landed on two, found two inadmissible, and gave up — shipping the cut title
 * with two lines of its own clearance unspent, which is the defect #183 exists to remove. Three is
 * admissible and only a linear scan finds it.
 *
 * So no monotonicity of *line count in width* is assumed anywhere here — that is the direction
 * `pack-lines` breaks, and the whole safety argument below is independent of it. The separate claim
 * that the smallest admissible height is also the widest card does rest on `widthForLines` being
 * non-increasing in its argument, which is a property of the caller's limit rather than of this
 * scan: a taller card must be narrower to clear the face. Only the choice among admissible
 * candidates leans on it, never admissibility itself, so a caller that broke it would get a
 * needlessly narrow card and never an unsafe one. What holds regardless:
 *
 * - **It terminates**: the scan is `maxLines` steps of a counted loop, whatever `widthForLines` does.
 * - **The result is admissible.** Only an admissible candidate is ever adopted, and the starting
 *   bound is one, so the card is never sized against a height it exceeds.
 * - **No smaller admissible height exists.** Every one below the answer was tried and rejected —
 *   which is what a spec can assert, and the fixed-point equality is not, because a card whose only
 *   admissible height is the starting bound legitimately draws fewer lines than it cleared.
 */
export function fitLabelToClearedWidth(
  text: string,
  fontSize: number,
  maxLines: number,
  padding: { x: number; y: number },
  widthForLines: (lineCount: number) => number,
  trailingLine?: string
): ClearedLabelLayout {
  const lay = (lineCount: number): LabelLayout =>
    fitLabelToWidth(text, widthForLines(lineCount), fontSize, maxLines, padding, trailingLine);

  // `maxLines` bounds the wrapped text; a trailing line sits below it and is one more line the card
  // may grow by, so the starting height counts it — and is admissible for that reason.
  let cleared = trailingLine === undefined ? maxLines : maxLines + 1;
  let layout = lay(cleared);

  // Descending, so the last one adopted is the smallest admissible height and therefore the widest
  // card. A wider budget never cuts a title the narrower one kept whole, so it is also the best
  // reading of the text among the admissible heights.
  for (let lineCount = cleared - 1; lineCount >= 1; lineCount -= 1) {
    const candidate = lay(lineCount);
    if (drawnLines(candidate) <= lineCount) {
      cleared = lineCount;
      layout = candidate;
    }
  }

  return { ...layout, clearedLines: cleared };
}

/**
 * Baseline offsets for `lineCount` lines centred on a card, in render order.
 *
 * Each line is drawn as its own `<text>` with `dominant-baseline: central`, matching how the arc
 * renders its two curved lines, so there is no `tspan` baseline arithmetic to get wrong.
 */
export function labelLineOffsets(lineCount: number, fontSize: number): number[] {
  const lineHeight = fontSize * LINE_HEIGHT_RATIO;
  return Array.from(
    { length: lineCount },
    (_unused, index) => (index - (lineCount - 1) / 2) * lineHeight
  );
}
