import { describe, expect, it } from 'vitest';
import { LEADING_EMOJI, emojiRunLength, sliceToWidth, visualWidth } from './emoji';

/** Composite emoji, each drawn as a single glyph out of several code points. */
const TEACHER = '\u{1F469}‍\u{1F3EB}';
const FAMILY = '\u{1F468}‍\u{1F469}‍\u{1F467}';
const THUMBS_TONE = '\u{1F44D}\u{1F3FD}';
const FLAG_GB = '\u{1F1EC}\u{1F1E7}';
const KEYCAP_ONE = '1️⃣';

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
    expect(visualWidth('\u{1F37D}️')).toBe(2);
  });

  it('adds emoji and plain-character widths in a mixed string', () => {
    expect(visualWidth('\u{1F3AE} Lunch')).toBe(2 + 1 + 5);
  });

  it('is unaffected by emoji when there are none', () => {
    expect(visualWidth('Team Meeting')).toBe('Team Meeting'.length);
  });

  it.each([
    ['a ZWJ profession', TEACHER],
    ['a three-person ZWJ family', FAMILY],
    ['a skin-tone modifier', THUMBS_TONE],
    ['a regional-indicator flag', FLAG_GB],
    ['a keycap', KEYCAP_ONE]
  ])('measures %s as one glyph, not one per code point', (_label, text) => {
    // Each draws as a single glyph while spending several code points. Counting the parts
    // separately over-charged the budget — the ZWJ family measured 5 units against a true 2.
    expect(visualWidth(text)).toBe(2);
  });

  it('keeps two adjacent flags apart rather than fusing them', () => {
    expect(visualWidth(`${FLAG_GB}\u{1F1EB}\u{1F1F7}`)).toBe(4);
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

describe('sliceToWidth', () => {
  it('cuts plain text at the requested width', () => {
    expect(sliceToWidth('Lunchtime', 5)).toBe('Lunch');
  });

  it('drops an emoji it cannot fit whole rather than half of it', () => {
    expect(sliceToWidth(`ab${TEACHER}`, 3)).toBe('ab');
  });

  it('includes an emoji once there is room for both its width units', () => {
    expect(sliceToWidth(`ab${TEACHER}`, 4)).toBe(`ab${TEACHER}`);
  });

  it.each([
    ['a flag', FLAG_GB],
    ['a ZWJ profession', TEACHER],
    ['a skin tone', THUMBS_TONE]
  ])('never returns a fragment of %s', (_label, composite) => {
    for (let width = 0; width <= 4; width += 1) {
      const cut = sliceToWidth(composite, width);
      expect(cut === '' || cut === composite).toBe(true);
    }
  });
});

describe('emojiRunLength', () => {
  it.each([
    ['one emoji', '\u{1F9F8}', 1],
    ['a space-joined run', '\u{1F9F8} \u{1FA80}', 2],
    ['a composite, counted once', TEACHER, 1],
    ['plain text', 'Lunch', 0],
    ['an emoji with text attached', '\u{1F9F8}Play', 0],
    ['nothing', '', 0]
  ])('reports %s as %i', (_label, word, expected) => {
    expect(emojiRunLength(word)).toBe(expected);
  });
});

/**
 * The anchored form, used by `parseEventTitle` to take a colour dot and an event emoji off the
 * front of a title. It must recognise the same sequences as the width pattern, or the title
 * splitter leaves half a sequence behind — which put a bare joiner at the head of a rendered title.
 */
describe('LEADING_EMOJI', () => {
  it.each([
    ['a colour dot', '\u{1F7E1} Lunch', '\u{1F7E1}'],
    ['a plate with its selector', '\u{1F37D}️ Lunch', '\u{1F37D}️'],
    ['a whole ZWJ profession', `${TEACHER} Parent Evening`, TEACHER],
    ['a whole flag', `${FLAG_GB} Trip`, FLAG_GB],
    ['a whole skin-toned hand', `${THUMBS_TONE} Well Done`, THUMBS_TONE]
  ])('takes %s', (_label, title, expected) => {
    expect(title.match(LEADING_EMOJI)?.[0]).toBe(expected);
  });

  it('matches nothing when the title opens with text', () => {
    expect('Team Meeting'.match(LEADING_EMOJI)).toBeNull();
  });

  it('leaves no joiner behind when it takes a ZWJ sequence', () => {
    // The defect verbatim: matching only 👩 left "‍🏫 Parent…" as the title, and joining that back
    // to the emoji with a space rendered "👩 ‍🏫" — a woman, a space, then a stray school.
    const title = `${TEACHER} Parent Evening`;
    const remainder = title.slice(title.match(LEADING_EMOJI)?.[0].length ?? 0);

    expect(remainder.indexOf('‍')).toBe(-1);
    expect(remainder).toBe(' Parent Evening');
  });
});
