import { describe, expect, it } from 'vitest';
import { fitTitleToArc } from './fit-title';

// budget(span°, radius, fontSize) = floor(span/360 × 2π × radius / (fontSize × 0.6))
//
// At radius 200 / font 14 (charWidth 8.4, circumference 1256.6):
//   30° → ~12 chars   60° → ~24   90° → ~37   120° → ~49   180° → ~74
//
// Cases pick spans where the expected behaviour is unambiguous even if the
// heuristic constants are nudged.
const RADIUS = 200;
const FONT = 14;

describe('fitTitleToArc', () => {
  it('fits a short single word on one line', () => {
    expect(fitTitleToArc('Lunch', 60, RADIUS, FONT)).toEqual({
      lines: ['Lunch'],
      didOverflow: false
    });
  });

  it('fits two short words on one line when the budget allows', () => {
    expect(fitTitleToArc('Team Lunch', 60, RADIUS, FONT)).toEqual({
      lines: ['Team Lunch'],
      didOverflow: false
    });
  });

  it('keeps a title on one line when it fits comfortably', () => {
    expect(fitTitleToArc('Family Game Night', 120, RADIUS, FONT)).toEqual({
      lines: ['Family Game Night'],
      didOverflow: false
    });
  });

  it('wraps to two lines when content fits on two but not one', () => {
    // 17 chars against a ~12-char budget, but "Family Game" + "Night" fits.
    const result = fitTitleToArc('Family Game Night', 30, RADIUS, FONT);
    expect(result.lines).toEqual(['Family Game', 'Night']);
    expect(result.didOverflow).toBe(false);
  });

  it('greedy-packs the first line and marks the second when words remain', () => {
    // ~12 chars/line: "Pick up" then "groceries", with "today" cut.
    const result = fitTitleToArc('Pick up groceries today', 30, RADIUS, FONT);
    expect(result.lines[0]).toBe('Pick up');
    expect(result.lines[1]).toMatch(/^groceries/);
    expect(result.lines[1].endsWith('...')).toBe(true);
    expect(result.didOverflow).toBe(true);
  });

  it('truncates line 2 when the next word alone exceeds the budget', () => {
    const result = fitTitleToArc('Hi supercalifragilistic', 30, RADIUS, FONT);
    expect(result.lines[0]).toBe('Hi');
    expect(result.lines[1].startsWith('super')).toBe(true);
    expect(result.lines[1].endsWith('...')).toBe(true);
    expect(result.didOverflow).toBe(true);
  });

  it('marks line 2 when the content needs three or more lines', () => {
    const result = fitTitleToArc('the quick brown fox jumps over the lazy dog', 30, RADIUS, FONT);
    expect(result.lines).toHaveLength(2);
    expect(result.lines[1].endsWith('...')).toBe(true);
    expect(result.didOverflow).toBe(true);
  });

  it('ellipsizes rather than splitting a single over-long word', () => {
    const result = fitTitleToArc('supercalifragilisticexpialidocious', 30, RADIUS, FONT);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].endsWith('...')).toBe(true);
    expect(result.lines[0].length).toBeGreaterThan(3);
    expect(result.didOverflow).toBe(true);
  });

  it('reports overflow with no lines when not even one character fits', () => {
    // 2° at radius 200 → 6.98px of circumference against an 8.4px character.
    expect(fitTitleToArc('A', 2, RADIUS, FONT)).toEqual({ lines: [], didOverflow: true });
  });

  it('reports no overflow for an empty title', () => {
    expect(fitTitleToArc('   ', 60, RADIUS, FONT)).toEqual({ lines: [], didOverflow: false });
  });

  it('collapses redundant whitespace between words', () => {
    const result = fitTitleToArc('  Family   Game   Night  ', 60, RADIUS, FONT);
    expect(result.lines.join(' ')).toBe('Family Game Night');
  });

  it('never returns more than two lines', () => {
    const result = fitTitleToArc('one two three four five six seven eight', 20, RADIUS, FONT);
    expect(result.lines.length).toBeLessThanOrEqual(2);
  });

  describe('budget scaling', () => {
    it('widens the budget with the title radius', () => {
      expect(fitTitleToArc('Family Game Night', 30, 200, 14).lines).toHaveLength(2);
      expect(fitTitleToArc('Family Game Night', 30, 400, 14).lines).toHaveLength(1);
    });

    it('widens the budget as the font shrinks', () => {
      expect(fitTitleToArc('Family Game Night', 30, 200, 14).lines).toHaveLength(2);
      expect(fitTitleToArc('Family Game Night', 30, 200, 7).lines).toHaveLength(1);
    });
  });

  describe('at tight budgets the truncation marker is always present', () => {
    // At radius 20 / font 14: 30° → budget 1, 60° → 2, 90° → 3.
    it.each([
      [30, '…'],
      [60, 's…'],
      [90, 'su…']
    ])('renders %i° as %s using the single-character ellipsis', (span, expected) => {
      const result = fitTitleToArc('supercali', span, 20, 14);
      expect(result.lines).toEqual([expected]);
      expect(result.didOverflow).toBe(true);
    });

    it('does not invent a marker when the content fits the tight budget exactly', () => {
      expect(fitTitleToArc('abc', 90, 20, 14)).toEqual({
        lines: ['abc'],
        didOverflow: false
      });
    });
  });

  describe('with maxLines = 1', () => {
    it('renders a fitting title on a single line', () => {
      expect(fitTitleToArc('Lunch', 60, RADIUS, FONT, 1)).toEqual({
        lines: ['Lunch'],
        didOverflow: false
      });
    });

    it('ellipsizes instead of wrapping', () => {
      // Same input wraps to two lines at the default maxLines.
      const result = fitTitleToArc('Family Game Night', 30, RADIUS, FONT, 1);
      expect(result.lines).toHaveLength(1);
      expect(result.lines[0].endsWith('...')).toBe(true);
      expect(result.didOverflow).toBe(true);
    });

    it('never returns more than one line', () => {
      const result = fitTitleToArc(
        'the quick brown fox jumps over the lazy dog',
        30,
        RADIUS,
        FONT,
        1
      );
      expect(result.lines).toHaveLength(1);
      expect(result.didOverflow).toBe(true);
    });
  });
});
