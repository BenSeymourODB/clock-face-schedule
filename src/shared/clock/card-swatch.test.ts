import { describe, expect, it } from 'vitest';
import { SWATCH_GAP, SWATCH_RESERVE, SWATCH_WIDTH, cardSwatchLayout } from './card-swatch';
import { CHAR_WIDTH_RATIO, charBudget } from './pack-lines';

const PADDING = { x: 6, y: 3 };

describe('cardSwatchLayout', () => {
  const card = { x: 100, y: 200, width: 150, height: 60 };

  it('sits inside the card padding, at the leading edge', () => {
    const { swatch } = cardSwatchLayout(card, PADDING);

    expect(swatch.x).toBe(card.x + PADDING.x);
    expect(swatch.y).toBe(card.y + PADDING.y);
    expect(swatch.width).toBe(SWATCH_WIDTH);
  });

  it('spans the card rather than its first line, so it reads as the card’s colour', () => {
    const { swatch } = cardSwatchLayout(card, PADDING);

    expect(swatch.height).toBe(card.height - PADDING.y * 2);
  });

  it('leaves the gap before the text, and no more', () => {
    const { swatch, textCentreX } = cardSwatchLayout(card, PADDING);
    const textLeft = textCentreX - (card.width - PADDING.x * 2 - SWATCH_RESERVE) / 2;

    expect(textLeft - (swatch.x + swatch.width)).toBeCloseTo(SWATCH_GAP, 6);
  });

  it('centres the text in the room that remains, not in the whole card', () => {
    const { textCentreX } = cardSwatchLayout(card, PADDING);

    expect(textCentreX).toBeCloseTo(card.x + card.width / 2 + SWATCH_RESERVE / 2, 6);
  });

  it('stays inside the card at the smallest box a one-line card can be', () => {
    // padding-only height: the swatch degrades to nothing rather than to a negative rect.
    const { swatch } = cardSwatchLayout({ x: 0, y: 0, width: 24, height: 6 }, PADDING);

    expect(swatch.height).toBe(0);
  });

  /**
   * Not reachable through `floatingLabel`, whose narrowest card is 24 units — but the next caller is
   * #39's agenda card, whose widths come from a panel. A patch painted outside its own border is the
   * kind of defect that renders plausibly and logs nothing.
   */
  it.each([
    ['narrower than the patch and its padding', 16, 4],
    ['padding only', 12, 0],
    ['narrower than its own padding', 8, 0]
  ])('keeps the patch inside a card %s', (_label, width, expected) => {
    const { swatch } = cardSwatchLayout({ x: 0, y: 0, width, height: 30 }, PADDING);

    expect(swatch.width).toBe(expected);
    expect(swatch.x + swatch.width).toBeLessThanOrEqual(width);
  });

  /**
   * #30's costing is what chose 8 over 4, and it is an arithmetic claim rather than a taste one: the
   * budget floors to whole characters, so the wide swatch is free. If `CHAR_WIDTH_RATIO` or the
   * label font ever moves, this is the assertion that says the choice needs re-pricing.
   */
  it.each([
    ['16:9', 151.3, 13, 12],
    ['16:10', 98.0, 8, 7]
  ])('costs one character a line on %s', (_board, cardWidth, bare, withSwatch) => {
    const fontSize = 17.52;
    const budget = (reserve: number) => charBudget(cardWidth - PADDING.x * 2 - reserve, fontSize);

    expect(budget(0)).toBe(bare);
    expect(budget(SWATCH_RESERVE)).toBe(withSwatch);
    // The narrow version #30 priced against: 4 units with a 3-unit gap costs the same integer.
    expect(budget(4 + 3)).toBe(withSwatch);
    expect(fontSize * CHAR_WIDTH_RATIO).toBeCloseTo(10.512, 6);
  });
});
