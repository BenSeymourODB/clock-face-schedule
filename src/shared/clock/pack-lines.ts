/**
 * Greedy word-packing into a character budget, shared by the two things that lay out event text:
 * titles curved along an arc, and floating labels wrapped inside a card.
 *
 * Extracted from `fit-title.ts` when labels needed the same packing against a *width* budget
 * rather than an angular one. The packing is identical either way — only the arithmetic that
 * arrives at the budget differs — so it lives here and both callers supply their own budget.
 *
 * No DOM measurement anywhere: every budget reduces to a count of characters at
 * `fontSize × CHAR_WIDTH_RATIO` each, with an emoji counting double. Crude, but it runs at build
 * time and in a plain node test.
 */
import { emojiRunLength, sliceToWidth, visualWidth } from './emoji';

/** Rough advance width per character, as a fraction of font size. */
export const CHAR_WIDTH_RATIO = 0.6;

/** Single-character ellipsis (U+2026), for budgets too tight to spend three chars on a marker. */
const ELLIPSIS_CHAR = '…';

/** Three-dot ellipsis — wider, but reads more clearly when there's room. */
const ELLIPSIS_ASCII = '...';

export interface FitTextResult {
  /** The lines to render, at most `maxLines` of them. */
  lines: string[];
  /** True when the text did not fit and was truncated. */
  didOverflow: boolean;
}

/**
 * Emoji that stay on one line together.
 *
 * A short run is a single visual token — "🧸 🪀 Free Play" should not put the ball on the line
 * below the bear. A longer run is just a strip of pictures, and unlike a word it has no syllable
 * to protect, so it may break anywhere.
 */
const MAX_UNBROKEN_EMOJI = 3;

/**
 * Whole characters that fit in `width`. Floors to a whole character so ascenders and descenders
 * don't bleed past the edges at sub-character precision.
 */
export function charBudget(width: number, fontSize: number): number {
  if (width <= 0 || fontSize <= 0) return 0;
  return Math.floor(width / (fontSize * CHAR_WIDTH_RATIO));
}

/** Width `text` will occupy at `fontSize`, by the same heuristic `charBudget` inverts. */
export function textWidth(text: string, fontSize: number): number {
  return visualWidth(text) * fontSize * CHAR_WIDTH_RATIO;
}

/** Truncate to `budget`, appending an ellipsis. Returns `text` unchanged if it fits. */
function truncateWithEllipsis(text: string, budget: number): string {
  if (budget <= 0) return '';
  if (visualWidth(text) <= budget) return text;
  if (budget <= 3) {
    if (budget === 1) return ELLIPSIS_CHAR;
    return `${sliceToWidth(text, budget - 1)}${ELLIPSIS_CHAR}`;
  }
  return `${sliceToWidth(text, budget - ELLIPSIS_ASCII.length)}${ELLIPSIS_ASCII}`;
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
    return `${sliceToWidth(line, budget - 1)}${ELLIPSIS_CHAR}`;
  }
  return `${sliceToWidth(line, budget - ELLIPSIS_ASCII.length)}${ELLIPSIS_ASCII}`;
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
    if (visualWidth(candidate) > budget) break;
    line = candidate;
    i += 1;
  }
  return { line, nextIndex: i };
}

/** Collapse runs of whitespace so the character counts mean something. */
export function normaliseText(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

/**
 * Glue neighbouring all-emoji words into single units of up to `MAX_UNBROKEN_EMOJI`, so a short
 * run wraps as one token instead of scattering across lines.
 *
 * The boundary to the text that follows is deliberately left alone: after an emoji is an ordinary
 * place to wrap, so a title too tight for "🍽️ Lunch" on one line may still put the glyph above
 * the word rather than overflowing.
 */
function mergeEmojiRuns(words: string[]): string[] {
  const merged: string[] = [];

  for (const word of words) {
    const previous = merged[merged.length - 1];
    const priorRun = previous === undefined ? 0 : emojiRunLength(previous);
    const run = emojiRunLength(word);

    if (priorRun > 0 && run > 0 && priorRun + run <= MAX_UNBROKEN_EMOJI) {
      merged[merged.length - 1] = `${previous} ${word}`;
    } else {
      merged.push(word);
    }
  }

  return merged;
}

/**
 * Pack `normalised` into at most `maxLines` lines of at most `budget` characters each.
 *
 * Does NOT split mid-word except as a last resort: a single word longer than the budget is
 * ellipsized rather than hyphenated, because a broken word reads as a different word.
 */
export function packLines(normalised: string, budget: number, maxLines: number): FitTextResult {
  if (normalised.length === 0) return { lines: [], didOverflow: false };
  if (budget <= 0 || maxLines <= 0) return { lines: [], didOverflow: true };
  if (visualWidth(normalised) <= budget) return { lines: [normalised], didOverflow: false };

  const words = mergeEmojiRuns(normalised.split(' '));

  // With one line there is no wrapping to do, so fill it to the character rather than stopping
  // at the last whole word — the extra few glyphs are worth more than the clean break.
  if (words.length === 1 || maxLines === 1) {
    return { lines: [truncateWithEllipsis(normalised, budget)], didOverflow: true };
  }

  const lines: string[] = [];
  let index = 0;

  while (lines.length < maxLines && index < words.length) {
    const { line, nextIndex } = packLine(words, index, budget);
    if (line.length === 0) {
      // The next word alone exceeds the budget, so no further packing can ever succeed. Spend
      // this line on as much of that word as fits rather than dropping it silently.
      lines.push(truncateWithEllipsis(words[index], budget));
      return { lines, didOverflow: true };
    }
    lines.push(line);
    index = nextIndex;
  }

  if (index >= words.length) return { lines, didOverflow: false };

  // Words remain past the last line. Always mark it, even when its packed words happen to fit
  // exactly, so the cut is visible.
  lines[lines.length - 1] = appendOverflowMarker(lines[lines.length - 1], budget);
  return { lines, didOverflow: true };
}
