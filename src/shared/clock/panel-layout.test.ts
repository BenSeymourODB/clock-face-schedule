import { describe, expect, it } from 'vitest';
import { labelCardHeight } from './fit-label';
import {
  PANEL_CARD_FONT_SIZE,
  PANEL_CARD_GAP,
  PANEL_CARD_MAX_TITLE_LINES,
  PANEL_CARD_PADDING,
  PANEL_CARD_STROKE,
  PANEL_WIDTH_UNITS,
  agendaEntries,
  panelFitsBoard,
  planAgendaCards
} from './panel-layout';
import { LABEL_MARGIN_KNEE_UNITS, PANEL_RESERVE_UNITS } from './label-margin';
import { charBudget } from './pack-lines';
import type { ClockEventInput } from './types';

const DIAL_SIZE = 600;
const PANEL_HEIGHT = 600;

function event(
  id: string,
  title: string,
  startMinutes: number,
  endMinutes: number,
  isAllDay = false
): ClockEventInput {
  const at = (minutes: number) => new Date(2026, 7, 22, 9, 0, 0).getTime() + minutes * 60_000;
  return {
    id,
    title,
    startDate: new Date(at(startMinutes)).toISOString(),
    endDate: new Date(at(endMinutes)).toISOString(),
    isAllDay,
    fallbackColor: '#3b82f6'
  };
}

const NOW = new Date(2026, 7, 22, 9, 0, 0);

describe('PANEL_WIDTH_UNITS', () => {
  /**
   * The column drawn and the width held out of the labels' margin have to be one number. Two that
   * agree today is how a reserve stops matching the thing reserved — the labels would keep 180 units
   * clear of a panel that had grown, and cards would land on it.
   */
  it('is the same 180 units label-margin.ts holds back for it', () => {
    expect(PANEL_WIDTH_UNITS).toBe(PANEL_RESERVE_UNITS);
  });
});

describe('panelFitsBoard', () => {
  /**
   * ADR 0009's one absolute: "The dial never pays." The threshold is exactly where the remainder
   * after the panel stops being at least as wide as the board is tall.
   */
  it.each([
    ['16:9', 1920, 1080, true],
    ['16:10', 1920, 1200, true],
    ['16:9 portrait', 1080, 1920, false],
    ['square', 1000, 1000, false],
    ['exactly at the 1.3 threshold', 1300, 1000, true],
    ['a hair under it', 1299.9, 1000, false]
  ])('%s → %s', (_name, width, height, expected) => {
    expect(panelFitsBoard({ width, height }, DIAL_SIZE)).toBe(expected);
  });

  it('is false on a board with no layout, so an unmeasurable page shows no panel', () => {
    expect(panelFitsBoard({ width: 0, height: 0 }, DIAL_SIZE)).toBe(false);
    expect(panelFitsBoard({ width: 1920, height: 1080 }, 0)).toBe(false);
  });

  /**
   * The threshold is `(size + panel) / size`, so it has to move when the panel does. A hard-coded
   * 1.3 would keep a wider panel on a board that can no longer afford it — which is the dial paying.
   */
  it('moves with the panel width rather than pinning 1.3', () => {
    expect(panelFitsBoard({ width: 1300, height: 1000 }, DIAL_SIZE, 360)).toBe(false);
    expect(panelFitsBoard({ width: 1600, height: 1000 }, DIAL_SIZE, 360)).toBe(true);
  });

  /**
   * **The case rendering caught and 1,608 tests did not**, in its corrected form.
   *
   * The dial keeping its height is not enough. At 1330×1000 the board clears the 1.3 threshold — the
   * dial is still full height — and `⚫ Assembly`'s card crossed into the column by 5.9 px. The first
   * fix required the room beside the dial to cover `--label-frame`, which was still the wrong
   * currency: the frame is the *vertical* allowance, and on the 1-hour dial a card reaches 138.7
   * units, so at 16:10 a card went 30.7 px into the column against 120.8 units of room.
   *
   * A card can no longer reach the column at all — the host grants the labels the room that exists
   * rather than the viewport's share of it — so what this gates is *cost*: below ADR 0009's 75.4-unit
   * knee the panel and the labels trade width one-for-one. 16:10 is the ADR's binding aspect and must
   * keep its panel, which is the row that makes this more than "reject narrow boards".
   *
   * The figures below are the rendered content boxes, so they are the numbers the client measures.
   */
  it.each([
    ['16:9', 1762.3, 922.3, true],
    ['16:10 — ADR 0009’s binding aspect, which must keep its panel', 1744.8, 1024.8, true],
    ['the 1330×1000 board a card intruded on', 1184, 854, false],
    ['4:3, the same shape', 912, 656, false],
    ['1400×1000, above the dial-size threshold but below the knee', 1254, 854, false]
  ])('shows the panel only where the labels stay saturated: %s', (_name, width, height, expected) => {
    expect(
      panelFitsBoard({ width, height }, DIAL_SIZE, PANEL_RESERVE_UNITS, LABEL_MARGIN_KNEE_UNITS)
    ).toBe(expected);
  });

  /** Zero is the dial-size condition alone — the default, and what an unmeasurable page gives. */
  it('falls back to the dial-size condition with no minimum margin', () => {
    expect(panelFitsBoard({ width: 1300, height: 1000 }, DIAL_SIZE, PANEL_RESERVE_UNITS, 0)).toBe(true);
  });

  it('treats a negative minimum as none rather than as credit', () => {
    expect(panelFitsBoard({ width: 1300, height: 1000 }, DIAL_SIZE, PANEL_RESERVE_UNITS, -500)).toBe(true);
  });
});

