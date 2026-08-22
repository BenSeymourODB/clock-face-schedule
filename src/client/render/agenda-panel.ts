/**
 * The agenda panel beside the dial (#39, ADR 0009) — a column of event cards in the 180 units the
 * allocation holds on the right.
 *
 * **Why the panel exists rather than being more dial.** #70's decision: a three-deep cluster's arc
 * titles render at 6.24 units, which is 7.0 mm on a 4 ft board and legible to about a metre. The
 * band keeps those titles — dropping an event's name outright is worse — and the panel becomes the
 * surface that answers *"what is that arc"* from the back of the room, at 21.2576 units — the size a
 * lone arc's own title renders at, so the panel never out-shouts the band it serves (#174).
 *
 * Drawn as its own SVG rather than inside the dial's. Its viewBox is `180 × 600` against the dial's
 * `600 × 600` and the stylesheet gives it exactly `0.3` of the dial's box, so **a unit is the same
 * length in both drawings** and ADR 0009's figures are the numbers in this file. Sharing the dial's
 * SVG would instead put the panel inside a square that fits the shorter axis, and the panel is not
 * square.
 *
 * Geometry and text come from `src/shared/clock/panel-layout.ts`, which is node-testable; the paint
 * is `eventCardNodes` (#38), so a card here and a floating label cannot be restyled independently.
 */
import {
  type AgendaCard,
  type ClockEventInput,
  PANEL_CARD_FONT_SIZE,
  PANEL_WIDTH_UNITS,
  agendaEntries,
  planAgendaCards,
} from "../../shared/clock";
import { svg } from "../svg";
import { DIAL_VIEWBOX_SIZE } from "./analog-clock";
import { RECT_PADDING_X, RECT_PADDING_Y, cardStrokeWidth, eventCardNodes } from "./event-card";

const ID_PREFIX = "agenda-card";

/** The column's viewBox, in the dial's own units. */
export const PANEL_VIEWBOX_WIDTH = PANEL_WIDTH_UNITS;
export const PANEL_VIEWBOX_HEIGHT = DIAL_VIEWBOX_SIZE;

export interface AgendaPanelParams {
  events: ClockEventInput[];
  time: Date;
}

export interface AgendaPanelHandle {
  element: SVGSVGElement;
  /** Replace the event set and rebuild the column. */
  setEvents(events: ClockEventInput[]): void;
  /**
   * Advance the panel's clock.
   *
   * Rebuilds only when the set of cards actually changes, which is what an event ending looks like
   * from here. Deliberately not keyed on the calendar minute the way the arcs are: an arc's
   * *appearance* changes continuously while an event drains, so a minute is the useful grain there,
   * but a card either is in the column or is not, and an event that ended at 14:00:12 should not
   * leave a stale card up for the rest of the minute.
   */
  setTime(time: Date): void;
}

/**
 * Which cards are up, cheaply comparable — the rebuild trigger.
 *
 * Newline-joined rather than space-joined: calendar ids carry no spaces today, but `["a b", "c"]`
 * and `["a", "b c"]` would share a key, and a key collision here is a column that stops updating.
 */
function cardKey(cards: AgendaCard[]): string {
  return cards.map((card) => card.id).join("\n");
}

export function agendaPanel({ events, time }: AgendaPanelParams): AgendaPanelHandle {
  const element = svg("svg", {
    "data-testid": "agenda-panel",
    viewBox: `0 0 ${PANEL_VIEWBOX_WIDTH} ${PANEL_VIEWBOX_HEIGHT}`,
    // A fallback for a page with no stylesheet, as on the dial: the stylesheet's box is definite on
    // both axes, so nothing in the layout resolves against these (which is what #115 was).
    width: PANEL_VIEWBOX_WIDTH,
    height: PANEL_VIEWBOX_HEIGHT,
  });

  const layer = svg("g", { "data-testid": "agenda-cards-layer" });
  element.append(layer);

  let currentEvents = events;
  // The time the column is laid out at, so a `setEvents` between ticks uses the time the panel is
  // actually showing rather than the one it loaded at.
  let currentTime = time;
  let renderedKey: string | null = null;

  function render(): void {
    const { cards } = planAgendaCards(agendaEntries(currentEvents, currentTime), {
      width: PANEL_VIEWBOX_WIDTH,
      height: PANEL_VIEWBOX_HEIGHT,
      fontSize: PANEL_CARD_FONT_SIZE,
      // The shared card's own insets and border weight, passed in rather than looked up:
      // `src/shared/` cannot reach `src/client/`, so `PANEL_CARD_PADDING` and `PANEL_CARD_STROKE`
      // restate them and this is where the two meet. The stroke matters to the *geometry* because a
      // border is centred on the card's edge, so the column has to hold half of it.
      padding: { x: RECT_PADDING_X, y: RECT_PADDING_Y },
      strokeWidth: cardStrokeWidth(PANEL_CARD_FONT_SIZE),
    });

    const key = cardKey(cards);
    if (key === renderedKey) return;
    renderedKey = key;

    layer.textContent = "";
    for (const card of cards) {
      layer.append(
        ...eventCardNodes({
          idPrefix: ID_PREFIX,
          id: card.id,
          x: card.x,
          y: card.y,
          width: card.width,
          height: card.height,
          color: card.color,
          lines: card.lines,
          fontSize: PANEL_CARD_FONT_SIZE,
        })
      );
    }
  }

  render();

  return {
    element,
    setEvents(next: ClockEventInput[]): void {
      currentEvents = next;
      // A new event set can produce the same card ids with different text — a title edited on the
      // calendar, or the fixture re-anchoring — so this rebuilds unconditionally rather than
      // through the key, which only knows about identity.
      renderedKey = null;
      render();
    },
    setTime(next: Date): void {
      currentTime = next;
      render();
    },
  };
}
