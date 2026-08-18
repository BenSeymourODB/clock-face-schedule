/**
 * What counts as one emoji, and how wide it is.
 *
 * Extracted so the two places that recognise emoji cannot drift: `clock-utils.ts` splits a leading
 * emoji off an event title, and `pack-lines.ts` measures and slices titles that now carry emoji
 * inline (#23). They disagreed once, and the result was visible on the dial — the title-splitter
 * took `👩` off `👩‍🏫`, leaving a bare zero-width joiner at the head of the title, which the
 * packer then rejoined with a space. One definition, used by both.
 */

/** An emoji renders roughly double the advance width of a plain character. */
export const EMOJI_WIDTH_UNITS = 2;

/**
 * One whole emoji, however many code points it spends.
 *
 * Composed as a list so each alternative can say what it is, and assembled with `new RegExp` so
 * the selectors stay `\uXXXX` escapes — written literally they are invisible in an editor, and
 * this repo's encoding defaults have mangled such characters in committed source before.
 *
 * Every branch must consume the *whole* sequence. Matching only its first code point over-counts
 * the width — a ZWJ family measured 5 units where it draws as one glyph — and lets a truncation
 * cut between the parts, which renders as a lone letter for a flag, or the wrong person for a
 * profession.
 *
 * **Order matters**: alternation is first-match-wins, and the composite branches would otherwise be
 * starved by the plain `Emoji_Presentation` inside the general branch. The tag branch requires at
 * least one tag character precisely so it cannot shadow a bare glyph.
 *
 * Note what is excluded: `\p{Emoji}` alone matches digits, `#` and `©`, so every bare-emoji branch
 * demands U+FE0F. Without it "Room 7" would be charged as double-width.
 */
const EMOJI_SEQUENCE =
  // A flag: a pair of regional indicators.
  '\\p{Regional_Indicator}\\p{Regional_Indicator}' +
  // A subdivision flag: a base glyph carrying a tag sequence, e.g. 🏴󠁧󠁢󠁳󠁣󠁴󠁿. Tags are required here,
  // so a bare 🏴 still falls through to the general branch below.
  '|\\p{Emoji_Presentation}[\\u{E0020}-\\u{E007E}]+\\u{E007F}' +
  // A keycap: base character, emoji selector, enclosing keycap.
  '|\\p{Emoji}\\uFE0F\\u20E3' +
  // A base glyph, an optional skin tone, then any number of ZWJ-joined continuations.
  '|(?:\\p{Emoji_Presentation}|\\p{Emoji}\\uFE0F)\\p{Emoji_Modifier}?' +
  '(?:\\u200D(?:\\p{Emoji_Presentation}|\\p{Emoji}\\uFE0F)\\p{Emoji_Modifier}?)*' +
  // A modifier base carrying a tone, where the base lacks Emoji_Presentation itself.
  '|\\p{Emoji_Modifier_Base}\\p{Emoji_Modifier}';

/**
 * Both patterns are built on first use and cached, rather than at module scope.
 *
 * Caching matters because `packLine` measures the growing candidate line on every word, and
 * compiling a fresh pattern per call made tokenisation quadratic. Deferring matters because a
 * top-level `new RegExp` is a side effect esbuild will not drop: with these as module constants,
 * the whole sequence string travelled into the **server** bundle (+549 bytes) even though
 * `parseEventTitle` is tree-shaken out of it. Built lazily, nothing in this module survives a
 * bundle that does not call into it.
 */
let leading: RegExp | undefined;
let scanner: RegExp | undefined;

/**
 * The sequence anchored, for taking an emoji prefix off the front of a title.
 *
 * Also admits a bare `Emoji_Modifier_Base` — a glyph like ☝ that carries neither
 * Emoji_Presentation nor a skin tone. It is allowed as a *prefix* but not as a width unit: as a
 * prefix the alternative is failing to recognise an authored emoji at all, whereas in running text
 * it is a narrow text-presentation glyph that double-charging would misjudge.
 */
export function leadingEmoji(): RegExp {
  if (leading === undefined) {
    leading = new RegExp(`^(?:${EMOJI_SEQUENCE}|\\p{Emoji_Modifier_Base})`, 'u');
  }
  return leading;
}

/** The scanning form, for finding emoji anywhere in a string. */
function emojiScanner(): RegExp {
  if (scanner === undefined) scanner = new RegExp(EMOJI_SEQUENCE, 'gu');
  return scanner;
}

export interface Glyph {
  text: string;
  /** 1 for a plain character, `EMOJI_WIDTH_UNITS` for a whole emoji — never split mid-sequence. */
  width: number;
}

/** Split `text` into plain characters and whole emoji glyphs, each carrying its own width. */
export function toGlyphs(text: string): Glyph[] {
  const emoji = emojiScanner();
  const glyphs: Glyph[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  // The cached pattern is stateful, so rewind it; nothing re-enters this mid-scan.
  emoji.lastIndex = 0;
  while ((match = emoji.exec(text)) !== null) {
    for (const char of text.slice(cursor, match.index)) glyphs.push({ text: char, width: 1 });
    glyphs.push({ text: match[0], width: EMOJI_WIDTH_UNITS });
    cursor = match.index + match[0].length;
  }
  for (const char of text.slice(cursor)) glyphs.push({ text: char, width: 1 });

  return glyphs;
}

/** Width of `text` in the units `charBudget` counts — 1 per character, 2 per emoji. */
export function visualWidth(text: string): number {
  return toGlyphs(text).reduce((total, glyph) => total + glyph.width, 0);
}

/** `text` cut to at most `maxWidth`, never through the middle of an emoji. */
export function sliceToWidth(text: string, maxWidth: number): string {
  if (maxWidth <= 0) return '';

  let width = 0;
  let result = '';
  for (const glyph of toGlyphs(text)) {
    if (width + glyph.width > maxWidth) break;
    width += glyph.width;
    result += glyph.text;
  }
  return result;
}

/**
 * How many emoji `word` holds, or 0 if it carries any text at all.
 *
 * Spaces are discounted so that an already-merged run still reads as pure emoji — counting the
 * joining space as text capped every run at two rather than three.
 */
export function emojiRunLength(word: string): number {
  const glyphs = toGlyphs(word).filter((glyph) => glyph.text !== ' ');
  if (glyphs.length === 0) return 0;
  return glyphs.every((glyph) => glyph.width === EMOJI_WIDTH_UNITS) ? glyphs.length : 0;
}
