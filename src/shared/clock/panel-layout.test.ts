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
  panelAllowed,
  panelFitsBoard,
  planAgendaCards
} from './panel-layout';
import { SWATCH_RESERVE } from './card-swatch';
import { LABEL_MARGIN_KNEE_UNITS, PANEL_RESERVE_UNITS } from './label-margin';
import { visualWidth } from './emoji';
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

/**
 * Cards of `lines` lines that fit down the column at `gap` between them.
 *
 * Half a border falls outside the card at each end of the column, so the usable height is
 * `600 − stroke` rather than 600. Getting that wrong is what would silently drop the count.
 */
function cardCount(lines: number, gap: number = PANEL_CARD_GAP): number {
  const height = labelCardHeight(lines, PANEL_CARD_FONT_SIZE, PANEL_CARD_PADDING.y);
  const inset = PANEL_CARD_STROKE / 2;

  let count = 0;
  let y = inset;
  while (y + height + inset <= PANEL_HEIGHT) {
    y += height + gap;
    count += 1;
  }

  return count;
}

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

describe('panelAllowed', () => {
  /**
   * The layers as `main.ts` hands them over: the templated attribute first, the page's own query
   * string second. `undefined` is an absent attribute (a jsdom mount, a page with no `data-panel`),
   * `''` is a **stripped** one — which is what `build/preview.html` and every real load with no
   * `?panel=` actually carry, so it is the common case rather than an edge one.
   */
  it.each([
    ['both layers silent', [undefined, null], true],
    ['a stripped attribute and no parameter — the preview, and every ordinary load', ['', null], true],
    ['?panel=0 in the query string', ['', '0'], false],
    ['?panel=1 in the query string', ['', '1'], true],
    ['the templated attribute, which doGet saw', ['0', null], false],
    ['the attribute winning over a contrary query string', ['0', '1'], false],
    ['the attribute winning the other way, so neither direction is special', ['1', '0'], true],
    ['an unrecognised attribute falling through to the parameter', ['yes', '0'], false],
    ['an unrecognised value in both layers', ['off', 'false'], true],
    ['no layers at all', [], true]
  ])('%s', (_name, layers, expected) => {
    expect(panelAllowed(layers as (string | null | undefined)[])).toBe(expected);
  });

  /**
   * **The asymmetry is deliberate and is the one decision in #185**, so it is asserted rather than
   * left to the docstring: `1` means "draw it where the board can carry it", which is the default,
   * and *not* "draw it regardless".
   *
   * A force-on would have to overrule `panelFitsBoard`, and a column on a board that fails it either
   * takes height from the dial — ADR 0009's one absolute — or pushes the labels below the 75.4-unit
   * knee where the panel and the labels trade width one-for-one. So the parameter can only subtract a
   * surface, never add one, and every picture it produces is one some real board draws.
   *
   * Stated as the property that has to hold: on a board `panelFitsBoard` rejects, no value of the
   * parameter shows a column.
   */
  it.each([['0'], ['1'], [''], ['anything']])(
    'cannot put a column on a board that fails the fit test: ?panel=%s',
    (value) => {
      const tooNarrow = { width: 1184, height: 854 };
      const fits = panelFitsBoard(
        tooNarrow,
        DIAL_SIZE,
        PANEL_RESERVE_UNITS,
        LABEL_MARGIN_KNEE_UNITS
      );

      expect(fits).toBe(false);
      // `showPanel`'s own expression, which is what makes this the guarantee rather than a hope.
      expect(panelAllowed(['', value]) && fits).toBe(false);
    }
  );
});

