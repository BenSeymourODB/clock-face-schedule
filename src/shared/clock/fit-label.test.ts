import { describe, expect, it } from 'vitest';
import { fitLabelToWidth, labelCardHeight, labelLineOffsets } from './fit-label';

const FONT = 17.52;
const PADDING = { x: 6, y: 3 };
/** One character's advance at FONT, by the shared heuristic. */
const CHAR = FONT * 0.6;
const LONG = 'Parent Teacher Conference Planning Committee';

function fit(text: string, maxWidth: number, maxLines = 3) {
  return fitLabelToWidth(text, maxWidth, FONT, maxLines, PADDING);
}

describe('fitLabelToWidth', () => {
  it('keeps a short label on one line', () => {
    const result = fit('Lunch', 400);

    expect(result.lines).toEqual(['Lunch']);
    expect(result.didOverflow).toBe(false);
  });

  it('wraps rather than exceeding the width it was given', () => {
    const result = fit(LONG, 200);

    expect(result.lines.length).toBeGreaterThan(1);
    expect(result.width).toBeLessThanOrEqual(200);
  });

  it('sizes the card to the widest line, not to the budget', () => {
    // A generous budget must not produce a card wide enough to reach the dial (#21).
    const result = fit('Lunch', 400);

    expect(result.width).toBeCloseTo(5 * CHAR + PADDING.x * 2, 4);
  });

  it.each([1, 2, 3, 4])('grows the card one line at a time — %i lines', (maxLines) => {
    const result = fit(LONG, 160, maxLines);

    expect(result.lines).toHaveLength(maxLines);
    expect(result.height).toBeCloseTo(labelCardHeight(maxLines, FONT, PADDING.y), 4);
  });

  it('caps at maxLines and marks the cut', () => {
    const result = fit(LONG, 160, 2);

    expect(result.lines).toHaveLength(2);
    expect(result.didOverflow).toBe(true);
    expect(result.lines[1]).toMatch(/(\.\.\.|…)$/);
  });

  it('keeps a card height for empty text rather than collapsing to nothing', () => {
    const result = fit('', 400);

    expect(result.lines).toEqual([]);
    expect(result.height).toBeCloseTo(labelCardHeight(0, FONT, PADDING.y), 4);
  });

  it('does not produce a negative width when the budget is smaller than the padding', () => {
    const result = fit(LONG, 4);

    expect(result.width).toBeGreaterThanOrEqual(0);
    expect(result.didOverflow).toBe(true);
  });
});

describe('labelLineOffsets', () => {
  it('centres a single line on the card', () => {
    expect(labelLineOffsets(1, FONT)).toEqual([0]);
  });

  it.each([2, 3, 4])('spaces %i lines symmetrically about the centre', (count) => {
    const offsets = labelLineOffsets(count, FONT);
    const gaps = offsets.slice(1).map((offset, i) => offset - offsets[i]);

    expect(offsets).toHaveLength(count);
    expect(offsets.reduce((sum, offset) => sum + offset, 0)).toBeCloseTo(0, 10);
    // Ascending, so line one renders above line two rather than through it.
    expect(gaps.every((gap) => Math.abs(gap - FONT * 1.4) < 1e-9)).toBe(true);
  });
});
