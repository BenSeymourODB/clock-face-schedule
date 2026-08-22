/**
 * The agenda panel's column (#39, ADR 0009).
 *
 * Two kinds of assertion here, and the first is the one that could not exist before this change:
 * `label-margin.ts` has been holding 180 units out of the labels' allowance since #148, and until
 * now nothing occupied them. **The width reserved and the column drawn have to be one number**, so
 * the ratio is read back out of `Styles.html` and compared against `PANEL_RESERVE_UNITS` — the way
 * `dial-frame.test.ts` reads the frame — rather than restated here and trusted to agree.
 *
 * The rest is the renderer, asserted on **rendered SVG attribute names**: a camelCase spelling sets
 * an attribute nothing reads and the element renders unstyled with nothing logged, which is the
 * easiest mistake in this codebase.
 */
import { describe, expect, it } from "vitest";
import styles from "../../../static/Styles.html?raw";
import {
  type ClockEventInput,
  PANEL_CARD_FONT_SIZE,
  PANEL_CARD_PADDING,
  PANEL_RESERVE_UNITS,
  panelFitsBoard,
} from "../../shared/clock";
import {
  PANEL_VIEWBOX_HEIGHT,
  PANEL_VIEWBOX_WIDTH,
  agendaPanel,
} from "./agenda-panel";
import { DIAL_VIEWBOX_SIZE } from "./analog-clock";
import { RECT_PADDING_X, RECT_PADDING_Y } from "./event-card";

const NOW = new Date(2026, 7, 22, 9, 0, 0);

function event(id: string, title: string, startMinutes: number, endMinutes: number): ClockEventInput {
  const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000).toISOString();
  return {
    id,
    title,
    startDate: at(startMinutes),
    endDate: at(endMinutes),
    isAllDay: false,
    fallbackColor: "#3b82f6",
  };
}

function withoutComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

function block(selector: string): string {
  const found = new RegExp(`${selector}\\s*\\{([^}]*)\\}`).exec(withoutComments(styles));

  if (!found) throw new Error(`no ${selector} rule in Styles.html`);
  return found[1] as string;
}

function cardIds(element: SVGSVGElement): string[] {
  return Array.from(element.querySelectorAll('[data-testid^="agenda-card-rect-"]')).map(
    (node) => node.getAttribute("data-testid")?.replace("agenda-card-rect-", "") ?? ""
  );
}

function rect(element: SVGSVGElement, id: string): { y: number; height: number; width: number } {
  const node = element.querySelector(`[data-testid="agenda-card-rect-${id}"]`);
  if (!node) throw new Error(`no card for ${id}`);
  return {
    y: Number(node.getAttribute("y")),
    height: Number(node.getAttribute("height")),
    width: Number(node.getAttribute("width")),
  };
}

