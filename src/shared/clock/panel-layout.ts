/**
 * The agenda panel's column and the cards in it (#39, ADR 0009).
 *
 * ADR 0009 allocates the board's spare width once: 180 units of panel on the right, the dial keeping
 * the board's height and centred in what remains. `label-margin.ts` has been subtracting that 180
 * from the labels' allowance since #148, so the column arrives into room already held for it and
 * nothing already drawn moves.
 *
 * Pure arithmetic over numbers the caller reads off the DOM — no host types, so `src/shared/`
 * compiles without the DOM lib (ADR 0003) and every figure here is checkable in node.
 */
import { formatEventDuration } from './duration';
import { fitLabelToWidth } from './fit-label';
import { combineTitleWithEmoji, parseEventTitle } from './clock-utils';
import { PANEL_RESERVE_UNITS } from './label-margin';
import type { ClockEventInput } from './types';

/**
 * The panel's own viewBox, in the dial's units.
 *
 * Width is the reserve, so the column drawn and the width held out of the labels' margin are one
 * number rather than two that agree today. Height matches the dial's viewBox so a unit is the same
 * length in both drawings — the panel's box is `0.3 ×` the dial's box and both are square-fitted, so
 * "26 units" means the same thing on either side of the page.
 */
export const PANEL_WIDTH_UNITS = PANEL_RESERVE_UNITS;

/**
 * Card body size, straight from ADR 0009: *"180 is the smallest width that serves the panel's own
 * justification. It holds 10 characters a line at 26 units."*
 *
 * This is the figure the whole allocation was chosen for. #70's decision is that a three-deep
 * cluster's arc titles — 6.24 units, about 1.1 m of reading distance once the dial's 85.4% share of
 * the board's height is taken off — are accepted on the band, and that the panel is the surface that
 * carries those names at a size a room can read. Shrinking this gives that up.
 */
export const PANEL_CARD_FONT_SIZE = 26;

/**
 * Gap between cards — the largest whole number that keeps ADR 0009's five, floored.
 *
 * The column's usable height is `600 − PANEL_CARD_STROKE` rather than 600, because half a border
 * falls outside each card and the outermost `<svg>` clips it. Five three-line cards leave
 * `597.92 − 576 = 21.92` for four gaps, so **5.48 is the ceiling and 5 is the value**. Six — the
 * figure before the stroke was accounted for — holds only four, which gives up the count the whole
 * 180-unit allocation was justified by.
 */
export const PANEL_CARD_GAP = 5;

/**
 * Lines a card's title may wrap to, before its trailing line.
 *
 * Two, so the tall card is three lines — and at 26 units in a column of 597.92 usable that
 * reproduces ADR 0009's two card counts exactly, which is the check that these are the constants it
 * was written against:
 *
 * | | units |
 * | --- | --- |
 * | `labelCardHeight(3, 26, 3)` | 115.2 |
 * | five of them, four 5-unit gaps | 576 + 20 = **596**, inside the 597.92 |
 * | `labelCardHeight(2, 26, 3)` | 78.8 |
 * | seven of them, six gaps | 551.6 + 30 = 581.6 |
 * | eight | 630.4 + 35 = 665.4 — does not fit |
 *
 * > "The panel holds five cards at 26 units over three lines, seven at two lines." — ADR 0009
 */
export const PANEL_CARD_MAX_TITLE_LINES = 2;

/**
 * Card inset, matching the shared card's `RECT_PADDING_X` / `RECT_PADDING_Y` (#38).
 *
 * Declared here rather than imported because those live in `src/client/`, which `src/shared/` may
 * not reach. `agenda-panel.test.ts` asserts the two pairs are equal, so the duplication is checked
 * rather than trusted.
 */
export const PANEL_CARD_PADDING = { x: 6, y: 3 };

/**
 * Card border weight at the panel's body size — `cardStrokeWidth(26)` (#38).
 *
 * Restated here for the same reason as the padding, and checked the same way: a border is centred on
 * the rect's edge, so half of it falls outside the card and the column has to leave room for it.
 */
export const PANEL_CARD_STROKE = 2.08;

/** A box in whatever unit the caller measured it in — CSS pixels, at the call sites here. */
export interface PanelBoard {
  width: number;
  height: number;
}

