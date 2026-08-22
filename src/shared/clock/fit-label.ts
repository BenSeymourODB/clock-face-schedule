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
   * Lines the width was cleared against, which at the fixed point is the card's own line count.
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
 * measured over 192 pinned states, 21 cards ellipsized a title they had the room for.
 *
 * The loop starts at that same safe upper bound and walks down. Two properties make it sound:
 *
 * - **It terminates**, whatever `widthForLines` does, because `cleared` strictly decreases each
 *   step and is a positive integer — at most `maxLines` steps.
 * - **Every layout it returns was cleared against at least the height it draws.** With a monotone
 *   `widthForLines` — taller card, no more width — a shorter card can only be granted more width
 *   and more width can only wrap to fewer lines, so the step is safe by construction. The guard
 *   below is what happens if that ever stops holding: the step is refused and the last safe layout
 *   stands, rather than a card being sized against a height it exceeds.
 */
export function fitLabelToClearedWidth(
  text: string,
  fontSize: number,
  maxLines: number,
  padding: { x: number; y: number },
  widthForLines: (lineCount: number) => number,
  trailingLine?: string
): ClearedLabelLayout {
  // `maxLines` bounds the wrapped text; a trailing line sits below it and is one more line the card
  // may grow by, so the safe starting height counts it.
  let cleared = trailingLine === undefined ? maxLines : maxLines + 1;
  let layout = fitLabelToWidth(
    text,
    widthForLines(cleared),
    fontSize,
    maxLines,
    padding,
    trailingLine
  );

  while (drawnLines(layout) < cleared) {
    const next = drawnLines(layout);
    const candidate = fitLabelToWidth(
      text,
      widthForLines(next),
      fontSize,
      maxLines,
      padding,
      trailingLine
    );
    if (drawnLines(candidate) > next) break;
    cleared = next;
    layout = candidate;
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
