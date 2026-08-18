import { describe, expect, it } from "vitest";
import { floatingLabel } from "./floating-label";

const CX = 300;
const CY = 300;
const ANCHOR_RADIUS = 292;
const LABEL_RADIUS = 320.8;
const FACE_RADIUS = 204.4;

/** A 600px dial: face plus arc band spans 8 → 592 on both axes, so the allowance is 58.4. */
const CLOCK_BOX = {
  top: 8,
  bottom: 592,
  height: 584,
  left: 8,
  right: 592,
  width: 584,
};
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
    faceRadius: FACE_RADIUS,
    ...overrides,
  });
}

function part(group: SVGGElement, name: string): Element | null {
  return group.querySelector(`[data-testid="floating-label-${name}-e1"]`);
}

/** One wrapped line of label text, outermost first. */
function line(group: SVGGElement, index = 0): Element | null {
  return group.querySelector(`[data-testid="floating-label-text-e1-${index}"]`);
}

function lineTexts(group: SVGGElement): string[] {
  return [...group.querySelectorAll('[data-testid^="floating-label-text-e1-"]')].map(
    (node) => node.textContent ?? ""
  );
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
      const [textX, textY] = numbers(line(group), "x", "y");

      expect(x + width / 2).toBeCloseTo(textX, 4);
      expect(y + height / 2).toBeCloseTo(textY, 4);
    });

    it("inverts the face tokens rather than hard-coding a light chip", () => {
      expect(rect?.getAttribute("fill")).toBe("var(--card-foreground)");
      expect(line(group)?.getAttribute("fill")).toBe("var(--card)");
    });

    it("borders in the event colour", () => {
      expect(part(group, "border")?.getAttribute("stroke")).toBe("#22c55e");
      expect(part(group, "connector")?.getAttribute("stroke")).toBe("#22c55e");
    });

    it("washes the card's field with the event colour, tying it to its arc (#29)", () => {
      const wash = part(group, "wash");

      expect(wash?.getAttribute("fill")).toBe("#22c55e");
      expect(Number(wash?.getAttribute("fill-opacity"))).toBeGreaterThan(0);
      expect(Number(wash?.getAttribute("fill-opacity"))).toBeLessThan(1);
    });

    it("stacks base, wash and border as separate rects sharing the card's exact geometry", () => {
      const wash = part(group, "wash");
      const border = part(group, "border");

      for (const attr of ["x", "y", "width", "height", "rx", "ry"]) {
        expect(wash?.getAttribute(attr)).toBe(rect?.getAttribute(attr));
        expect(border?.getAttribute(attr)).toBe(rect?.getAttribute(attr));
      }
    });

    it("keeps the wash and border from also carrying the base's fill", () => {
      // A wash with no fill would be invisible; a border with a fill would blot out the wash
      // underneath it — each rect's un-shared paint attribute must be the deliberate one.
      expect(part(group, "wash")?.getAttribute("stroke")).toBeNull();
      expect(part(group, "border")?.getAttribute("fill")).toBe("none");
    });

    it("paints the border above the wash, so it reads at full strength", () => {
      const rectEls: Element[] = [...group.querySelectorAll("rect")];

      expect(rectEls.indexOf(part(group, "border") as Element)).toBeGreaterThan(
        rectEls.indexOf(part(group, "wash") as Element)
      );
    });

    it("renders the full text on one line when the card has room for it", () => {
      expect(lineTexts(group)).toEqual(["Parent Teacher Conference"]);
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

      expect(numbers(line(group), "y")[0]).toBeCloseTo(limit, 4);
    });

    it("slides vertically without re-projecting around the circle", () => {
      // x is preserved so the label stays visually attached to the arc it points at.
      const group = render({ anchorAngle: 0, labelRadius: 400 });

      expect(numbers(line(group), "x")[0]).toBeCloseTo(CX, 4);
    });

    it("leaves a label inside the box alone", () => {
      const group = render({ anchorAngle: 90 });

      expect(numbers(line(group), "y")[0]).toBeCloseTo(CY, 4);
    });
  });

  describe("horizontal clamp", () => {
    it.each([
      ["nine o'clock", 270],
      ["three o'clock", 90],
    ])("keeps a wide card at %s from running off the side", (_label, anchorAngle) => {
      // The original clamped only y, on the reasoning that preserving x keeps the label attached
      // to its arc. But card width grows with the title without bound, so a long one at 9 or 3
      // o'clock was simply clipped mid-word.
      const group = render({ anchorAngle, text: "A Rather Long Committee Meeting Title" });
      const [x, width] = numbers(part(group, "rect"), "x", "width");
      const allowance = CLOCK_BOX.width * 0.1;

      expect(x).toBeGreaterThanOrEqual(CLOCK_BOX.left - allowance - 1e-6);
      expect(x + width).toBeLessThanOrEqual(CLOCK_BOX.right + allowance + 1e-6);
    });

    it("still slides vertically rather than horizontally when it fits", () => {
      // x is preserved whenever the card has room, so labels stay pointing outward radially.
      const group = render({ anchorAngle: 45, text: "Short" });

      expect(numbers(line(group), "x")[0]).toBeCloseTo(
        CX + LABEL_RADIUS * Math.sin((45 * Math.PI) / 180),
        3
      );
    });
  });
});