/**
 * Whether the board can carry the panel **without the dial paying for it and without the labels
 * paying either**.
 *
 * The first is ADR 0009's one absolute. The dial is bound by the board's height on any board wide
 * enough that the remainder after the panel is still at least as wide as it is tall, so the board
 * must be `(size + panelUnits) / size` times its own height — **1.3** at ADR 0009's numbers.
 *
 * **1.3 is not enough, and rendering is what said so — twice.** The first attempt required the room
 * beside the dial to cover `--label-frame` (51.29 units), which fixed a 1330×1000 board where
 * `⚫ Assembly` crossed into the column by 5.9 px. That figure was still wrong, because **the frame
 * is the *vertical* allowance and the panel is on the horizontal axis**: on the 1-hour dial a card
 * reaches **138.7 units** past the viewBox, and at 16:10 — one of ADR 0009's two target boards —
 * `?scale=1h&now=07:17&freeze=1` put a card **30.7 px** inside the column against 120.8 units of
 * room.
 *
 * So the condition is stated in the currency that actually bounds a card: **the margin the labels
 * are granted.** `analog-clock.ts` sets `labelAllowance = grantedMargin + EDGE_MARGIN`, so a card's
 * permitted reach past the viewBox *is* that margin — and once the host grants the room that truly
 * exists beside the dial (`measureLabelMargin` measures the row, not the viewport, while the panel
 * is up), a card cannot reach the column at all. That is structural rather than a number to keep
 * true.
 *
 * `minMarginUnits` is then not about collisions but about **cost**: below ADR 0009's 75.4-unit knee
 * the labels and the panel start trading width one-for-one, which is the trade the ADR says its 180
 * units must not make. Requiring it puts the threshold at `(600 + 180 + 150.8) / 600` = **1.5513**,
 * which 16:9 (1.911 of content) and 16:10 (1.703) both clear, and which keeps every board that shows
 * a panel on the saturated 13 characters a line.
 *
 * Measure this on the **container** the dial and panel share, never on the dial's own box. The
 * container's size does not depend on whether the panel is in it; the dial's does, so testing the
 * dial would flap — hiding the panel widens the dial, which re-satisfies the test, which shows the
 * panel, which narrows the dial.
 *
 * `false` on a board with no layout (a jsdom spec, a page before paint), so the absent case is the
 * one an unmeasurable page falls into rather than a panel sized from a zero.
 */
export function panelFitsBoard(
  board: PanelBoard,
  size: number,
  panelUnits: number = PANEL_WIDTH_UNITS,
  minMarginUnits = 0
): boolean {
  if (!(board.width > 0) || !(board.height > 0) || !(size > 0)) return false;

  const needed = size + panelUnits + 2 * Math.max(0, minMarginUnits);
  return board.width >= (board.height * needed) / size;
}

/** An event resolved to the text and colour a card draws, before it is wrapped or placed. */
export interface AgendaEntry {
  id: string;
  /** The title as it renders — the event's own emoji inline, matching how it was authored (#23). */
  title: string;
  color: string;
  /**
   * The short line under the title, or `undefined` for none.
   *
   * A duration rather than a clock time, which is the panel's own justification going unserved and
   * is deliberate for now: `HH:MM–HH:MM` is eleven characters against the ten a 26-unit line holds
   * in 180 units, and the paddings that admit an eleventh leave zero slack and only work for a
   * 24-hour rendering. See the plan doc; filed as follow-up work.
   */
  trailing?: string;
}

/**
 * The events the panel lists: **still running or still to come**, earliest first.
 *
 * Deliberately not scoped to the calendar day. "Whole day" versus "a scrolling window" is #41's two
 * display modes, and day-scoping would empty the panel near midnight — and in demo mode, where the
 * fixture is anchored to the rolling window rather than to a day. "What is running and what is next"
 * is the reading that is honest under both, and it is the placeholder #41 replaces.
 *
 * All-day events are dropped, as they are from the dial. #37 said the panel is where they belong and
 * closed without them because the panel did not exist; the fixture carries none, so there is nothing
 * to look at yet either. Filed as follow-up work rather than guessed at.
 *
 * Ties break on id so the order is total: two events starting in the same minute must not swap
 * places between renders on a wall left up for weeks.
 */
