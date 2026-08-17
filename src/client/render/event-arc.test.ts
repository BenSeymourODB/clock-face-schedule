import { describe, expect, it } from "vitest";
import {
  FEATHER_DEGREES,
  type ClockEvent,
  computeArcTitleLayout,
} from "../../shared/clock";
import { eventArc } from "./event-arc";

const CX = 300;
const CY = 300;
const INNER = 244;
const OUTER = 292;

function makeEvent(overrides: Partial<ClockEvent> = {}): ClockEvent {
  const startAngle = overrides.startAngle ?? 0;
  const endAngle = overrides.endAngle ?? 60;

  return {
    id: "e1",
    title: "Team Meeting",
    cleanTitle: "Team Meeting",
    startAngle,
    endAngle,
    // The arc draws from the widened angles; the true ones only matter to ring stacking, so here
    // they simply mirror them.
    trueStartAngle: startAngle,
    trueEndAngle: endAngle,
    continuesBefore: false,
    continuesAfter: false,
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

    it.each([
      ["top half", 30, 90, "outer"],
      ["bottom half", 150, 210, "inner"],
    ])("puts the first line above the second on the %s", (_label, startAngle, endAngle, first) => {
      // Further from the centre is higher on screen at the top of the dial and lower at the
      // bottom, so a fixed outer-first order made lower-half titles read bottom-up.
      const base = computeArcTitleLayout({
        cleanTitle: "Reading and Snacks",
        arcSpan: endAngle - startAngle,
        innerRadius: INNER,
        outerRadius: OUTER,
      });
      const group = eventArc({
        event: makeEvent({ startAngle, endAngle }),
        cx: CX,
        cy: CY,
        innerRadius: INNER,
        outerRadius: OUTER,
        layout: { ...base, fit: { lines: ["Reading and", "Snacks"], didOverflow: false } },
      });

      const radii = [...group.querySelectorAll("defs path")].map((node) =>
        arcRadius(node.getAttribute("d") ?? "")
      );

      expect(radii[0]).toBe(first === "outer" ? Math.max(...radii) : Math.min(...radii));
    });

    it("keeps the emoji clear of a two-line title", () => {
      // These stack radially, and at the inherited ratios they needed 1.03 of the ring between
      // them — a measured 8.7-unit collision on a full-width band, invisible until the dial was
      // scaled up for distance.
      const base = computeArcTitleLayout({
        cleanTitle: "Reading and Snacks",
        arcSpan: 60,
        innerRadius: INNER,
        outerRadius: OUTER,
      });
      const twoLines = {
        ...base,
        fit: { lines: ["Reading and", "Snacks"], didOverflow: false },
      };

      const group = eventArc({
        event: makeEvent({ eventEmoji: "🎂" }),
        cx: CX,
        cy: CY,
        innerRadius: INNER,
        outerRadius: OUTER,
        layout: twoLines,
      });

      const emoji = group.querySelector('[data-testid="event-emoji-e1"]')!;
      const emojiRadius = Math.hypot(
        Number(emoji.getAttribute("x")) - CX,
        Number(emoji.getAttribute("y")) - CY
      );
      const emojiTop = emojiRadius + Number(emoji.getAttribute("font-size")) / 2;

      const baselines = [...group.querySelectorAll("defs path")].map((node) =>
        arcRadius(node.getAttribute("d") ?? "")
      );
      const titleBottom = Math.min(...baselines) - twoLines.titleFontSize / 2;

      expect(emojiTop).toBeLessThan(titleBottom);
      // And both stay inside the ring they belong to.
      expect(emojiRadius - Number(emoji.getAttribute("font-size")) / 2).toBeGreaterThanOrEqual(
        INNER
      );
      expect(Math.max(...baselines) + twoLines.titleFontSize / 2).toBeLessThanOrEqual(OUTER);
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

describe("eventArc at a period boundary", () => {
  const SEPARATOR = 1.44; // (OUTER − INNER) × ARC_SEPARATOR_RATIO

  function fade(overrides: Partial<ClockEvent>) {
    const group = render(overrides);
    return {
      path: group.querySelector('[data-testid="event-arc-e1"]'),
      mask: group.querySelector("mask"),
      gradients: [...group.querySelectorAll("linearGradient")],
      wedges: [...group.querySelectorAll("mask path")],
      titlePaths: [...group.querySelectorAll("defs > path")],
    };
  }

  /** Angle of an `M x y` or an arc endpoint, in the dial's 0°-at-twelve convention. */
  function angleOf(x: number, y: number): number {
    return (Math.atan2(y - CY, x - CX) * (180 / Math.PI) + 450) % 360;
  }

  /** Angular span a mask wedge covers, from its `M` point round to its outer arc endpoint. */
  function wedgeSpan(d: string): number {
    const [mx, my, , , , , , ax, ay] = d.split(/[ A]+/).slice(1).map(Number);
    return (angleOf(ax, ay) - angleOf(mx, my) + 360) % 360;
  }

  it("leaves an arc the period did not clip unmasked", () => {
    const { path, mask } = fade({});

    expect(path?.hasAttribute("mask")).toBe(false);
    expect(mask).toBeNull();
  });

  it.each([
    ["already running when the period began", { continuesBefore: true }],
    ["still running when the period ends", { continuesAfter: true }],
  ])("fades an event %s", (_label, overrides) => {
    const { path, mask, gradients } = fade(overrides);

    expect(path?.getAttribute("mask")).toBe("url(#arc-fade-e1)");
    expect(mask?.getAttribute("id")).toBe("arc-fade-e1");
    expect(gradients).toHaveLength(1);
  });

  it("fades both ends of an event that outruns the period at each", () => {
    const { gradients } = fade({ continuesBefore: true, continuesAfter: true });

    expect(gradients.map((g) => g.getAttribute("id"))).toEqual([
      "arc-fade-e1-start",
      "arc-fade-e1-end",
    ]);
  });

  it("ramps from nothing at the boundary to full strength where the arc resumes", () => {
    const [gradient] = fade({ continuesBefore: true }).gradients;
    const stops = [...gradient.querySelectorAll("stop")];

    expect(stops.map((s) => s.getAttribute("stop-opacity"))).toEqual(["1", "0"]);
    // A luminance mask, so the ramp is black-on-white: opaque black hides, transparent reveals.
    expect(stops.every((s) => s.getAttribute("stop-color") === "#000000")).toBe(true);
  });

  it("anchors the gradient axis on the boundary and points it into the arc", () => {
    // startAngle 0 is twelve o'clock, so the fade runs clockwise from straight up.
    const [gradient] = fade({ startAngle: 0, endAngle: 60, continuesBefore: true }).gradients;
    const at = (name: string) => Number(gradient.getAttribute(name));

    expect(at("x1")).toBeCloseTo(CX, 4);
    expect(at("y1")).toBeLessThan(CY);
    expect(angleOf(at("x2"), at("y2"))).toBeCloseTo(FEATHER_DEGREES, 4);
  });

  it("covers the separator stroke, which would otherwise cap the boundary with a crisp line", () => {
    const [wedge] = fade({ startAngle: 0, endAngle: 60, continuesBefore: true }).wedges;
    const d = wedge.getAttribute("d") ?? "";
    // `matchAll` would be tidier, but the target is ES2019.
    const radii = d.split("A ").slice(1).map(parseFloat);

    // The stroke straddles the path by half its width in every direction — radially…
    expect(radii).toEqual([OUTER + SEPARATOR, INNER - SEPARATOR]);
    // …and angularly, past the boundary, where a bare wedge would leave a hairline behind.
    const padDegrees = (SEPARATOR / OUTER) * (180 / Math.PI);
    expect(wedgeSpan(d)).toBeCloseTo(FEATHER_DEGREES + padDegrees, 3);
  });

  it("leaves the title unmasked, so the name stays readable where the band does not", () => {
    const group = render({ continuesAfter: true });
    const title = group.querySelector('[data-testid="event-title-e1"]');

    expect(title).not.toBeNull();
    expect(title?.hasAttribute("mask")).toBe(false);
  });

  it("keeps the title's baseline paths out of the mask", () => {
    // Both live in the same <defs> now; only the fade wedges belong inside the <mask>.
    const { titlePaths, wedges } = fade({ continuesBefore: true });

    expect(titlePaths).toHaveLength(1);
    expect(wedges).toHaveLength(1);
    expect(titlePaths[0].getAttribute("id")).toBe("text-path-e1-0");
  });
});
