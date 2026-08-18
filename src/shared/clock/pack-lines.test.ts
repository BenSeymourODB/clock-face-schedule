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

  it.each([
    ['a flag into a bare letter', '\u{1F1EC}\u{1F1E7}', ['\u{1F1EC}', '\u{1F1E7}']],
    ['a profession into the wrong person', '\u{1F469}‍\u{1F3EB}', ['\u{1F469}', '\u{1F3EB}']],
    ['a skin tone off its hand', '\u{1F44D}\u{1F3FD}', ['\u{1F44D}', '\u{1F3FD}']]
  ])('does not break %s', (_label, composite, parts) => {
    // The first version of this suite asserted "never cuts through an emoji" using only simple
    // glyphs, so it passed while the property was false for every composite. Truncating at each
    // budget either keeps the sequence whole or drops it entirely — never a fragment.
    for (let budget = 1; budget <= 8; budget += 1) {
      const line = packLines(`Trip ${composite} Today`, budget, 1).lines[0] ?? '';
      const whole = line.indexOf(composite) !== -1;

      for (const part of parts) {
        expect(whole || line.indexOf(part) === -1).toBe(true);
      }
    }
  });
});