describe("the panel's column, against the width reserved for it", () => {
  /**
   * The stylesheet states the allocation as ADR 0009's two numbers — `aspect-ratio: 180 / 600` — so
   * the column is `0.3` of the dial's box and a unit is the same length in both drawings. If either
   * end moves alone, cards land on a panel that is no longer where the labels were told it is.
   */
  it("declares the ADR's ratio, and it is the reserve over the dial's viewBox", () => {
    const declared = /aspect-ratio:\s*([\d.]+)\s*\/\s*([\d.]+)/.exec(block("#panel"));

    expect(declared, "#panel declares its width as a ratio of its height").not.toBeNull();
    const [, width, height] = declared as RegExpExecArray;

    expect(Number(width)).toBe(PANEL_RESERVE_UNITS);
    expect(Number(height)).toBe(DIAL_VIEWBOX_SIZE);
  });

  it("draws its viewBox at the same two numbers", () => {
    expect(PANEL_VIEWBOX_WIDTH).toBe(PANEL_RESERVE_UNITS);
    expect(PANEL_VIEWBOX_HEIGHT).toBe(DIAL_VIEWBOX_SIZE);

    const { element } = agendaPanel({ events: [], time: NOW });
    expect(element.getAttribute("viewBox")).toBe(`0 0 ${PANEL_RESERVE_UNITS} ${DIAL_VIEWBOX_SIZE}`);
  });

  /**
   * `src/shared/` may not import from `src/client/`, so `PANEL_CARD_PADDING` restates the shared
   * card's insets. ADR 0009's ten-characters-a-line figure is computed from them, so a change to one
   * that misses the other would silently move the panel's character budget away from the number the
   * whole 180-unit allocation was chosen on.
   */
  it("keeps the planner's padding equal to the card's own", () => {
    expect(PANEL_CARD_PADDING).toEqual({ x: RECT_PADDING_X, y: RECT_PADDING_Y });
  });

  /** Absent, not collapsed — #39 item 4 is still open, and `hidden` needs a rule to obey. */
  it("has a rule that actually hides it when the board cannot afford it", () => {
    expect(block("#panel\\[hidden\\]")).toMatch(/display:\s*none/);
  });

  /**
   * **The assertion that was missing when a card crossed into the column.**
   *
   * `dial-frame.test.ts` binds `--label-frame` to the worst card the renderer draws. This binds the
   * same declaration to the panel's threshold, which is the other thing that frame now has to cover:
   * on the panel side the frame *is* the panel, so the room between the dial's viewBox and the column
   * has to hold a card on its own.
   *
   * Derived from the stylesheet rather than restated, so raising the frame for a taller card raises
   * the aspect ratio at which the panel is allowed to appear, in the same commit and without anyone
   * remembering to.
   */
  it("will not show the panel on a board whose room beside the dial cannot hold a card", () => {
    const percent = Number(/--label-frame:\s*([\d.]+)vmin/.exec(block("#display"))?.[1] ?? NaN);
    expect(percent, "#display declares its frame as a share of the shorter axis").toBeGreaterThan(0);

    // The frame a card paints into, in the dial's units — `dial-frame.test.ts`'s own derivation.
    const reach = (DIAL_VIEWBOX_SIZE * percent) / (100 - 2 * percent);

    /** The rendered content box of `#board` on a `width × height` viewport. */
    const boardBox = (width: number, height: number) => {
      const padding = (Math.min(width, height) * percent) / 100;
      return { width: width - 2 * padding, height: height - 2 * padding };
    };
    const fits = (width: number, height: number) =>
      panelFitsBoard(boardBox(width, height), DIAL_VIEWBOX_SIZE, PANEL_RESERVE_UNITS, reach);

    // The deployment ADR 0009 targets: both clear it with room to spare.
    expect(fits(1920, 1080)).toBe(true);
    expect(fits(1920, 1200)).toBe(true);

    // The board a card was measured intruding on, and a 4:3 projector, which is the same shape.
    expect(fits(1330, 1000)).toBe(false);
    expect(fits(1024, 768)).toBe(false);

    // And the property itself: wherever the panel shows, the room per side covers a card's reach.
    for (const [width, height] of [
      [1920, 1080],
      [1920, 1200],
      [2560, 1440],
      [1600, 900],
      [1440, 1080],
      [1400, 1000],
      [1330, 1000],
      [1024, 768],
      [1000, 1000]
    ]) {
      const box = boardBox(width as number, height as number);
      if (!panelFitsBoard(box, DIAL_VIEWBOX_SIZE, PANEL_RESERVE_UNITS, reach)) continue;

      const boardUnits = (box.width * DIAL_VIEWBOX_SIZE) / box.height;
      const roomPerSide = (boardUnits - DIAL_VIEWBOX_SIZE - PANEL_RESERVE_UNITS) / 2;

      expect(roomPerSide, `${width}×${height} shows the panel with ${roomPerSide.toFixed(1)} units beside the dial`).toBeGreaterThanOrEqual(reach);
    }
  });
});

