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
      // The separator has to track whichever background sits behind the band. It lives on its own
      // path now, so that an elapsed arc can keep an outline after losing its fill.
      const border = group.querySelector('[data-testid="event-arc-border-e1"]');

      expect(border?.getAttribute("stroke")).toBe("var(--card)");
      expect(border?.getAttribute("fill")).toBe("none");
      expect(path?.getAttribute("stroke")).toBe("none");
    });

    it("draws fill and border on the same geometry", () => {
      const border = group.querySelector('[data-testid="event-arc-border-e1"]');

      expect(border?.getAttribute("d")).toBe(path?.getAttribute("d"));
    });

    it("draws a closed donut segment", () => {
      expect(path?.getAttribute("d")).toMatch(/^M .* Z$/);
    });
  });

  describe("accessible name", () => {
    it("names the event", () => {
      expect(render().getAttribute("aria-label")).toBe("Event: Team Meeting");
    });

    it("puts the emoji inline, ahead of the title", () => {
      expect(render({ eventEmoji: "🎮" }).getAttribute("aria-label")).toBe(
        "Event: 🎮 Team Meeting"
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
      // At 45° the default title fits and renders inline with the emoji, so the standalone
      // glyph — the fallback for when nothing else on the arc names the event — stands down.
      [45, false],
    ])("at %i° the standalone emoji is rendered: %s", (degrees, expected) => {
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

    it("takes the emoji with the title when the label has taken it over", () => {
      // The glyph used to stay behind here. It now goes with the text, because the label renders
      // the emoji inline and a glyph left on the arc collides with the card — measured on the
      // fixture's conference event as an overlap with the card's last line of text.
      const group = eventArc({
        event: makeEvent({ eventEmoji: "🎮" }),
        cx: CX,
        cy: CY,
        innerRadius: INNER,
        outerRadius: OUTER,
        forceHideTitle: true,
      });

      expect(group.querySelector('[data-testid="event-title-e1"]')).toBeNull();
      expect(group.querySelector('[data-testid="event-emoji-e1"]')).toBeNull();
    });

    it("keeps the glyph on an arc too narrow for a title, where nothing else names the event", () => {
      // Between the emoji floor and the title floor there is no title to carry the emoji inline,
      // and no label either, so the standalone glyph is the only cue the arc has a category.
      const group = spanning(15, { eventEmoji: "🎮" });

      expect(group.querySelector('[data-testid="event-title-e1"]')).toBeNull();
      expect(group.querySelector('[data-testid="event-emoji-e1"]')).not.toBeNull();
    });
  });

  describe("emoji placement", () => {
    // 15° spans, so each arc is under the title floor and the glyph renders standalone. A wider
    // arc would carry the emoji inline in its title instead, and there would be no glyph to place.
    const NARROW = 7.5;

    it.each([
      // Above the horizontal, the glyph already reads upright and is left alone.
      ["one-thirty", 45, 45],
      ["eleven o'clock", 330, 330],
      // Below it, an un-rotated glyph would be upside down, so it is turned a half-turn.
      ["four-thirty", 135, 315],
      // Angles are never normalised, so the lower half can exceed a full turn. Harmless —
      // SVG takes any rotation — but it is why these read 360 and 390 rather than 0 and 30.
      ["six o'clock", 180, 360],
      ["seven o'clock", 210, 390],
    ])("rotates the %s glyph upright", (_label, midAngle, expected) => {
      const group = render({
        startAngle: midAngle - NARROW,
        endAngle: midAngle + NARROW,
        eventEmoji: "🎮",
      });

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
        title: event.cleanTitle,
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
        title: cleanTitle,
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
        title: "Reading and Snacks",
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

    it("shows the emoji inline in a two-line title instead of stacking a standalone glyph", () => {
      // Retires the collision this used to guard: the emoji and a two-line title used to stack
      // radially and could overlap. Inlining the emoji into the title text (#23) means there is
      // no second element competing for room any more.
      const base = computeArcTitleLayout({
        title: "🎂 Reading and Snacks",
        arcSpan: 60,
        innerRadius: INNER,
        outerRadius: OUTER,
      });
      const twoLines = {
        ...base,
        fit: { lines: ["🎂 Reading and", "Snacks"], didOverflow: false },
      };

      const group = eventArc({
        event: makeEvent({ eventEmoji: "🎂" }),
        cx: CX,
        cy: CY,
        innerRadius: INNER,
        outerRadius: OUTER,
        layout: twoLines,
      });

      expect(group.querySelector('[data-testid="event-emoji-e1"]')).toBeNull();

      // Both lines stay inside the ring they belong to. This travelled with the collision test
      // that used to live here, and is worth keeping on its own: an inline emoji makes a title
      // wider, and radial containment is the property that would fail if lines were re-spaced.
      const baselines = [...group.querySelectorAll("defs path")].map((node) =>
        arcRadius(node.getAttribute("d") ?? "")
      );
      const half = twoLines.titleFontSize / 2;

      expect(Math.min(...baselines) - half).toBeGreaterThanOrEqual(INNER);
      expect(Math.max(...baselines) + half).toBeLessThanOrEqual(OUTER);
    });

    it("uses the layout it is given rather than recomputing one", () => {
      const layout = computeArcTitleLayout({
        title: "Team Meeting",
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

/**
 * #26: an event that has finished is drawn hollow — a coloured outline over an empty interior —
 * so a viewer can tell what is spent from what is coming without decoding the hands.
 */
describe("eventArc once the event has ended", () => {
  const ARC_HEIGHT = OUTER - INNER;

  function parts(overrides: Partial<ClockEvent> = {}, isElapsed = true) {
    const group = eventArc({
      event: makeEvent(overrides),
      cx: CX,
      cy: CY,
      innerRadius: INNER,
      outerRadius: OUTER,
      isElapsed,
    });
    const at = (part: string) => group.querySelector(`[data-arc-part="${part}"]`);
    return { group, fill: at("fill"), separator: at("separator"), outline: at("outline") };
  }

  it("empties the fill rather than removing the path", () => {
    // The path stays so that every arc has the same shape whatever its state — and so a drain
    // mask (#28) always has something to target.
    const { fill } = parts();

    expect(fill).not.toBeNull();
    expect(fill?.getAttribute("fill-opacity")).toBe("0");
    expect(fill?.getAttribute("fill")).toBe("#22c55e");
  });

  it("keeps the fill while the event is still to come", () => {
    expect(parts({}, false).fill?.getAttribute("fill-opacity")).toBe("0.85");
  });

  it("outlines in the event colour, so identity survives losing the fill", () => {
    const { outline } = parts();

    expect(outline?.getAttribute("stroke")).toBe("#22c55e");
    expect(outline?.getAttribute("fill")).toBe("none");
  });

  it("draws no outline layer while the event is still to come", () => {
    expect(parts({}, false).outline).toBeNull();
  });

  it.each([
    ["⚫ gray-800, which measures 1.21:1 on the dial", "#1F2937"],
    ["🟤 amber-800, which measures 2.50:1", "#92400E"],
    ["🟡 yellow, which needs no help", "#EAB308"],
  ])("backs %s with a neutral band, so the shape reads whatever the colour", (_label, color) => {
    // Outlined, the event's colour is the foreground against a ground it did not choose, and two
    // of the palette's nine fail there. The neutral band is not decoration (#27).
    const { separator, outline } = parts({ color });

    expect(separator?.getAttribute("stroke")).toBe("var(--border)");
    expect(Number(separator?.getAttribute("stroke-width"))).toBeGreaterThan(
      Number(outline?.getAttribute("stroke-width"))
    );
  });

  it("weights the outline well above the separator hairline it replaces", () => {
    // With no fill behind it, a hairline is all that stands between the event and not being drawn.
    const elapsed = Number(parts().outline?.getAttribute("stroke-width"));
    const live = Number(parts({}, false).separator?.getAttribute("stroke-width"));

    expect(elapsed).toBeGreaterThan(live * 2);
    expect(elapsed).toBeCloseTo(ARC_HEIGHT * 0.07, 4);
  });

  it("keeps its outline weight when stacking thins the ring", () => {
    // Found by rendering, not by testing: sizing the outline from the *ring* gave a three-deep
    // cluster a 1.56-unit outline against a 2.28-unit live separator — the arcs with the least
    // room got the faintest outline, which is backwards. The band does not change with depth.
    const BAND = 75.92;
    const ring = (thickness: number) =>
      eventArc({
        event: makeEvent(),
        cx: CX,
        cy: CY,
        innerRadius: OUTER - thickness,
        outerRadius: OUTER,
        isElapsed: true,
        bandThickness: BAND,
      }).querySelector('[data-arc-part="outline"]');

    const full = Number(ring(BAND)?.getAttribute("stroke-width"));
    const stacked = Number(ring(22.27)?.getAttribute("stroke-width"));

    expect(stacked).toBe(full);
    expect(full).toBeCloseTo(BAND * 0.07, 4);
  });

  it("caps the stroke on a ring too thin to stay hollow underneath it", () => {
    // A stroke straddles its path, so one wider than the ring closes the interior back up and the
    // arc reads as filled again.
    const THIN = 6;
    const outline = eventArc({
      event: makeEvent(),
      cx: CX,
      cy: CY,
      innerRadius: OUTER - THIN,
      outerRadius: OUTER,
      isElapsed: true,
      bandThickness: 200,
    }).querySelector('[data-arc-part="outline"]');

    expect(Number(outline?.getAttribute("stroke-width"))).toBeCloseTo(THIN * 0.4, 4);
  });

  it("falls back to its own ring when rendered without a band", () => {
    expect(Number(parts().outline?.getAttribute("stroke-width"))).toBeCloseTo(ARC_HEIGHT * 0.07, 4);
  });

  it("switches the title to the theme's own pairing, not the event colour", () => {
    // The text now sits on the dial background; `--card-foreground` is 16:1 on `--card` by
    // construction, and the event colour would reintroduce exactly the failures above.
    const title = parts().group.querySelector('[data-testid="event-title-e1"] text');

    expect(title?.getAttribute("fill")).toBe("var(--card-foreground)");
  });

  it("still contrasts against the fill while the event is live", () => {
    const title = parts({ color: "#EAB308" }, false).group.querySelector(
      '[data-testid="event-title-e1"] text'
    );

    expect(title?.getAttribute("fill")).toBe("#000000");
  });

  it("fades every layer when the period also clipped the arc", () => {
    // A clamped elapsed arc has to fade whole — an outline surviving a fade would cap the boundary
    // with exactly the crisp edge #22 removed.
    const { fill, separator, outline } = parts({ continuesAfter: true });

    for (const layer of [fill, separator, outline]) {
      expect(layer?.getAttribute("mask")).toBe("url(#arc-fade-e1)");
    }
  });
});
