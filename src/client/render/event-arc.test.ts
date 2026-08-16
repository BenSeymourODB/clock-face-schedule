import { describe, expect, it } from "vitest";
import { type ClockEvent, computeArcTitleLayout } from "../../shared/clock";
import { eventArc } from "./event-arc";

const CX = 300;
const CY = 300;
const INNER = 244;
const OUTER = 292;

function makeEvent(overrides: Partial<ClockEvent> = {}): ClockEvent {
  return {
    id: "e1",
    title: "Team Meeting",
    cleanTitle: "Team Meeting",
    startAngle: 0,
    endAngle: 60,
    color: "#22c55e",
    isAllDay: false,
    ...overrides,
  };
}

function render(overrides: Partial<ClockEvent> = {}, forceHideTitle = false): SVGGElement {
  return eventArc({
    event: makeEvent(overrides),
    cx: CX,
    cy: CY,
    innerRadius: INNER,
    outerRadius: OUTER,
    forceHideTitle,
  });
}

/** Pull the radius back out of a `M x y A r r …` textPath baseline. */
function arcRadius(d: string): number {
  return Number(/A ([\d.]+) /.exec(d)?.[1]);
}

function spanning(degrees: number, overrides: Partial<ClockEvent> = {}) {
  return render({ startAngle: 0, endAngle: degrees, ...overrides });
}