/**
 * #21: a card sized to its title rather than to the room available ended up lying across the
 * numerals and the hands. These use the dial's real proportions rather than the fixture above,
 * because the defect was a consequence of them.
 */
describe("floatingLabel against the dial's real geometry", () => {
  const OUTER = 292;
  const FACE = FACE_RADIUS;
  const LABEL_RADIUS_REAL = OUTER * 1.02;
  const FONT = 17.52;
  const LONG = "Parent Teacher Conference Planning Committee";
  const EVERY_15_DEGREES = Array.from({ length: 24 }, (_unused, i) => i * 15);

  function card(anchorAngle: number, text = LONG) {
    const group = floatingLabel({
      id: "e1",
      text,
      anchorAngle,
      anchorRadius: OUTER,
      labelRadius: LABEL_RADIUS_REAL,
      color: "#22c55e",
      cx: CX,
      cy: CY,
      clockBox: CLOCK_BOX,
      faceRadius: FACE,
      fontSize: FONT,
    });
    const [x, y, width, height] = numbers(part(group, "rect"), "x", "y", "width", "height");
    return { group, x, y, width, height };
  }

  /** Distance from the dial's centre to the nearest point of the card. */
  function gapToCentre({ x, y, width, height }: ReturnType<typeof card>): number {
    const dx = Math.max(x - CX, 0, CX - (x + width));
    const dy = Math.max(y - CY, 0, CY - (y + height));
    return Math.hypot(dx, dy);
  }

  it.each(EVERY_15_DEGREES)("clears the clock face at %i°", (anchorAngle) => {
    // The defect verbatim: the card covered the numerals 11, 12 and 1. Nothing the positioning
    // rule could do would fix it, because the card was simply too big for the dial.
    expect(gapToCentre(card(anchorAngle))).toBeGreaterThan(FACE);
  });

  it.each(EVERY_15_DEGREES)("needs no horizontal clamping at %i°", (anchorAngle) => {
    // Sizing to `labelWidthLimit` is supposed to make the clamp a no-op, and the clamp pulling a
    // card inward is precisely how it landed on the face. Assert the card is where the angle put
    // it, not where the clamp had to put it.
    const { x, width } = card(anchorAngle);
    const natural = CX + LABEL_RADIUS_REAL * Math.sin((anchorAngle * Math.PI) / 180);

    expect(x + width / 2).toBeCloseTo(natural, 4);
  });

  it("wraps a long title rather than widening the card", () => {
    const upperLeft = card(302.5);

    expect(lineTexts(upperLeft.group).length).toBeGreaterThan(1);
    // The card that provoked the issue was 561 units wide on a 600-unit viewBox.
    expect(upperLeft.width).toBeLessThan(300);
  });

  it("grows downward one line at a time", () => {
    const { group, height } = card(302.5);
    const ys = [...group.querySelectorAll('[data-testid^="floating-label-text-e1-"]')].map((node) =>
      Number(node.getAttribute("y"))
    );

    expect(ys).toEqual([...ys].sort((a, b) => a - b));
    expect(height).toBeCloseTo(ys.length * FONT * 1.4 + 6, 4);
  });

  it("caps the lines and marks the cut rather than growing without bound", () => {
    // Three lines is not enough for this title at nine o'clock, where the frame leaves the least
    // room. Ellipsized is the compromise; silently dropping words is not.
    const lines = lineTexts(card(270).group);

    expect(lines.length).toBeLessThanOrEqual(3);
    expect(lines[lines.length - 1]).toMatch(/(\.\.\.|…)$/);
  });

  it("keeps a short title to a single line", () => {
    expect(lineTexts(card(302.5, "Lunch").group)).toEqual(["Lunch"]);
  });
});
