import { describe, expect, it } from "vitest";
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

  it("renders one text element per line, centred on the geometry", () => {
    const group = render({ lines: ["First line", "Second line"] });
    const rect = part(group, "rect");
    const [x, y, width, height] = numbers(rect, "x", "y", "width", "height");
    const first = line(group, 0);
    const second = line(group, 1);

    expect([first?.textContent, second?.textContent]).toEqual(["First line", "Second line"]);
    expect(Number(first?.getAttribute("x"))).toBeCloseTo(x + width / 2, 4);
    expect(Number(second?.getAttribute("x"))).toBeCloseTo(x + width / 2, 4);
    // Two lines straddle the vertical centre symmetrically.
    const centreY = y + height / 2;
    expect(Number(first?.getAttribute("y")) - centreY).toBeCloseTo(
      -(Number(second?.getAttribute("y")) - centreY),
      4
    );
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