export function agendaEntries(events: ClockEventInput[], now: Date): AgendaEntry[] {
  const nowMs = now.getTime();

  return events
    .filter((event) => !event.isAllDay && new Date(event.endDate).getTime() > nowMs)
    .sort((a, b) => {
      const byStart = new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
      return byStart !== 0 ? byStart : a.id.localeCompare(b.id);
    })
    .map((event) => {
      const parsed = parseEventTitle(event.title, event.fallbackColor);
      const minutes = Math.round(
        (new Date(event.endDate).getTime() - new Date(event.startDate).getTime()) / 60_000
      );

      return {
        id: event.id,
        title: combineTitleWithEmoji(parsed.cleanTitle, parsed.eventEmoji),
        color: parsed.color,
        // Empty under a minute, which `fitLabelToWidth` would treat as a zero-width line rather
        // than as absent — the same guard `analog-clock.ts` applies to a floating label's duration.
        trailing: formatEventDuration(minutes) || undefined
      };
    });
}

/** An entry wrapped and placed in the column. */
export interface AgendaCard extends AgendaEntry {
  /** Wrapped text, one entry per line, with the trailing line last where there is one. */
  lines: string[];
  x: number;
  y: number;
  width: number;
  height: number;
  /**
   * The title did not fit its two lines and is ellipsized.
   *
   * Carried for the caller's benefit, not the renderer's: the panel draws no overflow affordance, on
   * the grounds that the ellipsis is already the affordance and a second mark on a 180-unit column
   * costs a character. Deliberate — do not wire one up without pricing that.
   */
  didOverflow: boolean;
}

export interface AgendaCardPlan {
  cards: AgendaCard[];
  /**
   * Entries that did not fit the column.
   *
   * Nothing consumes it yet — an overflow affordance is #41's, since what "the rest" means depends
   * on which display mode is running. Returned rather than discarded so a mode does not have to
   * re-derive it.
   */
  dropped: number;
}

/**
 * Lay entries down the column, top first, while they fit.
 *
 * A card spans the panel's full width so the character budget is the one ADR 0009 costed — the
 * column sits inside `#display`'s frame, so there is no page edge for it to crowd. Height is the
 * card's own, so a one-line title takes a two-line card and the next one starts sooner: the five in
 * the ADR is the count of the *tall* case, not a fixed slot count.
 *
 * Stops at the first card that does not fit rather than skipping it for a shorter one behind. The
 * column is in time order and a panel that showed 14:00 above 15:30 above 14:30 would be worse than
 * one that stops.
 */
export function planAgendaCards(
  entries: AgendaEntry[],
  options: {
    width?: number;
    height: number;
    fontSize?: number;
    gap?: number;
    maxTitleLines?: number;
    padding?: { x: number; y: number };
    strokeWidth?: number;
  }
): AgendaCardPlan {
  const width = options.width ?? PANEL_WIDTH_UNITS;
  const fontSize = options.fontSize ?? PANEL_CARD_FONT_SIZE;
  const gap = options.gap ?? PANEL_CARD_GAP;
  const maxTitleLines = options.maxTitleLines ?? PANEL_CARD_MAX_TITLE_LINES;
  const padding = options.padding ?? PANEL_CARD_PADDING;
  const stroke = Math.max(0, options.strokeWidth ?? PANEL_CARD_STROKE);

  const cards: AgendaCard[] = [];
  /**
   * Half the border stroke, inset on every side.
   *
   * A border is centred on the rect's edge, and an outermost `<svg>` is `overflow: hidden` by UA
   * default — so a card flush with the column had its left and right borders painted at half weight
   * against the horizontals' full weight, 1.6 px of stroke clipped at 1920×1080. Found by looking;
   * no attribute assertion could have caught it, since every attribute was correct.
   *
   * `overflow: visible` on the panel's SVG would have been the other fix and is the wrong one: it
   * lets a card paint over the page's edge and over the dial, which is the whole thing the column is
   * for. The inset also gives the column the gutter it had none of.
   */
  const inset = stroke / 2;
  const cardWidth = Math.max(0, width - stroke);
  let y = inset;

  for (const entry of entries) {
    const fit = fitLabelToWidth(
      entry.title,
      cardWidth,
      fontSize,
      maxTitleLines,
      padding,
      entry.trailing
    );

    if (y + fit.height + inset > options.height) break;

    cards.push({
      ...entry,
      lines: fit.lines,
      // The card is placed at the column's full width rather than at `fit.width`, which is the
      // widest line: a ragged right edge down a column of five reads as damage, where on a floating
      // label a card no wider than its text is what keeps it off its neighbours.
      x: inset,
      y,
      width: cardWidth,
      height: fit.height,
      didOverflow: fit.didOverflow
    });
    y += fit.height + gap;
  }

  return { cards, dropped: entries.length - cards.length };
}