describe("eventArc", () => {
  describe("the arc itself", () => {
    const group = render();
    const path = group.querySelector('[data-testid="event-arc-e1"]');

    it("fills with the event colour", () => {
      expect(path?.getAttribute("fill")).toBe("#22c55e");
      expect(path?.getAttribute("fill-opacity")).toBe("0.85");
    });

    it("separates adjacent arcs with a token, not a literal", () => {
      // The separator has to track whichever background sits behind the band.
      expect(path?.getAttribute("stroke")).toBe("var(--card)");
    });

    it("draws a closed donut segment", () => {
      expect(path?.getAttribute("d")).toMatch(/^M .* Z$/);
    });
  });

  describe("accessible name", () => {
    it("names the event", () => {
      expect(render().getAttribute("aria-label")).toBe("Event: Team Meeting");
    });

    it("appends the emoji when there is one", () => {
      expect(render({ eventEmoji: "🎮" }).getAttribute("aria-label")).toBe(
        "Event: Team Meeting, 🎮"
      );
    });

    it("is read-only — no button role, no tab stop", () => {
      const group = render();

      expect(group.getAttribute("role")).toBe("img");
      expect(group.hasAttribute("tabindex")).toBe(false);
    });
  });

  describe("visibility gates", () => {
    it.each([
      [9, false],
      [10, true],
      [45, true],
    ])("at %i° the emoji is rendered: %s", (degrees, expected) => {
      const group = spanning(degrees, { eventEmoji: "🎮" });

      expect(group.querySelector('[data-testid="event-emoji-e1"]') !== null).toBe(expected);
    });

    it.each([
      [19, false],
      [20, true],
      [60, true],
    ])("at %i° the title is rendered: %s", (degrees, expected) => {
      const group = spanning(degrees);

      expect(group.querySelector('[data-testid="event-title-e1"]') !== null).toBe(expected);
    });

    it("suppresses only the title when the label has taken it over", () => {
      const group = eventArc({
        event: makeEvent({ eventEmoji: "🎮" }),
        cx: CX,
        cy: CY,
        innerRadius: INNER,
        outerRadius: OUTER,
        forceHideTitle: true,
      });

      expect(group.querySelector('[data-testid="event-title-e1"]')).toBeNull();
      expect(group.querySelector('[data-testid="event-emoji-e1"]')).not.toBeNull();
    });
  });

  describe("emoji placement", () => {
    it.each([
      // Above the horizontal, the glyph already reads upright and is left alone.
      ["one-thirty", 30, 60, 45],
      ["eleven o'clock", 300, 360, 330],
      // Below it, an un-rotated glyph would be upside down, so it is turned a half-turn.
      ["four-thirty", 120, 150, 315],
      // Angles are never normalised, so the lower half can exceed a full turn. Harmless —
      // SVG takes any rotation — but it is why these read 360 and 390 rather than 0 and 30.
      ["six o'clock", 150, 210, 360],
      ["seven o'clock", 180, 240, 390],
    ])("rotates the %s glyph to %i°", (_label, startAngle, endAngle, expected) => {
      const group = render({ startAngle, endAngle, eventEmoji: "🎮" });

      expect(
        group.querySelector('[data-testid="event-emoji-e1"]')?.getAttribute("transform")
      ).toMatch(new RegExp(`^rotate\\(${expected},`));
    });
  });

  describe("curved title", () => {
    it("renders exactly the lines the shared layout produced", () => {
      // The layout maths is covered at fit-title and arc-title-layout; this only asserts the
      // arc renders whatever it was handed, rather than re-deriving the packing here.
      const event = makeEvent();
      const layout = computeArcTitleLayout({
        cleanTitle: event.cleanTitle,
        arcSpan: event.endAngle - event.startAngle,
        innerRadius: INNER,
        outerRadius: OUTER,
      });
      const group = render();

      expect(group.querySelectorAll('[data-testid="event-title-e1"] text')).toHaveLength(
        layout.fit.lines.length
      );
      expect(group.querySelectorAll("defs path")).toHaveLength(layout.fit.lines.length);
      expect(
        [...group.querySelectorAll("textPath")].map((node) => node.textContent)
      ).toEqual(layout.fit.lines);
    });

    it("gives every line its own baseline path, wired by id", () => {
      const group = render();
      const pathIds = [...group.querySelectorAll("defs path")].map((node) => node.id);
      const hrefs = [...group.querySelectorAll("textPath")].map((node) =>
        node.getAttribute("href")
      );

      expect(hrefs).toEqual(pathIds.map((id) => `#${id}`));
    });

    it("straddles the title radius when the title takes two lines", () => {
      const cleanTitle = "Parent Teacher Conference Planning Session Extra Words Here To Wrap";
      const layout = computeArcTitleLayout({
        cleanTitle,
        arcSpan: 60,
        innerRadius: INNER,
        outerRadius: OUTER,
      });
      expect(layout.fit.lines).toHaveLength(2);

      const radii = [...render({ cleanTitle }).querySelectorAll("defs path")].map((node) =>
        arcRadius(node.getAttribute("d") ?? "")
      );

      const offset = layout.titleFontSize * 0.55;
      expect(radii).toEqual([layout.titleRadius + offset, layout.titleRadius - offset]);
    });

    it.each([
      ["🟡 yellow", "#EAB308", "#000000"],
      ["🟢 green", "#22C55E", "#000000"],
      ["⚫ near-black", "#1F2937", "#ffffff"],
      ["🟤 brown", "#92400E", "#ffffff"],
    ])("colours the title for legibility on %s", (_name, color, expected) => {
      // The ratios themselves are asserted at `contrast`; this only checks the arc consults it
      // rather than shipping the fixed white the source used (#15).
      const group = render({ color });

      expect(
        group.querySelector('[data-testid="event-title-e1"] text')?.getAttribute("fill")
      ).toBe(expected);
    });

    it("uses the layout it is given rather than recomputing one", () => {
      const layout = computeArcTitleLayout({
        cleanTitle: "Team Meeting",
        arcSpan: 60,
        innerRadius: INNER,
        outerRadius: OUTER,
      });
      const forced = { ...layout, titleFontSize: 9 };

      const group = eventArc({
        event: makeEvent(),
        cx: CX,
        cy: CY,
        innerRadius: INNER,
        outerRadius: OUTER,
        layout: forced,
      });

      expect(group.querySelector('[data-testid="event-title-e1"] text')?.getAttribute("font-size"))
        .toBe("9");
    });
  });
});
