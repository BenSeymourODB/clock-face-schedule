import { describe, expect, it } from "vitest";
import { floatingLabel } from "./floating-label";

const CX = 300;
const CY = 300;
const ANCHOR_RADIUS = 292;
const LABEL_RADIUS = 320.8;

/** A 600px dial: face plus arc band spans y 8 → 592, so the clamp allowance is 58.4. */
const CLOCK_BOX = { top: 8, bottom: 592, height: 584 };
const UPPER_LIMIT = 8 - 58.4;
const LOWER_LIMIT = 592 + 58.4;

function render(overrides: Partial<Parameters<typeof floatingLabel>[0]> = {}): SVGGElement {
  return floatingLabel({
    id: "e1",
    text: "Parent Teacher Conference",
    anchorAngle: 45,
    anchorRadius: ANCHOR_RADIUS,
    labelRadius: LABEL_RADIUS,
    color: "#22c55e",
    cx: CX,
    cy: CY,
    clockBox: CLOCK_BOX,
    ...overrides,
  });
}

function part(group: SVGGElement, name: string): Element | null {
  return group.querySelector(`[data-testid="floating-label-${name}-e1"]`);
}

function numbers(element: Element | null, ...names: string[]): number[] {
  return names.map((name) => Number(element?.getAttribute(name)));
}

describe("floatingLabel", () => {
  describe("the card", () => {
    const group = render();
    const rect = part(group, "rect");

    it("sizes itself from the text length", () => {
      // 25 chars × 14px × 0.6 + 6px padding either side.
      const [width, height] = numbers(rect, "width", "height");

      expect(width).toBeCloseTo(25 * 14 * 0.6 + 12, 4);
      expect(height).toBeCloseTo(14 * 1.4 + 6, 4);
    });

    it("centres on the label position", () => {
      const [x, y, width, height] = numbers(rect, "x", "y", "width", "height");
      const [textX, textY] = numbers(part(group, "text"), "x", "y");

      expect(x + width / 2).toBeCloseTo(textX, 4);
      expect(y + height / 2).toBeCloseTo(textY, 4);
    });

    it("inverts the face tokens rather than hard-coding a light chip", () => {
      expect(rect?.getAttribute("fill")).toBe("var(--card-foreground)");
      expect(part(group, "text")?.getAttribute("fill")).toBe("var(--card)");
    });

    it("borders in the event colour", () => {
      expect(rect?.getAttribute("stroke")).toBe("#22c55e");
      expect(part(group, "connector")?.getAttribute("stroke")).toBe("#22c55e");
    });

    it("renders the full text — truncation is the arc's job, not the label's", () => {
      expect(part(group, "text")?.textContent).toBe("Parent Teacher Conference");
    });
  });

  describe("connector", () => {
    it.each([0, 45, 135, 180, 225, 315])(
      "stops on the card's edge rather than under it, at %i°",
      (anchorAngle) => {
        const group = render({ anchorAngle });
        const [x, y, width, height] = numbers(part(group, "rect"), "x", "y", "width", "height");
        const [x2, y2] = numbers(part(group, "connector"), "x2", "y2");

        const onVerticalEdge = Math.abs(x2 - x) < 1e-6 || Math.abs(x2 - (x + width)) < 1e-6;
        const onHorizontalEdge = Math.abs(y2 - y) < 1e-6 || Math.abs(y2 - (y + height)) < 1e-6;

        expect(onVerticalEdge || onHorizontalEdge).toBe(true);
        expect(x2).toBeGreaterThanOrEqual(x - 1e-6);
        expect(x2).toBeLessThanOrEqual(x + width + 1e-6);
        expect(y2).toBeGreaterThanOrEqual(y - 1e-6);
        expect(y2).toBeLessThanOrEqual(y + height + 1e-6);
      }
    );

    it("starts on the arc's outer edge", () => {
      const [x1, y1] = numbers(part(render({ anchorAngle: 0 }), "connector"), "x1", "y1");

      expect(x1).toBeCloseTo(CX, 4);
      expect(y1).toBeCloseTo(CY - ANCHOR_RADIUS, 4);
    });

    it("degrades to zero length rather than NaN when anchor and centre coincide", () => {
      const group = render({ anchorAngle: 0, labelRadius: ANCHOR_RADIUS });
      const [x1, y1, x2, y2] = numbers(part(group, "connector"), "x1", "y1", "x2", "y2");

      expect([x1, y1, x2, y2].every(Number.isFinite)).toBe(true);
      expect(x2).toBeCloseTo(x1, 4);
      expect(y2).toBeCloseTo(y1, 4);
    });
  });

  describe("vertical clamp", () => {
    it.each([
      ["twelve o'clock", 0, UPPER_LIMIT],
      ["six o'clock", 180, LOWER_LIMIT],
    ])("holds a label at %s inside the layout box", (_label, anchorAngle, limit) => {
      // A radius well past the dial, so the label would otherwise escape and grow the row.
      const group = render({ anchorAngle, labelRadius: 400 });

      expect(numbers(part(group, "text"), "y")[0]).toBeCloseTo(limit, 4);
    });

    it("slides vertically without re-projecting around the circle", () => {
      // x is preserved so the label stays visually attached to the arc it points at.
      const group = render({ anchorAngle: 0, labelRadius: 400 });

      expect(numbers(part(group, "text"), "x")[0]).toBeCloseTo(CX, 4);
    });

    it("leaves a label inside the box alone", () => {
      const group = render({ anchorAngle: 90 });

      expect(numbers(part(group, "text"), "y")[0]).toBeCloseTo(CY, 4);
    });
  });
});
