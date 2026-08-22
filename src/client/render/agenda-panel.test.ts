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
  LABEL_MARGIN_KNEE_UNITS,
  PANEL_CARD_PADDING,
  PANEL_CARD_STROKE,
  PANEL_RESERVE_UNITS,
  labelMarginUnits,
  panelFitsBoard,
} from "../../shared/clock";
import {
  PANEL_VIEWBOX_HEIGHT,
  PANEL_VIEWBOX_WIDTH,
  agendaPanel,
} from "./agenda-panel";
import { DIAL_VIEWBOX_SIZE } from "./analog-clock";
import { RECT_PADDING_X, RECT_PADDING_Y, cardStrokeWidth } from "./event-card";

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

  /**
   * The same restatement problem for the border weight, and it matters to the *geometry*: a border is
   * centred on the card's edge, so the column reserves half of it at each side. A stroke constant that
   * drifted below the real one would put the clipping back.
   */
  it("keeps the planner's border weight equal to the card's own", () => {
    expect(PANEL_CARD_STROKE).toBe(cardStrokeWidth(PANEL_CARD_FONT_SIZE));
  });

  /** Absent, not collapsed — #39 item 4 is still open, and `hidden` needs a rule to obey. */
  it("has a rule that actually hides it when the board cannot afford it", () => {
    expect(block("#panel\\[hidden\\]")).toMatch(/display:\s*none/);
  });

  /**
   * **The assertion that was missing when a card crossed into the column**, in its corrected form.
   *
   * The first version of this compared the room beside the dial against `--label-frame`. That was the
   * wrong currency and the review caught it: the frame is the *vertical* allowance, and on the 1-hour
   * dial a card reaches 138.7 units past the viewBox, so at 16:10 a card landed 30.7 px inside the
   * column with the frame test passing.
   *
   * The real bound is the margin the labels are *granted*, because `analog-clock.ts` turns it straight
   * into `labelAllowance` — a card's permitted reach past the viewBox is exactly that number. So the
   * property to hold is that the grant never exceeds the room, which `measureLabelMargin` now makes
   * true by measuring the row rather than the viewport while the panel is up. Asserted here against
   * the shared function the host calls, over the board shapes a classroom might have.
   */
  it("never grants the labels more room than exists beside the panel", () => {
    const percent = Number(/--label-frame:\s*([\d.]+)vmin/.exec(block("#display"))?.[1] ?? NaN);
    expect(percent, "#display declares its frame as a share of the shorter axis").toBeGreaterThan(0);

    /** `#board`'s rendered content box on a `width × height` viewport. */
    const boardBox = (width: number, height: number) => {
      const padding = (Math.min(width, height) * percent) / 100;
      return { width: width - 2 * padding, height: height - 2 * padding };
    };

    const boards: [number, number][] = [
      [1920, 1080],
      [1920, 1200],
      [2560, 1440],
      [1600, 900],
      [1410, 1000],
      [1400, 1000],
      [1330, 1000],
      [1024, 768],
      [1000, 1000]
    ];

    let shownCount = 0;

    for (const [width, height] of boards) {
      const board = boardBox(width, height);
      const shown = panelFitsBoard(
        board,
        DIAL_VIEWBOX_SIZE,
        PANEL_RESERVE_UNITS,
        LABEL_MARGIN_KNEE_UNITS
      );
      if (!shown) continue;
      shownCount += 1;

      // The dial's box: the row less the column, at full height because the panel only shows when
      // that holds.
      const panelPx = (board.height * PANEL_RESERVE_UNITS) / DIAL_VIEWBOX_SIZE;
      const dialBox = { width: board.width - panelPx, height: board.height };

      // What the host grants, and the room that actually exists beside the dial.
      const granted = labelMarginUnits(dialBox, board.width, DIAL_VIEWBOX_SIZE);
      const boardUnits = (board.width * DIAL_VIEWBOX_SIZE) / board.height;
      const room = (boardUnits - DIAL_VIEWBOX_SIZE - PANEL_RESERVE_UNITS) / 2;

      expect(granted, `${width}×${height} is measurable`).not.toBeNull();
      expect(granted as number, `${width}×${height} grants no more than the room beside the panel`)
        .toBeLessThanOrEqual(room + 1e-9);

      // And the grant stays above the knee, so the panel never costs a card its characters.
      expect(granted as number, `${width}×${height} keeps the labels saturated`)
        .toBeGreaterThanOrEqual(LABEL_MARGIN_KNEE_UNITS - 1e-9);
    }

    // 16:9 and 16:10 are ADR 0009's two target boards and both must be in the shown set.
    expect(shownCount).toBeGreaterThanOrEqual(4);
    expect(panelFitsBoard(boardBox(1920, 1080), DIAL_VIEWBOX_SIZE, PANEL_RESERVE_UNITS, LABEL_MARGIN_KNEE_UNITS)).toBe(true);
    expect(panelFitsBoard(boardBox(1920, 1200), DIAL_VIEWBOX_SIZE, PANEL_RESERVE_UNITS, LABEL_MARGIN_KNEE_UNITS)).toBe(true);

    // The boards a card was measured intruding on, and a 4:3 projector.
    expect(panelFitsBoard(boardBox(1330, 1000), DIAL_VIEWBOX_SIZE, PANEL_RESERVE_UNITS, LABEL_MARGIN_KNEE_UNITS)).toBe(false);
    expect(panelFitsBoard(boardBox(1410, 1000), DIAL_VIEWBOX_SIZE, PANEL_RESERVE_UNITS, LABEL_MARGIN_KNEE_UNITS)).toBe(false);
    expect(panelFitsBoard(boardBox(1024, 768), DIAL_VIEWBOX_SIZE, PANEL_RESERVE_UNITS, LABEL_MARGIN_KNEE_UNITS)).toBe(false);
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

  /**
   * The rendered cards, borders included. `planAgendaCards` is asserted on the same property in node;
   * this is the check that the renderer passes the real stroke through rather than the default, so the
   * inset matches the border the card actually draws.
   */
  it("keeps every rendered card’s whole border inside the column", () => {
    const events = Array.from({ length: 9 }, (_unused, index) =>
      event(`e${index}`, `Parent Teacher Conference Planning Committee ${index}`, index * 60, index * 60 + 45)
    );
    const { element } = agendaPanel({ events, time: NOW });
    const half = cardStrokeWidth(PANEL_CARD_FONT_SIZE) / 2;
    const ids = cardIds(element);

    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      const box = rect(element, id);
      expect(box.y - half).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height + half).toBeLessThanOrEqual(PANEL_VIEWBOX_HEIGHT);
      expect(box.width).toBe(PANEL_VIEWBOX_WIDTH - cardStrokeWidth(PANEL_CARD_FONT_SIZE));
    }
  });

  it("draws nothing at all with no events", () => {
    const { element } = agendaPanel({ events: [], time: NOW });
    expect(cardIds(element)).toEqual([]);
  });

  /**
   * `namedIds` is what the dial suppresses floating labels against (#172), so it has to be **what
   * the column is actually showing** rather than what it was asked to show. The two differ whenever
   * the panel overflows, which is the common case: the column holds six three-line cards and the
   * fixture routinely hands it more.
   *
   * Asserted against the rendered card ids rather than against the input, because a set derived from
   * the events would suppress the label of an event whose card was dropped for want of room — naming
   * it nowhere, which is #146's defect.
   */
  describe("the ids the column is naming", () => {
    it("reports exactly the cards it drew, not the events it was given", () => {
      const events = Array.from({ length: 9 }, (_unused, index) =>
        event(
          `e${index}`,
          `Parent Teacher Conference Planning Committee ${index}`,
          index * 60,
          index * 60 + 45
        )
      );
      const panel = agendaPanel({ events, time: NOW });

      expect(events.length).toBeGreaterThan(cardIds(panel.element).length);
      expect([...panel.namedIds()].sort()).toEqual([...cardIds(panel.element)].sort());
    });

    it("is empty before any event arrives", () => {
      expect(agendaPanel({ events: [], time: NOW }).namedIds().size).toBe(0);
    });

    it("follows a new event set", () => {
      const panel = agendaPanel({ events: [], time: NOW });
      panel.setEvents([event("a", "Yoga", 0, 22)]);

      expect([...panel.namedIds()]).toEqual(["a"]);
    });

    /**
     * The set is read on the dial's schedule, not the panel's, so a caller holds it across ticks.
     * Handing out the panel's own set would let the dial mutate what the column believes it is
     * showing — and the failure would be a label suppressed against a name nothing is drawing.
     */
    it("hands out a copy rather than its own set", () => {
      const panel = agendaPanel({ events: [event("a", "Yoga", 0, 22)], time: NOW });
      panel.namedIds().add("not-a-card");

      expect([...panel.namedIds()]).toEqual(["a"]);
    });
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
    expect(rect(panel.element, "next").y).toBe(PANEL_CARD_STROKE / 2);
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
