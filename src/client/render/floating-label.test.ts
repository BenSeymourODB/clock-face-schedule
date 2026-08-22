import { describe, expect, it } from "vitest";
import { SWATCH_RESERVE, compositeOver, contrastRatio, roundCoord } from "../../shared/clock";
import { arcFillColor, BAND_BACKGROUND } from "./event-arc";
import { connectorColor, floatingLabel, floatingLabelGeometry } from "./floating-label";

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
      // 25 chars × 14px × 0.6 + 6px padding either side, plus the swatch's own room (#118).
      const [width, height] = numbers(rect, "width", "height");

      expect(width).toBeCloseTo(25 * 14 * 0.6 + 12 + SWATCH_RESERVE, 4);
      expect(height).toBeCloseTo(14 * 1.4 + 6, 4);
    });

    it("centres on the label position", () => {
      const [x, y, width, height] = numbers(rect, "x", "y", "width", "height");
      const [textX, textY] = numbers(line(group), "x", "y");

      // The card centres on the position; its text centres on the room the swatch leaves, which is
      // half the reserve to the right of that.
      expect(x + width / 2).toBeCloseTo(textX - SWATCH_RESERVE / 2, 4);
      expect(y + height / 2).toBeCloseTo(textY, 4);
    });

    /**
     * The swatch's room comes out of the text budget rather than being added to the card, so every
     * bound in this file — the face clearance, the horizontal clamp, the label allowance — is
     * measured against the same total width it was before #118. A card that grew instead would pass
     * its own spec and move all of theirs.
     */
    it("takes the swatch's room from the text, not from the card's width bound", () => {
      const wide = render({ text: "A Rather Long Committee Meeting Title", anchorAngle: 270 });
      const [x, width] = numbers(part(wide, "rect"), "x", "width");
      const allowance = CLOCK_BOX.width * 0.1;

      expect(x).toBeGreaterThanOrEqual(CLOCK_BOX.left - allowance - 1e-6);
      expect(x + width).toBeLessThanOrEqual(CLOCK_BOX.right + allowance + 1e-6);
    });

    it("inverts the face tokens rather than hard-coding a light chip", () => {
      expect(rect?.getAttribute("fill")).toBe("var(--card-foreground)");
      expect(line(group)?.getAttribute("fill")).toBe("var(--card)");
    });

    it("borders in the event colour", () => {
      // The connector matches only because green clears its floor untouched (#93) — the colours
      // that do not are measured below, where the floor itself is the subject.
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

    /**
     * #93: the connector is a graphical object on the page's ground, and for the darkest colours it
     * was not a faint line but no line — ⚫ at 1.15:1, 🟤 at 1.68. These measure the *painted*
     * stroke, which is the only version of it a viewer meets: the attribute is the authored-or-
     * floored colour and the paint is that colour composited at `CONNECTOR_OPACITY`.
     */
    describe("colour, against the page it crosses", () => {
      /** WCAG 1.4.11's floor for a non-text object — the same one #66 gave a filled arc's body. */
      const AA_GRAPHICAL_OBJECT = 3;
      const CONNECTOR_OPACITY = 0.6;

      /** What a viewer sees where the connector is stroked, against the ground beside it. */
      function painted(stroke: string): number {
        const over = compositeOver(BAND_BACKGROUND, stroke, CONNECTOR_OPACITY);
        return contrastRatio(over as string, BAND_BACKGROUND) as number;
      }

      function strokeOf(color: string): string {
        return part(render({ color }), "connector")?.getAttribute("stroke") ?? "";
      }

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

      it.each(EVERY_COLOUR)("%s reads as a line once painted", (_label, color) => {
        expect(painted(strokeOf(color))).toBeGreaterThanOrEqual(AA_GRAPHICAL_OBJECT);
      });

      it.each([
        ["🔴 red-500", "#EF4444", 2.48],
        ["🔵 blue-500", "#3B82F6", 2.6],
        ["🟣 purple-500", "#A855F7", 2.46],
        ["⚫ gray-800", "#1F2937", 1.15],
        ["🟤 amber-800", "#92400E", 1.68],
      ])("floors %s, which painted at %s:1", (_label, color, before) => {
        // The authored colour is what the defect measured; the drawn one is what replaced it.
        expect(painted(color)).toBeCloseTo(before as number, 2);
        expect(strokeOf(color as string)).not.toBe(color);
      });

      it.each([
        ["🟠 orange-500", "#F97316"],
        ["🟢 green-500", "#22C55E"],
        ["🟡 yellow-500", "#EAB308"],
        ["⚪ gray-100", "#F3F4F6"],
      ])("returns %s exactly as authored, since it already reads", (_label, color) => {
        expect(strokeOf(color)).toBe(color);
      });

      it("needs its own alpha, not the arcs' floored fill (#66)", () => {
        // 0.6 mixes back more ground than the arcs' 0.85, so a colour floored for the fill is still
        // short as a stroke: reusing `arcFillColor` here would under-correct rather than duplicate.
        expect(painted(arcFillColor("#1F2937"))).toBeLessThan(AA_GRAPHICAL_OBJECT);
        expect(connectorColor("#1F2937")).not.toBe(arcFillColor("#1F2937"));
      });

      it("floors the line and not the card, whose ground is the light field (#29)", () => {
        // One assertion because the three used to be one colour: a later tidy-up that ran all of
        // them through the floor would wash out a card sitting on `--card-foreground`, where the
        // authored colour is what ties the chip to its arc.
        const group = render({ color: "#1F2937" });

        expect(part(group, "connector")?.getAttribute("stroke")).toBe(connectorColor("#1F2937"));
        expect(part(group, "wash")?.getAttribute("fill")).toBe("#1F2937");
        expect(part(group, "border")?.getAttribute("stroke")).toBe("#1F2937");
      });
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
      // x is preserved so the label stays visually attached to the arc it points at. Measured on
      // the card, not on its text: the text sits off-centre by the swatch's reserve (#118), and the
      // card is the thing whose position the clamp is about.
      const group = render({ anchorAngle: 0, labelRadius: 400 });
      const [x, width] = numbers(part(group, "rect"), "x", "width");

      expect(x + width / 2).toBeCloseTo(CX, 4);
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
      const [x, width] = numbers(part(group, "rect"), "x", "width");

      expect(x + width / 2).toBeCloseTo(CX + LABEL_RADIUS * Math.sin((45 * Math.PI) / 180), 3);
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

  function card(anchorAngle: number, text = LONG, duration?: string) {
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
      duration,
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

  /**
   * What the granted margin (#30 item 1) costs on the band, pinned exactly.
   *
   * A card is centred on the locus and grows about its own centre, so widening it moves its inner
   * edge **inward**. That is #98, and it is the same cost ADR 0009 measured against #88's inward
   * ellipse arriving from the other direction — widening about a fixed locus and moving the locus
   * inward do the same thing to the inner edge.
   *
   * Worth recording that #30's decision comment says the opposite — that granting the margin
   * "closes #98's side collisions … by construction". That is true of the *band-clearing* locus ADR
   * 0009 pairs with the margin and false of the margin alone; the two were run together in one
   * sentence. Nothing here moves the locus, because the locus belongs to the fork (#138), which
   * cannot be judged until the margin is granted.
   *
   * So this is a guard on a known regression rather than a fix: the numbers are here, at the angle
   * where the allowance binds, so the next change to the locus or to a card's width is measured
   * against them instead of found by rendering.
   *
   * #118's swatch is the first change to be measured against them, and it moved both. At today's
   * inherited allowance the card reflows and gives back most of the swatch's 12 units, so the inner
   * edge moves 0.74 (249.79 → 249.05, 55.6% → 56.6%). At the granted 16:9 margin the text is bound
   * by the face rather than by the budget, so the whole 12 lands on the width and the edge moves the
   * full 6 (218.26 → 212.26) — **past** the band's inner edge at 216.08, which is why the second
   * figure is now a coverage over 1 rather than a percentage of the band.
   */
  describe("the granted margin, and what it costs the band (#98)", () => {
    const BAND_INNER = OUTER - OUTER * 0.26;

    function innerEdge(anchorAngle: number, labelAllowance?: number): number {
      const { rect } = floatingLabelGeometry({
        id: "e1",
        text: LONG,
        anchorAngle,
        anchorRadius: OUTER,
        labelRadius: LABEL_RADIUS_REAL,
        color: "#22c55e",
        cx: CX,
        cy: CY,
        clockBox: labelAllowance === undefined ? CLOCK_BOX : { ...CLOCK_BOX, labelAllowance },
        faceRadius: FACE,
        fontSize: FONT,
      });
      // At three and nine o'clock the card's radial extent is its half-width, so this is the
      // quantity the allowance moves.
      return Math.hypot(
        Math.max(rect.x - CX, 0, CX - (rect.x + rect.width)),
        Math.max(rect.y - CY, 0, CY - (rect.y + rect.height))
      );
    }

    const coverage = (inner: number) => (OUTER - inner) / (OUTER - BAND_INNER);

    it.each([90, 270])("covers 56.6% of the band at %i degrees, inherited", (angle) => {
      const inner = innerEdge(angle);

      expect(inner).toBeCloseTo(249.05, 2);
      expect(coverage(inner)).toBeCloseTo(0.566, 3);
    });

    it.each([90, 270])(
      "covers the whole of it at %i degrees once a 16:9 board's margin is granted",
      (angle) => {
        // Sized by `faceClearanceLimit` rather than by the frame at this margin — and then by the
        // widest line the text actually needs, which is why the edge stops short of the face.
        const inner = innerEdge(angle, 234.5 + 8);

        expect(inner).toBeCloseTo(212.26, 2);
        expect(coverage(inner)).toBeCloseTo(1.05, 3);
      }
    );

    it("still clears the clock face, which is the bound that must not move", () => {
      for (let angle = 0; angle < 360; angle += 15) {
        expect(innerEdge(angle, 234.5 + 8)).toBeGreaterThanOrEqual(FACE);
      }
    });

    /**
     * `>= FACE` is satisfiable with nothing to spare, and #118 spent 6 of the units that were spare:
     * clearance to the face at the binding angle went 13.86 → **7.86**. Pinned as a floor rather than
     * left to the inequality, because the next change to a card's width is the one that would find
     * out by rendering — which is how #21 was found in the first place.
     */
    it.each([90, 270])("keeps 7.86 units between the card and the face at %i degrees", (angle) => {
      expect(innerEdge(angle, 234.5 + 8) - FACE).toBeCloseTo(7.86, 2);
    });
  });

  /**
   * #35's duration, on the surface where it earns most: a label exists because the arc was too
   * narrow for its title, and a narrow arc is exactly where `MIN_ARC_DEGREES` has already flattened
   * ten minutes and fifteen into the same 7.5°.
   */
  describe("duration line", () => {
    it("follows the title on a line of its own", () => {
      expect(lineTexts(card(302.5, "Assembly", "45 min").group)).toEqual(["Assembly", "45 min"]);
    });

    // A card sized to three lines that then draws four is #21 again with a different arithmetic
    // error behind it: the clearance below is computed from the tallest the card may become, so the
    // duration has to be counted there and not only where it is drawn.
    it.each(EVERY_15_DEGREES)("still clears the clock face at %i°", (anchorAngle) => {
      expect(gapToCentre(card(anchorAngle, LONG, "1 hr 10"))).toBeGreaterThan(FACE);
    });

    it.each(EVERY_15_DEGREES)("still needs no horizontal clamping at %i°", (anchorAngle) => {
      const { x, width } = card(anchorAngle, LONG, "1 hr 10");
      const natural = CX + LABEL_RADIUS_REAL * Math.sin((anchorAngle * Math.PI) / 180);

      expect(x + width / 2).toBeCloseTo(natural, 4);
    });

    // The card is sized to its widest line, and a short title with a long duration inverts which
    // line that is.
    it("widens the card when the duration is the longest line", () => {
      const withDuration = card(0, "Yoga", "20 min");
      const plain = card(0, "Yoga");

      expect(lineTexts(withDuration.group)).toEqual(["Yoga", "20 min"]);
      expect(withDuration.width).toBeGreaterThan(plain.width);
    });

    // The dial chooses whether a card can afford this line by laying it out twice and comparing the
    // boxes, so the geometry it measures has to be the geometry that gets drawn. If the two drifted
    // it would decline durations that fit and keep ones that overlap.
    it.each([
      ["with a duration", "1 hr 10"],
      ["without one", undefined],
    ])("reports the same box it draws, %s", (_label, duration) => {
      const params = {
        id: "e1",
        text: LONG,
        anchorAngle: 302.5,
        anchorRadius: OUTER,
        labelRadius: LABEL_RADIUS_REAL,
        color: "#22c55e",
        cx: CX,
        cy: CY,
        clockBox: CLOCK_BOX,
        faceRadius: FACE,
        fontSize: FONT,
        duration,
      };
      const { rect, lines } = floatingLabelGeometry(params);
      const group = floatingLabel(params);
      const [x, y, width, height] = numbers(part(group, "rect"), "x", "y", "width", "height");

      expect([x, y, width, height]).toEqual([
        roundCoord(rect.x),
        roundCoord(rect.y),
        roundCoord(rect.width),
        roundCoord(rect.height),
      ]);
      expect(lineTexts(group)).toEqual(lines);
    });

    it("grows the card downward by exactly one line", () => {
      const plain = card(302.5, "Assembly");
      const withDuration = card(302.5, "Assembly", "45 min");

      expect(withDuration.height).toBeCloseTo(plain.height + FONT * 1.4, 4);
    });

    /**
     * #183 — a card that merely *offers* a duration was cleared against a fourth line whether or
     * not it ever drew one, and wrapped its title into the narrower budget that bought.
     *
     * The guard #183 asks for is "no card renders an ellipsis while any of its own limits is
     * unspent". Stated against the clearance it is the equality below, and it is asserted
     * unconditionally rather than only for ellipsized cards — measured over 192 pinned states on
     * the built preview, all 70 cuts are four-line cards, so an ellipsis-only guard was green
     * before the fix and would not have caught this. What the fix moves is the other 356 cards, of
     * which 313 were cleared against two lines they never drew.
     */
    describe("the height the card is cleared against (#183)", () => {
      function geometry(anchorAngle: number, text: string, duration?: string) {
        return floatingLabelGeometry({
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
          duration,
        });
      }

      it.each(EVERY_15_DEGREES)(
        "is the height it draws, with a duration on offer, at %i°",
        (anchorAngle) => {
          const { lines, limits } = geometry(anchorAngle, LONG, "1 hr 10");

          expect(limits.clearedLines).toBe(lines.length);
        }
      );

      it.each(EVERY_15_DEGREES)("is the height it draws, with none on offer, at %i°", (anchorAngle) => {
        const { lines, limits } = geometry(anchorAngle, LONG);

        expect(limits.clearedLines).toBe(lines.length);
      });

      // Two o'clock, where the face binds rather than the frame. Cleared against four lines it has
      // 155.9 units and eleven characters, so a thirteen-character title split; the card only ever
      // drew two lines, and at that height it has 187.0 units and fifteen characters.
      it("does not split a title into room a fourth line was holding but never used", () => {
        const { lines, limits } = geometry(60, "Spelling Test", "1 hr 10");

        expect(lines).toEqual(["Spelling Test", "1 hr 10"]);
        expect(limits.clearedLines).toBe(2);
        expect(limits.face).toBeCloseTo(187.0, 1);
      });

      // The control, on the same dial at the same angle: a title that genuinely fills its three
      // lines is cleared against all four and gains nothing. Without it the test above could pass
      // by never clearing against the duration at all.
      it("still clears against every line a card that fills them does draw", () => {
        const { lines, limits } = geometry(60, "Assembly Notes and Reminders", "1 hr 10");

        expect(lines).toEqual(["Assembly", "Notes and", "Reminders", "1 hr 10"]);
        expect(limits.clearedLines).toBe(4);
        expect(limits.face).toBeCloseTo(155.9, 1);
      });
    });
  });
});
