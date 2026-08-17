import { describe, expect, it } from 'vitest';
import { charBudget, normaliseText, packLines, textWidth } from './pack-lines';

describe('charBudget', () => {
  it.each([
    ['floors to a whole character', 100, 10, 16],
    ['zero width fits nothing', 0, 10, 0],
    ['negative width fits nothing', -50, 10, 0],
    ['zero font size fits nothing', 100, 0, 0]
  ])('%s', (_label, width, fontSize, expected) => {
    expect(charBudget(width, fontSize)).toBe(expected);
  });

  it('inverts textWidth', () => {
    expect(charBudget(textWidth('abcdefgh', 12), 12)).toBe(8);
  });
});

describe('normaliseText', () => {
  it('collapses whitespace so character counts mean something', () => {
    expect(normaliseText('  Parent   Teacher \n Conference ')).toBe('Parent Teacher Conference');
  });
});

/**
 * The 1- and 2-line paths are covered through `fitTitleToArc`; these cover the generalisation to
 * arbitrary line counts, which floating labels needed.
 */
describe('packLines beyond two lines', () => {
  const WORDS = 'alpha beta gamma delta epsilon';

  it('fills as many lines as the text needs and no more', () => {
    expect(packLines(WORDS, 11, 5)).toEqual({
      lines: ['alpha beta', 'gamma delta', 'epsilon'],
      didOverflow: false
    });
  });

  it.each([
    [1, ['alpha beta ...']],
    [2, ['alpha beta', 'gamma delta...']],
    [3, ['alpha beta', 'gamma delta', 'epsilon']]
  ])('caps at %i lines', (maxLines, expected) => {
    expect(packLines(WORDS, 14, maxLines).lines).toEqual(expected);
  });

  it('spends a line on a word longer than the whole budget rather than dropping it', () => {
    // "Conference" cannot be packed at all, so line two is it, ellipsized.
    const result = packLines('Parent Conference Planning', 8, 3);

    expect(result.lines).toEqual(['Parent', 'Confe...']);
    expect(result.didOverflow).toBe(true);
  });

  it('reports no overflow when the last line lands exactly on the budget', () => {
    expect(packLines('abcd efgh', 4, 2)).toEqual({
      lines: ['abcd', 'efgh'],
      didOverflow: false
    });
  });

  it.each([
    ['no lines at all', 0],
    ['a negative cap', -1]
  ])('treats %s as overflow rather than looping', (_label, maxLines) => {
    expect(packLines(WORDS, 10, maxLines)).toEqual({ lines: [], didOverflow: true });
  });
});