describe('the card geometry against ADR 0009', () => {
  /**
   * ADR 0009 wrote this as *"five cards at 26 units over three lines, seven at two lines"*, and its
   * third amendment moves the body to the arc-title size (#174), which buys **one more card in each
   * column**: six and eight.
   *
   * This is the arithmetic the 180-unit allocation was chosen on, so the constants have to keep
   * reproducing it. A change to the font size, the gap or the title line cap that quietly holds one
   * fewer has given up part of the panel's own justification (#70) without saying so — which is why
   * these are numbers rather than a `>= 5`.
   */
  it.each([
    [3, 6],
    [2, 8]
  ])('holds %i-line cards, %i of them', (lines, expected) => {
    expect(cardCount(lines)).toBe(expected);
  });

  /**
   * The gap is the largest whole number that keeps the tall-card count, and being *at* that maximum is
   * the property — not the value 5 being right. One more unit costs a card.
   *
   * **Stated as the two counts rather than against a computed ceiling**, because the ceiling form had a
   * dead half. `cardCount(3, g) === n` is algebraically the same inequality as `g <= ceiling(n)`, so
   * once the count was derived from the gap, asserting `gap <= ceiling` could not fail for any gap at
   * all — the work was being done entirely by the `gap + 1` bound beside it. The pair below says the
   * same thing with nothing vacuous in it, and it does not need the ceiling arithmetic to be right.
   *
   * That 5 survived #174's type lever is luck, not design: at 26 it was the maximum that kept *five*
   * cards, and at 21.2576 it is the maximum that keeps *six* (the ceiling being 5.3216).
   */
  it('sets the gap at the maximum that still keeps six tall cards', () => {
    expect(cardCount(3, PANEL_CARD_GAP)).toBe(6);
    expect(cardCount(3, PANEL_CARD_GAP + 1)).toBeLessThan(6);
  });

  /** The tall card is the title's line cap plus the one trailing line. */
  it('makes the tall card three lines', () => {
    expect(PANEL_CARD_MAX_TITLE_LINES + 1).toBe(3);
  });

  /**
   * ADR 0009: *"It holds 10 characters a line at 26 units."* That figure is what justifies 180 rather
   * than something smaller, so nothing may quietly eat into it — and #160's swatch openly does, by
   * the one character its own costing prices it at.
   *
   * The third amendment's type lever (#174) moves both: **13 before the swatch and 12 after it** at
   * 21.2576. Both are asserted, as before, so the *reason* the shipped figure is the lower of the two
   * stays visible rather than 13 drifting to 12 unremarked. The swatch still costs exactly one
   * character, which is worth knowing did not change with the body size.
   */
  it('holds thirteen characters a line before the swatch, and twelve after it', () => {
    const cardWidth = PANEL_WIDTH_UNITS - PANEL_CARD_STROKE;

    expect(charBudget(cardWidth - PANEL_CARD_PADDING.x * 2, PANEL_CARD_FONT_SIZE)).toBe(13);
    expect(
      charBudget(cardWidth - SWATCH_RESERVE - PANEL_CARD_PADDING.x * 2, PANEL_CARD_FONT_SIZE)
    ).toBe(12);
  });

  /**
   * **The prompt this test was written to be, firing.** In its previous form it asserted the budget
   * *could not* hold `HH:MM–HH:MM` — the reason the trailing line is a duration and not the clock
   * times the brainstorm asks for — and said so:
   *
   * > If the budget ever reaches eleven, `HH:MM–HH:MM` becomes affordable and this test is the prompt
   * > to revisit it.
   *
   * #174's type lever took it to twelve. So the assertion inverts: the budget affords the line, and
   * what the trailing line should *say* is now a choice rather than a constraint.
   *
   * Deliberately still an assertion rather than a deletion, and deliberately not acted on here.
   * #169 owns the choice — a duration states a length and a clock time states a boundary, which are
   * different claims and the panel was justified on the second — and #178 is concurrently deciding
   * whether durations are shown at all. This keeps the affordance from being lost between the two.
   */
  it('now affords an HH:MM–HH:MM line, which makes the trailing line #169’s choice', () => {
    const cardWidth = PANEL_WIDTH_UNITS - PANEL_CARD_STROKE - SWATCH_RESERVE;
    const budget = charBudget(cardWidth - PANEL_CARD_PADDING.x * 2, PANEL_CARD_FONT_SIZE);

    // `visualWidth`, not `.length` — that is what `fitLabelToWidth` gates the trailing line on, and
    // the two part company the moment a glyph counts double.
    expect(visualWidth('09:00–09:45')).toBe(11);
    expect(budget).toBeGreaterThanOrEqual(visualWidth('09:00–09:45'));
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

  /**
   * #178's panel link. With durations off no card states a length — the same absence a sub-minute
   * event already produces, so the column is one line shorter per card rather than showing a mixed
   * set. Asserted on an event that plainly *would* carry one (50 min), so this cannot pass by the
   * duration being empty for another reason.
   */
  it('states no duration on any card when durations are off', () => {
    const events = [event('a', 'Yoga', 0, 50), event('b', 'Assembly', 10, 55)];

    for (const entry of agendaEntries(events, NOW, false)) {
      expect(entry.trailing).toBeUndefined();
    }
  });

  it('states the duration when durations are on, which is the default', () => {
    const [byDefault] = agendaEntries([event('a', 'Yoga', 0, 50)], NOW);
    const [explicit] = agendaEntries([event('a', 'Yoga', 0, 50)], NOW, true);

    expect(byDefault.trailing).toBe('50 min');
    expect(explicit.trailing).toBe('50 min');
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

  /** The count above, arrived at through the planner rather than through the arithmetic. */
  it('fits six three-line cards and reports the rest as dropped', () => {
    const plan = planAgendaCards(entries(8), { height: PANEL_HEIGHT });

    expect(plan.cards).toHaveLength(6);
    expect(plan.dropped).toBe(2);
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
   * A ragged right edge down a column of six reads as damage. The floating label wants a card no
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
   *
   * The filler count is the tall-card capacity, so it has to move with it: at five the column now has
   * room left and the tiny card fits, which made this test pass while testing nothing (#174).
   */
  it('stops at the first card that does not fit rather than reordering', () => {
    const tall = entries(cardCount(3));
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
