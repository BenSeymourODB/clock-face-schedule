import { describe, expect, it } from 'vitest';
import { charBudget, normaliseText, packLines, textWidth, visualWidth } from './pack-lines';

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

describe('visualWidth', () => {
  it('counts a plain character as one unit', () => {
    expect(visualWidth('abc')).toBe(3);
  });

  it('counts an emoji as two units, not one per code point', () => {
    // U+1F9F8 "🧸" carries Emoji_Presentation on its own.
    expect(visualWidth('\u{1F9F8}')).toBe(2);
  });

  it('counts an emoji with a variation selector as two units, not per code unit', () => {
    // The fork-and-plate glyph in the fixture: U+1F37D + U+FE0F, three UTF-16 code units.
    expect(visualWidth('\u{1F37D}\uFE0F')).toBe(2);
  });

  it('adds emoji and plain-character widths in a mixed string', () => {
    expect(visualWidth('\u{1F3AE} Lunch')).toBe(2 + 1 + 5);
  });

  it('is unaffected by emoji when there are none', () => {
    expect(visualWidth('Team Meeting')).toBe('Team Meeting'.length);
  });

  it.each([
    ['a digit', '7'],
    ['a hash', '#'],
    ['a copyright sign', '©']
  ])('leaves %s at one unit despite carrying the Emoji property', (_label, text) => {
    // All three are \p{Emoji} without \p{Emoji_Presentation}, which is why the pattern demands
    // U+FE0F on that branch. Matching bare \p{Emoji} would make "7" double-width and silently
    // shrink the budget of every title carrying a time or a room number.
    expect(visualWidth(text)).toBe(1);
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

/**
 * #23 put the event emoji inline with the title, which makes emoji ordinary content in the packer
 * rather than a separately-drawn glyph. Two rules follow: an emoji costs two width units, and a
 * short run of them is one visual token.
 */
describe('packLines with emoji in the text', () => {
  const BEAR = '\u{1F9F8}';
  const BALL = '\u{1FA80}';
  const BALLOON = '\u{1F388}';
  const CAKE = '\u{1F382}';
  const PLATE = '\u{1F37D}\uFE0F';

  it('charges an emoji two units of the budget, not one', () => {
    // "🍽️ Lunch" is 8 units wide. A 7-unit budget cannot hold it; an 8-unit one can. Counted by
    // raw `.length` the plate reads as 3 UTF-16 units and both budgets would be misjudged.
    expect(packLines(`${PLATE} Lunch`, 8, 1).didOverflow).toBe(false);
    expect(packLines(`${PLATE} Lunch`, 7, 1).didOverflow).toBe(true);
  });

  it('breaks between an emoji and the word after it when one line will not hold both', () => {
    // The narrow case: after an emoji is a natural break, so the glyph takes the first line and
    // the word the second, rather than the title overflowing.
    expect(packLines(`${PLATE} Lunch`, 5, 2)).toEqual({
      lines: [PLATE, 'Lunch'],
      didOverflow: false
    });
  });

  it('keeps a short run of emoji together rather than splitting it across lines', () => {
    expect(packLines(`${BEAR} ${BALL} Free Play`, 9, 2)).toEqual({
      lines: [`${BEAR} ${BALL}`, 'Free Play'],
      didOverflow: false
    });
  });

  it('holds three emoji on one line, the most a run keeps together', () => {
    // Regression: the merge counted its own joining space as text, which capped every run at two
    // and put the third emoji on a line of its own.
    expect(packLines(`${BEAR} ${BALL} ${BALLOON} Party`, 9, 2).lines).toEqual([
      `${BEAR} ${BALL} ${BALLOON}`,
      'Party'
    ]);
  });

  it('lets a run longer than three break, having no syllable to protect', () => {
    const result = packLines(`${BEAR} ${BALL} ${BALLOON} ${CAKE} Party`, 9, 2);

    expect(result.lines[0]).toBe(`${BEAR} ${BALL} ${BALLOON}`);
    expect(result.lines[1]).toContain(CAKE);
  });

  it('never cuts through an emoji when it ellipsizes', () => {
    // Slicing by character index could land between an emoji's surrogate pair or before its
    // variation selector, rendering a replacement box or a bare unstyled glyph.
    const result = packLines(`Lunch ${PLATE}${BEAR}${BALL}`, 8, 1);

    expect(result.didOverflow).toBe(true);
    for (const fragment of [PLATE, BEAR, BALL]) {
      const partial = result.lines[0].includes(fragment[0]) && !result.lines[0].includes(fragment);
      expect(partial).toBe(false);
    }
  });
});