describe("agendaPanel", () => {
  it("draws a card per event, in time order down the column", () => {
    const { element } = agendaPanel({
      events: [
        event("late", "Aftercare", 120, 180),
        event("now", "Assembly", -10, 35),
        event("next", "Lunch", 35, 85),
      ],
      time: NOW,
    });

    expect(cardIds(element)).toEqual(["now", "next", "late"]);
    expect(rect(element, "now").y).toBeLessThan(rect(element, "next").y);
    expect(rect(element, "next").y).toBeLessThan(rect(element, "late").y);
  });

  it("sets the body size ADR 0009 costed, under its real attribute name", () => {
    const { element } = agendaPanel({ events: [event("a", "Yoga", 0, 22)], time: NOW });
    const text = element.querySelector('[data-testid="agenda-card-text-a-0"]');

    expect(text?.getAttribute("font-size")).toBe(String(PANEL_CARD_FONT_SIZE));
    expect(text?.textContent).toBe("Yoga");
  });

  it("states a duration under the title", () => {
    const { element } = agendaPanel({ events: [event("a", "Yoga", 0, 22)], time: NOW });

    expect(element.querySelector('[data-testid="agenda-card-text-a-1"]')?.textContent).toBe("22 min");
  });

  it("keeps every card inside the column", () => {
    const events = Array.from({ length: 9 }, (_unused, index) =>
      event(`e${index}`, `Parent Teacher Conference Planning Committee ${index}`, index * 60, index * 60 + 45)
    );
    const { element } = agendaPanel({ events, time: NOW });

    for (const id of cardIds(element)) {
      const box = rect(element, id);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(PANEL_VIEWBOX_HEIGHT);
      expect(box.width).toBe(PANEL_VIEWBOX_WIDTH);
    }
  });

  it("draws nothing at all with no events", () => {
    const { element } = agendaPanel({ events: [], time: NOW });
    expect(cardIds(element)).toEqual([]);
  });

  /**
   * The panel's rebuild trigger is the card set, not the calendar minute the arcs use. An event that
   * ended at 14:00:12 must not leave a card up for the rest of the minute — a card is either in the
   * column or it is not, so there is no intermediate state a coarser grain would be showing.
   */
  it("drops a card the second its event ends", () => {
    const panel = agendaPanel({
      events: [event("ending", "Assembly", -45, 0.2), event("next", "Lunch", 5, 55)],
      time: NOW,
    });

    expect(cardIds(panel.element)).toEqual(["ending", "next"]);

    panel.setTime(new Date(NOW.getTime() + 13_000));
    expect(cardIds(panel.element)).toEqual(["next"]);
  });

  it("moves the remaining cards up when one ahead of them ends", () => {
    const panel = agendaPanel({
      events: [event("ending", "Assembly", -45, 0.2), event("next", "Lunch", 5, 55)],
      time: NOW,
    });
    const before = rect(panel.element, "next").y;

    panel.setTime(new Date(NOW.getTime() + 13_000));
    expect(rect(panel.element, "next").y).toBeLessThan(before);
    expect(rect(panel.element, "next").y).toBe(0);
  });

  /**
   * The key only knows identity, so a title edited on the calendar keeps the same ids. Rebuilding
   * through the key would leave the old text on screen until the card set happened to change.
   */
  it("redraws on a new event set even when the ids are unchanged", () => {
    const panel = agendaPanel({ events: [event("a", "Yoga", 0, 22)], time: NOW });
    expect(panel.element.querySelector('[data-testid="agenda-card-text-a-0"]')?.textContent).toBe("Yoga");

    panel.setEvents([event("a", "Pilates", 0, 22)]);
    expect(panel.element.querySelector('[data-testid="agenda-card-text-a-0"]')?.textContent).toBe("Pilates");
  });

  /** A tick between fetches must not lay the column out at the instant the page loaded. */
  it("lays a new event set out at the time the panel is showing, not at load", () => {
    const panel = agendaPanel({ events: [], time: NOW });

    panel.setTime(new Date(NOW.getTime() + 60 * 60_000));
    panel.setEvents([event("past", "Over", 0, 30), event("live", "On", 55, 95)]);

    expect(cardIds(panel.element)).toEqual(["live"]);
  });

  it("does not rebuild the DOM on a tick that changes no card", () => {
    const panel = agendaPanel({ events: [event("a", "Yoga", 0, 220)], time: NOW });
    const first = panel.element.querySelector('[data-testid="agenda-card-rect-a"]');

    panel.setTime(new Date(NOW.getTime() + 1_000));
    expect(panel.element.querySelector('[data-testid="agenda-card-rect-a"]')).toBe(first);
  });
});
