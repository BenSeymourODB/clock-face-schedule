import { describe, expect, it } from 'vitest';
import {
  fitLabelToClearedWidth,
  fitLabelToWidth,
  labelCardHeight,
  labelLineOffsets
} from './fit-label';

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

  describe('trailingLine', () => {
    it('appends it after the wrapped text and grows the card by one line', () => {
      const plain = fit('Assembly', 400);
      const withDuration = fitLabelToWidth('Assembly', 400, FONT, 3, PADDING, '45 min');

      expect(withDuration.lines).toEqual(['Assembly', '45 min']);
      expect(withDuration.height).toBeCloseTo(
        labelCardHeight(2, FONT, PADDING.y),
        4
      );
      expect(withDuration.height).toBeGreaterThan(plain.height);
    });

    // The card is sized to its widest line, and a short title with a long duration inverts which
    // line that is — "Yoga" is 4 units against "20 min"'s 6. Sizing from the title alone would
    // clip the duration.
    it('widens the card when the trailing line is the widest line', () => {
      const result = fitLabelToWidth('Yoga', 400, FONT, 3, PADDING, '20 min');

      expect(result.width).toBeCloseTo(6 * CHAR + PADDING.x * 2, 4);
    });

    // Widening past maxWidth is #21's defect — the clamp's only remaining move is to pull the card
    // in over the numerals and the hands.
    it('drops it rather than exceeding the width it was given', () => {
      const result = fitLabelToWidth('PE', 4 * CHAR + PADDING.x * 2, FONT, 3, PADDING, '20 min');

      expect(result.lines).toEqual(['PE']);
      expect(result.width).toBeLessThanOrEqual(4 * CHAR + PADDING.x * 2);
    });

    it('is never wrapped or ellipsized, because half a duration is worse than none', () => {
      const result = fitLabelToWidth(LONG, 160, FONT, 2, PADDING, '1 hr 30');

      expect(result.lines[result.lines.length - 1]).toBe('1 hr 30');
    });

    // didOverflow describes the *title*: it is what routes the label onto the dial in the first
    // place, and a duration line neither rescues nor causes that.
    it('leaves didOverflow describing the title', () => {
      const cut = fitLabelToWidth(LONG, 160, FONT, 2, PADDING, '1 hr');
      const whole = fitLabelToWidth('Lunch', 400, FONT, 3, PADDING, '2 hr');

      expect(cut.didOverflow).toBe(true);
      expect(whole.didOverflow).toBe(false);
    });

    it('bounds the wrapped text by maxLines, excluding itself', () => {
      const result = fitLabelToWidth(LONG, 160, FONT, 3, PADDING, '1 hr');

      expect(result.lines).toHaveLength(4);
      expect(result.lines[3]).toBe('1 hr');
    });
  });
});

describe('fitLabelToClearedWidth', () => {
  /**
   * A width limit shaped like the one a floating label faces: the taller the card, the less room it
   * has. Linear rather than the real circle's arithmetic — the property under test is that the loop
   * settles where height and width agree, and a monotone limit is all that takes.
   */
  function shrinking(perLine: number, atOneLine: number) {
    const calls: number[] = [];
    return {
      calls,
      widthFor(lineCount: number): number {
        calls.push(lineCount);
        return atOneLine - (lineCount - 1) * perLine;
      }
    };
  }

  function cleared(
    text: string,
    widthFor: (lineCount: number) => number,
    trailingLine?: string,
    maxLines = 3
  ) {
    return fitLabelToClearedWidth(text, FONT, maxLines, PADDING, widthFor, trailingLine);
  }

  it('settles where the card is cleared against the height it draws', () => {
    const limit = shrinking(25, 205);
    const result = cleared('Spelling Test', limit.widthFor, '1 hr');

    expect(result.clearedLines).toBe(result.lines.length);
  });

  // The defect, at the function: sized against the tallest it may become, this card wraps into a
  // budget it never spends. Four lines leaves 130 units, eleven characters; two leaves 180, which
  // holds the title whole.
  it('does not wrap a title into room a fourth line was holding but never used', () => {
    const limit = shrinking(25, 205);

    expect(cleared('Spelling Test', limit.widthFor, '1 hr').lines).toEqual(['Spelling Test', '1 hr']);
    expect(fitLabelToWidth('Spelling Test', 130, FONT, 3, PADDING, '1 hr').lines).toEqual([
      'Spelling',
      'Test',
      '1 hr'
    ]);
  });

  it('leaves a card that genuinely fills its lines cleared against all of them', () => {
    const result = cleared(LONG, shrinking(25, 205).widthFor, '1 hr');

    expect(result.lines).toHaveLength(4);
    expect(result.clearedLines).toBe(4);
  });

  it('starts at the line budget when no trailing line is on offer', () => {
    const limit = shrinking(25, 205);
    cleared(LONG, limit.widthFor);

    expect(limit.calls[0]).toBe(3);
  });

  // Termination is what pays for the circularity `faceClearanceLimit` avoided by construction, so it
  // is asserted rather than argued: `cleared` strictly decreases, so the walk is bounded by the line
  // budget however the limit behaves.
  it('terminates in at most one step per line of budget', () => {
    const limit = shrinking(25, 205);
    cleared('Lunch', limit.widthFor, '1 hr');

    expect(limit.calls.length).toBeLessThanOrEqual(5);
    expect(limit.calls).toEqual([...limit.calls].sort((a, b) => b - a));
  });

  // The safety invariant, made to fail on purpose: a limit that hands a *shorter* card *less* room
  // could grow the card past the height it was cleared against. The step is refused instead, so
  // what comes back is never sized against a height it exceeds.
  it('refuses a step that would leave the card taller than the height it was cleared against', () => {
    const perverse = (lineCount: number): number => (lineCount >= 4 ? 400 : 130);
    const result = cleared('Parent Teacher Conference', perverse, '1 hr');

    expect(result.clearedLines).toBe(4);
    expect(result.lines).toEqual(['Parent Teacher Conference', '1 hr']);
    expect(result.clearedLines).toBeGreaterThanOrEqual(result.lines.length);
  });

  it('floors an empty card at one line, the way labelCardHeight does', () => {
    const result = cleared('', shrinking(25, 205).widthFor);

    expect(result.lines).toEqual([]);
    expect(result.clearedLines).toBe(1);
    expect(result.height).toBeCloseTo(labelCardHeight(1, FONT, PADDING.y), 10);
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