describe('the card geometry against ADR 0009', () => {
  /**
   * > "The panel holds five cards at 26 units over three lines, seven at two lines."
   *
   * This is the arithmetic the 180-unit allocation was chosen on, so the constants have to keep
   * reproducing it. A change to the font size, the gap or the title line cap that quietly holds four
   * cards has given up the panel's own justification (#70) without saying so.
   */
  it.each([
    [3, 5],
    [2, 7]
  ])('holds %i-line cards, %i of them', (lines, expected) => {
    const height = labelCardHeight(lines, PANEL_CARD_FONT_SIZE, PANEL_CARD_PADDING.y);
    // Half a border falls outside the card at each end of the column, so the usable height is
    // `600 − stroke` rather than 600. Getting this wrong is what would silently drop the count.
    const inset = PANEL_CARD_STROKE / 2;

    let count = 0;
    let y = inset;
    while (y + height + inset <= PANEL_HEIGHT) {
      y += height + PANEL_CARD_GAP;
      count += 1;
    }

    expect(count).toBe(expected);
  });

  /**
   * The gap is the largest whole number that keeps the five, and being at the ceiling is the point:
   * six holds only four cards. Derived rather than restated, so raising the stroke or the line height
   * fails here with the reason rather than quietly costing a card.
   */
  it('sets the gap at the ceiling that keeps five tall cards', () => {
    const tall = labelCardHeight(3, PANEL_CARD_FONT_SIZE, PANEL_CARD_PADDING.y);
    const ceiling = (PANEL_HEIGHT - PANEL_CARD_STROKE - 5 * tall) / 4;

    expect(PANEL_CARD_GAP).toBeLessThanOrEqual(ceiling);
    expect(PANEL_CARD_GAP + 1).toBeGreaterThan(ceiling);
  });

  /** The tall card is the title's line cap plus the one trailing line. */
  it('makes the tall card three lines', () => {
    expect(PANEL_CARD_MAX_TITLE_LINES + 1).toBe(3);
  });

  /**
   * ADR 0009: "It holds 10 characters a line at 26 units." That figure is what justifies 180 rather
   * than something smaller, so the padding must not quietly eat into it.
   */
  it('holds ADR 0009’s ten characters a line', () => {
    const cardWidth = PANEL_WIDTH_UNITS - PANEL_CARD_STROKE;
    expect(charBudget(cardWidth - PANEL_CARD_PADDING.x * 2, PANEL_CARD_FONT_SIZE)).toBe(10);
  });

  /**
   * Recorded as an assertion rather than only in the plan doc, because it is the reason the trailing
   * line is a duration and not the clock times the brainstorm asks for. If the budget ever reaches
   * eleven, `HH:MM–HH:MM` becomes affordable and this test is the prompt to revisit it.
   */
  it('cannot afford an HH:MM–HH:MM line, which is why the trailing line is a duration', () => {
    const cardWidth = PANEL_WIDTH_UNITS - PANEL_CARD_STROKE;
    const budget = charBudget(cardWidth - PANEL_CARD_PADDING.x * 2, PANEL_CARD_FONT_SIZE);
    expect('09:00–09:45'.length).toBeGreaterThan(budget);
  });
});

