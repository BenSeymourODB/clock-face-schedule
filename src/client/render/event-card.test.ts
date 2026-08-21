import { describe, expect, it } from "vitest";
import {
  SWATCH_GAP,
  SWATCH_RESERVE,
  SWATCH_WIDTH,
  compositeOver,
  contrastRatio,
} from "../../shared/clock";
import { cardStrokeWidth, eventCardNodes } from "./event-card";

const GEOMETRY = { x: 10, y: 20, width: 120, height: 40 };

function render(overrides: Partial<Parameters<typeof eventCardNodes>[0]> = {}) {
  const nodes = eventCardNodes({
    idPrefix: "agenda-card",
    id: "e1",
    ...GEOMETRY,
    color: "#22c55e",
    lines: ["Lunch"],
    fontSize: 14,
    ...overrides,
  });
  const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
  group.append(...nodes);
  return group;
}

function part(group: Element, name: string): Element | null {
  return group.querySelector(`[data-testid="agenda-card-${name}-e1"]`);
}

function line(group: Element, index = 0): Element | null {
  return group.querySelector(`[data-testid="agenda-card-text-e1-${index}"]`);
}

function numbers(element: Element | null, ...names: string[]): number[] {
  return names.map((name) => Number(element?.getAttribute(name)));
}

describe("eventCardNodes", () => {
  it("draws the base, wash and border rects at the given geometry", () => {
    const group = render();
    const rect = part(group, "rect");

    expect(numbers(rect, "x", "y", "width", "height")).toEqual([
      GEOMETRY.x,
      GEOMETRY.y,
      GEOMETRY.width,
      GEOMETRY.height,
    ]);
  });

  it("inverts the face tokens rather than hard-coding a light chip", () => {
    const group = render();

    expect(part(group, "rect")?.getAttribute("fill")).toBe("var(--card-foreground)");
    expect(line(group)?.getAttribute("fill")).toBe("var(--card)");
  });

  it("washes the field and borders in the event colour", () => {
    const group = render();
    const wash = part(group, "wash");
    const border = part(group, "border");

    expect(wash?.getAttribute("fill")).toBe("#22c55e");
    expect(Number(wash?.getAttribute("fill-opacity"))).toBeGreaterThan(0);
    expect(Number(wash?.getAttribute("fill-opacity"))).toBeLessThan(1);
    expect(border?.getAttribute("stroke")).toBe("#22c55e");
  });

  it("stacks base, wash and border sharing the exact geometry", () => {
    const group = render();
    const rect = part(group, "rect");
    const wash = part(group, "wash");
    const border = part(group, "border");

    for (const attr of ["x", "y", "width", "height", "rx", "ry"]) {
      expect(wash?.getAttribute(attr)).toBe(rect?.getAttribute(attr));
      expect(border?.getAttribute(attr)).toBe(rect?.getAttribute(attr));
    }
  });

  it("keeps the wash and border from also carrying the base's fill", () => {
    const group = render();

    expect(part(group, "wash")?.getAttribute("stroke")).toBeNull();
    expect(part(group, "border")?.getAttribute("fill")).toBe("none");
  });

  it("paints the border above the wash, so it reads at full strength", () => {
    const group = render();
    const rects: Element[] = [...group.querySelectorAll("rect")];

    expect(rects.indexOf(part(group, "border") as Element)).toBeGreaterThan(
      rects.indexOf(part(group, "wash") as Element)
    );
  });

  it("renders one text element per line, centred on the room left by the swatch", () => {
    const group = render({ lines: ["First line", "Second line"] });
    const rect = part(group, "rect");
    const [x, y, width, height] = numbers(rect, "x", "y", "width", "height");
    const first = line(group, 0);
    const second = line(group, 1);
    const textCentre = x + (width + SWATCH_RESERVE) / 2;

    expect([first?.textContent, second?.textContent]).toEqual(["First line", "Second line"]);
    expect(Number(first?.getAttribute("x"))).toBeCloseTo(textCentre, 4);
    expect(Number(second?.getAttribute("x"))).toBeCloseTo(textCentre, 4);
    // Two lines straddle the vertical centre symmetrically.
    const centreY = y + height / 2;
    expect(Number(first?.getAttribute("y")) - centreY).toBeCloseTo(
      -(Number(second?.getAttribute("y")) - centreY),
      4
    );
  });

  /**
   * #118: the wash and the border are the card's other two colour channels and both measure
   * ~1.00:1 for ⚪, so the swatch is the identity channel rather than a fourth copy of one.
   */
  describe("colour swatch", () => {
    /** The card's own tokens, spelled here as `contrast.test.ts` spells them. */
    const CARD_FOREGROUND = "#f2f4f8";
    const CARD = "#16181d";
    const WASH_OPACITY = 0.2;
    /** WCAG 1.4.11's floor for a non-text object — #66's number for a filled arc's body. */
    const AA_GRAPHICAL_OBJECT = 3;

    /** Every colour the dial can be handed: the nine dots, Google's eleven, and the fallback. */
    const EVERY_COLOUR = [
      ["🔴 red-500", "#EF4444"],
      ["🟠 orange-500", "#F97316"],
      ["🟡 yellow-500", "#EAB308"],
      ["🟢 green-500", "#22C55E"],
      ["🔵 blue-500", "#3B82F6"],
      ["🟣 purple-500", "#A855F7"],
      ["⚫ gray-800", "#1F2937"],
      ["⚪ gray-100", "#F3F4F6"],
      ["🟤 amber-800", "#92400E"],
      ["Lavender", "#a4bdfc"],
      ["Sage", "#7ae7bf"],
      ["Grape", "#dbadff"],
      ["Flamingo", "#ff887c"],
      ["Banana", "#fbd75b"],
      ["Tangerine", "#ffb878"],
      ["Peacock", "#46d6db"],
      ["Graphite", "#e1e1e1"],
      ["Blueberry", "#5484ed"],
      ["Basil", "#51b749"],
      ["Tomato", "#dc2127"],
      ["the fallback", "#3b82f6"],
    ] as const;

    /** The washed field the swatch is painted on, which is what its edge has to read against. */
    function field(color: string): string {
      return compositeOver(CARD_FOREGROUND, color, WASH_OPACITY) as string;
    }

    it("draws the patch at the leading edge, inside the card's padding", () => {
      const group = render();
      const swatch = part(group, "swatch");
      const [x, y, width, height] = numbers(swatch, "x", "y", "width", "height");

      expect(width).toBe(SWATCH_WIDTH);
      expect(x).toBeCloseTo(GEOMETRY.x + 6, 4);
      expect(y).toBeCloseTo(GEOMETRY.y + 3, 4);
      expect(height).toBeCloseTo(GEOMETRY.height - 6, 4);
    });

    it("keeps the authored colour rather than flooring it, which #118 rejected", () => {
      expect(part(render({ color: "#F3F4F6" }), "swatch")?.getAttribute("fill")).toBe("#F3F4F6");
      expect(part(render({ color: "#1F2937" }), "swatch")?.getAttribute("fill")).toBe("#1F2937");
    });

    /**
     * The assertion a bare patch would have failed, and the reason the outline exists. Full-opacity
     * paint on the card's own washed field is 1.001:1 for ⚪ and under 1.5:1 for nine of these
     * twenty-one colours — the swatch would have reproduced the defect it was chosen to fix.
     */
    it.each(EVERY_COLOUR)("%s reads as a patch against the field it sits on", (_label, color) => {
      const swatch = part(render({ color }), "swatch");

      // The token is what is rendered; `CARD` is what it resolves to, and the ratio is about the
      // resolved value. Asserting both keeps the measurement tied to the paint (ADR 0007).
      expect(swatch?.getAttribute("stroke")).toBe("var(--card)");
      expect(contrastRatio(CARD, field(color))).toBeGreaterThanOrEqual(AA_GRAPHICAL_OBJECT);
      expect(Number(swatch?.getAttribute("stroke-width"))).toBeGreaterThan(0);
    });

    it.each([
      ["⚪ gray-100", "#F3F4F6", 1.001],
      ["Graphite", "#e1e1e1", 1.148],
      ["Banana", "#fbd75b", 1.207],
      ["Sage", "#7ae7bf", 1.27],
    ])("would have been invisible for %s as a bare fill, at %s:1", (_label, color, bare) => {
      // The fill is still that ratio — the outline is what makes the patch locatable, so a later
      // tidy-up dropping the stroke would take the whole element with it.
      expect(contrastRatio(color, field(color))).toBeCloseTo(bare as number, 2);
    });

    it("paints above the wash, so the patch is the colour and not a tint of it", () => {
      const group = render();
      const rects: Element[] = [...group.querySelectorAll("rect")];

      expect(rects.indexOf(part(group, "swatch") as Element)).toBeGreaterThan(
        rects.indexOf(part(group, "wash") as Element)
      );
    });

    it("leaves the gap between the patch and the text it labels", () => {
      const group = render();
      const [x, width] = numbers(part(group, "swatch"), "x", "width");
      const [cardX, cardWidth] = numbers(part(group, "rect"), "x", "width");
      const textLeft =
        Number(line(group)?.getAttribute("x")) - (cardWidth - 12 - SWATCH_RESERVE) / 2;

      expect(cardX).toBeLessThan(x);
      expect(textLeft - (x + width)).toBeCloseTo(SWATCH_GAP, 4);
    });
  });

  it("distinguishes callers by idPrefix, so two components never collide on one page", () => {
    const nodes = eventCardNodes({
      idPrefix: "floating-label",
      id: "e1",
      ...GEOMETRY,
      color: "#22c55e",
      lines: ["Lunch"],
      fontSize: 14,
    });

    expect(nodes[0].getAttribute("data-testid")).toBe("floating-label-rect-e1");
  });
});

describe("cardStrokeWidth", () => {
  it("scales with font size", () => {
    expect(cardStrokeWidth(20)).toBeCloseTo(20 * 0.08, 4);
  });

  it("floors at the minimum hairline rather than vanishing for a small font", () => {
    expect(cardStrokeWidth(2)).toBe(1);
  });
});
