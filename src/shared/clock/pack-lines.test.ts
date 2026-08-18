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

  it('lets a run longer than three break wherever the line runs out', () => {
    // Not chunked into fixed groups of three: the run becomes ordinary words, so the packer fills
    // each line. Chunking left five of line one's units unused and overflowed instead.
    const ROCKET = '\u{1F680}';
    const result = packLines(`${BEAR} ${BALL} ${BALLOON} ${CAKE} ${ROCKET} Free Play`, 12, 2);

    // The break falls after the fourth emoji — where the line ran out, not on a group boundary.
    expect(result).toEqual({
      lines: [`${BEAR} ${BALL} ${BALLOON} ${CAKE}`, `${ROCKET} Free Play`],
      didOverflow: false
    });
  });

  it('never cuts through an emoji when it ellipsizes', () => {
    // The whole string measures 12, so budget 11 forces a cut *inside* the emoji run: "Lunch " (6)
    // plus the marker (3) leaves 2 units, enough for the plate but not the bear. A budget that
    // stops before the run reaches the line — as an earlier version of this test used — cannot tell
    // a correct slicer from a naive one, because both emit "Lunch...".
    const result = packLines(`Lunch ${PLATE}${BEAR}${BALL}`, 11, 1);

    expect(result.didOverflow).toBe(true);
    expect(result.lines[0]).toBe(`Lunch ${PLATE}...`);
    // No lone surrogate or orphaned selector left behind by the cut.
    expect(result.lines[0].indexOf(BEAR[0])).toBe(-1);
    expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(result.lines[0])).toBe(false);
  });

  it.each([
    ['a flag into a bare letter', '\u{1F1EC}\u{1F1E7}', ['\u{1F1EC}', '\u{1F1E7}']],
    ['a profession into the wrong person', '\u{1F469}‍\u{1F3EB}', ['\u{1F469}', '\u{1F3EB}']],
    ['a skin tone off its hand', '\u{1F44D}\u{1F3FD}', ['\u{1F44D}', '\u{1F3FD}']],
    [
      'a subdivision flag into a plain black one',
      '\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}',
      ['\u{1F3F4}', '\u{E0067}']
    ]
  ])('does not break %s', (_label, composite, parts) => {
    // The sweep must start where the composite actually reaches the line. "Trip " costs 5 and the
    // marker 3, so below 9 the cut never touches it and the assertion is vacuous — which is how an
    // earlier version of this test passed while the property was false for every composite.
    let reached = 0;

    for (let budget = 9; budget <= 16; budget += 1) {
      const line = packLines(`Trip ${composite} Today`, budget, 1).lines[0] ?? '';
      const whole = line.indexOf(composite) !== -1;
      if (whole) reached += 1;

      for (const part of parts) {
        expect(whole || line.indexOf(part) === -1).toBe(true);
      }
    }

    // Guards the guard: if the sweep never admits the composite, the loop above proves nothing.
    expect(reached).toBeGreaterThan(0);
  });
});