describe('agendaEntries', () => {
  it('lists what is running and what is next, earliest first', () => {
    const entries = agendaEntries(
      [
        event('c', 'Later', 120, 180),
        event('a', 'Running now', -30, 30),
        event('b', 'Next', 30, 90)
      ],
      NOW
    );

    expect(entries.map((entry) => entry.id)).toEqual(['a', 'b', 'c']);
  });

  it('drops an event that has already ended', () => {
    const entries = agendaEntries([event('done', 'Over', -120, -60), event('live', 'On', 0, 60)], NOW);
    expect(entries.map((entry) => entry.id)).toEqual(['live']);
  });

  /** Exclusive at `now`, matching `filterEventsForPeriod`'s treatment of a window edge. */
  it('drops an event ending exactly now', () => {
    expect(agendaEntries([event('edge', 'Ends now', -60, 0)], NOW)).toEqual([]);
  });

  it('drops all-day events, which have nowhere to go yet', () => {
    const entries = agendaEntries(
      [event('allday', 'Inset Day', 0, 24 * 60, true), event('timed', 'Assembly', 0, 45)],
      NOW
    );
    expect(entries.map((entry) => entry.id)).toEqual(['timed']);
  });

  /** A wall display left up for weeks must not swap two cards that start in the same minute. */
  it('breaks a tie on id so the order is total', () => {
    const forward = agendaEntries([event('b', 'B', 0, 60), event('a', 'A', 0, 60)], NOW);
    const backward = agendaEntries([event('a', 'A', 0, 60), event('b', 'B', 0, 60)], NOW);

    expect(forward.map((entry) => entry.id)).toEqual(['a', 'b']);
    expect(backward.map((entry) => entry.id)).toEqual(['a', 'b']);
  });

  it('resolves the colour emoji and inlines the event emoji, as the arcs do', () => {
    const [entry] = agendaEntries([event('a', '\u{1F7E1} \u{1F37D}️ Lunch', 0, 50)], NOW);

    expect(entry.title).toBe('\u{1F37D}️ Lunch');
    expect(entry.color).not.toBe('#3b82f6');
    expect(entry.trailing).toBe('50 min');
  });

  it('leaves the trailing line off an event too short to state a duration', () => {
    const [entry] = agendaEntries([event('a', 'Bell', 0, 0.4)], NOW);
    expect(entry.trailing).toBeUndefined();
  });
});

