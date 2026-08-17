/**
 * Wrap a floating label's text into a card of bounded width.
 *
 * A label exists because a title did not fit its arc. When the label does not fit either, the
 * answer is to wrap it — not to let the card grow, which is what produced #21: a 43-character
 * title needed 561 of the viewBox's 600 units, and the only position satisfying that lay across
 * the numerals and the hands.
 */
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
 */
export function fitLabelToWidth(
  text: string,
  maxWidth: number,
  fontSize: number,
  maxLines: number,
  padding: { x: number; y: number }
): LabelLayout {
  const budget = charBudget(maxWidth - padding.x * 2, fontSize);
  const fit = packLines(normaliseText(text), budget, maxLines);

  const widest = fit.lines.reduce((longest, line) => Math.max(longest, line.length), 0);

  return {
    ...fit,
    width: textWidth('x'.repeat(widest), fontSize) + padding.x * 2,
    height: labelCardHeight(fit.lines.length, fontSize, padding.y)
  };
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
