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

/** Gap between cards. See `PANEL_CARD_MAX_TITLE_LINES` for where the number comes from. */
export const PANEL_CARD_GAP = 6;

/**
 * Lines a card's title may wrap to, before its trailing line.
 *
 * Two, so the tall card is three lines — and at 26 units with a 6-unit gap that reproduces ADR
 * 0009's two card counts exactly, which is the check that these are the constants it was written
 * against:
 *
 * | | units |
 * | --- | --- |
 * | `labelCardHeight(3, 26, 3)` | 115.2 |
 * | five of them, four gaps | 576 + 24 = **600**, the panel's whole height |
 * | `labelCardHeight(2, 26, 3)` | 78.8 |
 * | seven of them, six gaps | 551.6 + 36 = 587.6 |
 * | eight | 630.4 + 42 = 672.4 — does not fit |
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

/** A box in whatever unit the caller measured it in — CSS pixels, at the call sites here. */
export interface PanelBoard {
  width: number;
  height: number;
}

/**
 * Whether the board can carry the panel **without the dial paying for it and without a floating
 * label landing on it**.
 *
 * The first is ADR 0009's one absolute. The dial is bound by the board's height on any board wide
 * enough that the remainder after the panel is still at least as wide as it is tall, so the board
 * must be `(size + panelUnits) / size` times its own height — **1.3** at ADR 0009's numbers.
 *
 * **1.3 is not enough, and rendering is what said so.** A card paints outside the dial's viewBox by
 * design, and the page reserves `--label-frame` — 51.29 units — for it to paint into. On the panel
 * side that frame is now occupied, so the room between the dial's viewBox and the panel has to cover
 * a card's reach on its own. At 1330×1000 it does not: 25.9 units of room, and `⚫ Assembly`'s card
 * crossed into the column by 5.9 px. A 4:3 board is the same shape — 27.1 units. Passing
 * `labelReachUnits` raises the threshold to **1.4710**, which 16:9 (1.911 of content) and 16:10
 * (1.703) clear by a wide margin, so nothing about the deployment ADR 0009 targets changes.
 *
 * The reach is a *parameter* rather than a constant here because the page's own reserve is the
 * figure that matters and it lives in `Styles.html`. The client reads it off the rendered padding,
 * so the two cannot disagree; `agenda-panel.test.ts` derives it from the stylesheet independently.
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
  labelReachUnits = 0
): boolean {
  if (!(board.width > 0) || !(board.height > 0) || !(size > 0)) return false;

  const needed = size + panelUnits + 2 * Math.max(0, labelReachUnits);
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
  /** The title did not fit its two lines and is ellipsized. */
  didOverflow: boolean;
}

export interface AgendaCardPlan {
  cards: AgendaCard[];
  /** Entries that did not fit the column. Zero until #41's modes decide what to do with them. */
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
  }
): AgendaCardPlan {
  const width = options.width ?? PANEL_WIDTH_UNITS;
  const fontSize = options.fontSize ?? PANEL_CARD_FONT_SIZE;
  const gap = options.gap ?? PANEL_CARD_GAP;
  const maxTitleLines = options.maxTitleLines ?? PANEL_CARD_MAX_TITLE_LINES;
  const padding = options.padding ?? PANEL_CARD_PADDING;

  const cards: AgendaCard[] = [];
  let y = 0;

  for (const entry of entries) {
    const fit = fitLabelToWidth(
      entry.title,
      width,
      fontSize,
      maxTitleLines,
      padding,
      entry.trailing
    );

    if (y + fit.height > options.height) break;

    cards.push({
      ...entry,
      lines: fit.lines,
      // The card is placed at the column's full width rather than at `fit.width`, which is the
      // widest line: a ragged right edge down a column of five reads as damage, where on a floating
      // label a card no wider than its text is what keeps it off its neighbours.
      x: 0,
      y,
      width,
      height: fit.height,
      didOverflow: fit.didOverflow
    });
    y += fit.height + gap;
  }

  return { cards, dropped: entries.length - cards.length };
}