describe('planAgendaCards', () => {
  const entries = (count: number) =>
    Array.from({ length: count }, (_unused, index) => ({
      id: `e${index}`,
      title: `Event number ${index} with a title long enough to wrap onto two lines`,
      color: '#3b82f6',
      trailing: '30 min'
    }));

  it('stacks cards down the column with the gap between them', () => {
    const { cards } = planAgendaCards(entries(3), { height: PANEL_HEIGHT });

    expect(cards).toHaveLength(3);
    for (let index = 1; index < cards.length; index += 1) {
      const previous = cards[index - 1];
      expect(cards[index].y).toBeCloseTo(previous.y + previous.height + PANEL_CARD_GAP, 6);
    }
    expect(cards[0].y).toBe(PANEL_CARD_STROKE / 2);
  });

  /** The ADR's five, arrived at through the planner rather than through the arithmetic above. */
  it('fits five three-line cards and reports the rest as dropped', () => {
    const plan = planAgendaCards(entries(8), { height: PANEL_HEIGHT });

    expect(plan.cards).toHaveLength(5);
    expect(plan.dropped).toBe(3);
    expect(plan.cards[0].lines).toHaveLength(3);
  });

  /**
   * Not just the rect — **the border too.** A border is centred on the card's edge and an outermost
   * `<svg>` is `overflow: hidden` by UA default, so a card flush with the column had its left and
   * right borders painted at half the weight of its horizontals: 1.6 px of stroke clipped at
   * 1920×1080. Found by looking, since every attribute was correct.
   */
  it('keeps every card’s whole border inside the column', () => {
    const { cards } = planAgendaCards(entries(8), { height: PANEL_HEIGHT });
    const half = PANEL_CARD_STROKE / 2;

    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      expect(card.x - half).toBeGreaterThanOrEqual(0);
      expect(card.x + card.width + half).toBeLessThanOrEqual(PANEL_WIDTH_UNITS);
      expect(card.y - half).toBeGreaterThanOrEqual(0);
      expect(card.y + card.height + half).toBeLessThanOrEqual(PANEL_HEIGHT);
    }
  });

  /**
   * A ragged right edge down a column of five reads as damage. The floating label wants a card no
   * wider than its text — to stay off its neighbours — and the panel wants the opposite.
   */
  it('gives every card the column’s full width, not its own text width', () => {
    const { cards } = planAgendaCards(
      [
        { id: 'short', title: 'Yoga', color: '#fff', trailing: '22 min' },
        { id: 'long', title: 'Swimming Group B Kit Check', color: '#fff', trailing: '1 hr' }
      ],
      { height: PANEL_HEIGHT }
    );

    const cardWidth = PANEL_WIDTH_UNITS - PANEL_CARD_STROKE;
    expect(cards.map((card) => card.width)).toEqual([cardWidth, cardWidth]);
    expect(cards.map((card) => card.x)).toEqual([PANEL_CARD_STROKE / 2, PANEL_CARD_STROKE / 2]);
  });

  /** A short title takes a shorter card, so the next one starts sooner and more than five may fit. */
  it('lets one-line titles pack tighter than the ADR’s five', () => {
    const short = Array.from({ length: 9 }, (_unused, index) => ({
      id: `s${index}`,
      title: 'Yoga',
      color: '#fff'
    }));

    expect(planAgendaCards(short, { height: PANEL_HEIGHT }).cards.length).toBeGreaterThan(5);
  });

  /**
   * Time order is the column's whole meaning. Skipping a tall card for a short one behind it would
   * put 15:30 above 14:30.
   */
  it('stops at the first card that does not fit rather than reordering', () => {
    const tall = entries(5);
    const plan = planAgendaCards([...tall, { id: 'tiny', title: 'X', color: '#fff' }], {
      height: PANEL_HEIGHT
    });

    expect(plan.cards.map((card) => card.id)).toEqual(tall.map((entry) => entry.id));
    expect(plan.dropped).toBe(1);
  });

  it('ellipsizes a title too long for its two lines and says so', () => {
    const { cards } = planAgendaCards(
      [
        {
          id: 'long',
          title: 'Parent Teacher Conference Planning Committee Notes and Actions and More',
          color: '#fff',
          trailing: '1 hr'
        }
      ],
      { height: PANEL_HEIGHT }
    );

    expect(cards[0].didOverflow).toBe(true);
    expect(cards[0].lines).toHaveLength(3);
    expect(cards[0].lines[1]).toMatch(/\.\.\.$/);
  });

  it('is empty rather than negative on a column with no height', () => {
    expect(planAgendaCards(entries(3), { height: 0 })).toEqual({ cards: [], dropped: 3 });
  });
});
