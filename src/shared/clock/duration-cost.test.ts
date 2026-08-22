import { describe, expect, it } from 'vitest';
import { keepsItsName, shownName } from './duration-cost';

const DURATION = '1 hr';

describe('shownName', () => {
  it.each([
    ['one line', ['Breakfast Club'], 'BreakfastClub'],
    ['a wrap', ['Breakfast', 'Club'], 'BreakfastClub'],
    ['a single-character ellipsis', ['Study Skills and…'], 'StudySkillsand'],
    ['a three-dot ellipsis', ['Study Skills', 'and Exam...'], 'StudySkillsandExam'],
    ['an emoji run split between glyphs', ['🧸 🪀', '🎈 Free Play'], '🧸🪀🎈FreePlay'],
    ['nothing at all', [], ''],
  ])('reads the name through %s', (_case, lines, expected) => {
    expect(shownName(lines)).toBe(expected);
  });

  it('does not mistake an ellipsis inside the text for a truncation marker', () => {
    expect(shownName(['Wait…', 'for it'])).toBe('Wait…forit');
  });
});

describe('keepsItsName', () => {
  /**
   * The four outcomes measured over the fixture's 192 pinned states (#141): 358 cards whose title
   * was untouched, 28 re-wrapped, 20 newly ellipsized, and one already-ellipsized title cut deeper.
   * The last is the case the issue's own option 3 does not name, and it is a real loss — `Planning`
   * disappears — so it is refused with the rest.
   */
  it.each([
    ['an untouched title', ['Aftercare'], ['Aftercare', DURATION], true],
    ['a re-wrap of the same words', ['Breakfast Club'], ['Breakfast', 'Club', DURATION], true],
    [
      'a re-wrap that splits an emoji run differently',
      ['🧸 🪀🎈 Free Play'],
      ['🧸 🪀', '🎈 Free Play', DURATION],
      true,
    ],
    [
      'a newly ellipsized title',
      ['Swimming Group', 'B Kit Check and', 'Coach Handover'],
      ['Swimming Group', 'B Kit Check', 'and Coach...', DURATION],
      false,
    ],
    [
      'an already-ellipsized title cut deeper',
      ['👩‍🏫 Parent Teacher', 'Conference', 'Planning...'],
      ['👩‍🏫 Parent', 'Teacher', 'Conference...', DURATION],
      false,
    ],
    [
      'an ellipsis that lands in the same place',
      ['Staff Debrief and', 'Planning...'],
      ['Staff Debrief', 'and Planning...', DURATION],
      true,
    ],
  ])('%s: %j → %j', (_case, titleOnly, withDuration, expected) => {
    expect(keepsItsName(titleOnly, withDuration, DURATION)).toBe(expected);
  });

  it('refuses a card whose duration line was dropped for want of width', () => {
    // `fitLabelToWidth` drops a trailing line it cannot fit rather than widening the card, so this
    // card paid the narrower width and got nothing back — worse than declining even though the
    // title is intact.
    expect(keepsItsName(['Aftercare'], ['Aftercare'], DURATION)).toBe(false);
  });

  it('refuses an empty card rather than reading past the end of it', () => {
    expect(keepsItsName([], [], DURATION)).toBe(false);
  });
});
