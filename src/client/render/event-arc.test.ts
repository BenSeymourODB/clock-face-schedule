import { describe, expect, it } from "vitest";
import {
  FEATHER_DEGREES,
  type ClockEvent,
  computeArcTitleLayout,
  polarToCartesian,
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
    // 0.5° per minute on a 12-hour dial, so an event's default duration is the one its span is
    // drawn at. A case about the two disagreeing overrides this.
    durationMinutes: (endAngle - startAngle) * 2,
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
    it("names the event and how long it lasts", () => {
      expect(render().getAttribute("aria-label")).toBe("Event: Team Meeting, 2 hr");
    });

    it("puts the emoji inline, ahead of the title", () => {
      expect(render({ eventEmoji: "🎮" }).getAttribute("aria-label")).toBe(
        "Event: 🎮 Team Meeting, 2 hr"
      );
    });

    // A listener has no angular extent to read duration off, so the spoken name is the only channel
    // they have — it is not subject to the radial and angular gates the drawn line is.
    it("speaks the duration even where the arc has no room to draw it", () => {
      const group = eventArc({
        event: makeEvent({ startAngle: 0, endAngle: 7.5, durationMinutes: 10 }),
        cx: CX,
        cy: CY,
        innerRadius: INNER,
        outerRadius: OUTER,
      });

      expect(group.querySelector('[data-testid="event-title-e1"]')).toBeNull();
      expect(group.getAttribute("aria-label")).toBe("Event: Team Meeting, 10 min");
    });

    it("names an event too short to state a duration for without a stray comma", () => {
      expect(render({ durationMinutes: 0 }).getAttribute("aria-label")).toBe(
        "Event: Team Meeting"
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

      // The default event is 60° and 120 minutes, so #35's duration line takes the second line the
      // one-line title left free. Spelled out rather than sliced off, because the arc renders one
      // list of lines and a test that only counted the title's would not notice the other going
      // missing.
      const expected = [...layout.fit.lines, "2 hr"];

      expect(group.querySelectorAll('[data-testid="event-title-e1"] text')).toHaveLength(
        expected.length
      );
      expect(group.querySelectorAll("defs path")).toHaveLength(expected.length);
      expect(
        [...group.querySelectorAll("textPath")].map((node) => node.textContent)
      ).toEqual(expected);
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

    /**
     * #35 gives duration a second channel, because angular extent is the only one carrying it and
     * `MIN_ARC_DEGREES` flattens everything under fifteen minutes into the same 7.5°.
     */
    describe("duration line", () => {
      const durationOf = (group: SVGGElement) =>
        group.querySelector('[data-testid="event-duration-e1"]');

      it("takes the second line a one-line title left free", () => {
        const group = render({ startAngle: 0, endAngle: 60, durationMinutes: 145 });

        expect(durationOf(group)?.querySelector("textPath")?.textContent).toBe("2 hr 25");
      });

      it("sits at the radius a two-line title's second line uses", () => {
        const layout = computeArcTitleLayout({
          title: "Team Meeting",
          arcSpan: 60,
          innerRadius: INNER,
          outerRadius: OUTER,
        });
        const offset = layout.titleFontSize * 0.55;
        const radii = [...render().querySelectorAll("defs path")].map((node) =>
          arcRadius(node.getAttribute("d") ?? "")
        );

        // Exactly the pair asserted for a two-line title above — no new radial arithmetic, so no
        // new collision surface. Two elements have overlapped on this band before (#23's emoji at
        // 8.7 units into a two-line title), and reusing verified geometry is what rules it out.
        expect(radii).toEqual([layout.titleRadius + offset, layout.titleRadius - offset]);
      });

      it("reads below the title on both halves of the dial", () => {
        // Further from the centre is higher at the top of the dial and lower at the bottom, so a
        // fixed order would put the duration above the name on one half — the bottom-up defect the
        // title's own flip exists to prevent.
        for (const [startAngle, endAngle, deeper] of [
          [30, 90, "min"],
          [150, 210, "max"],
        ] as const) {
          const group = render({ startAngle, endAngle });
          const radii = [...group.querySelectorAll("defs path")].map((node) =>
            arcRadius(node.getAttribute("d") ?? "")
          );

          expect(radii[1]).toBe(deeper === "min" ? Math.min(...radii) : Math.max(...radii));
        }
      });

      it("sits a weight below the title rather than a size below it", () => {
        // Shrinking it is the one de-emphasis that costs legibility, and opacity trades away
        // contrast — which #15 and #27 are both about not doing.
        const group = render();
        const [title, duration] = [
          ...group.querySelectorAll('[data-testid="event-title-e1"] text'),
        ];

        expect(duration.getAttribute("font-size")).toBe(title.getAttribute("font-size"));
        expect(title.getAttribute("font-weight")).toBe("500");
        expect(duration.getAttribute("font-weight")).toBe("400");
      });

      it("states the event's own length, not the extent the arc was drawn at", () => {
        // A ten-minute event is drawn at MIN_ARC_DEGREES' 7.5°, identically to a fifteen-minute
        // one. The text is the only thing that can tell them apart, so it must not be re-derived
        // from the angles.
        const group = render({ startAngle: 0, endAngle: 60, durationMinutes: 10 });

        expect(durationOf(group)?.querySelector("textPath")?.textContent).toBe("10 min");
      });

      it("is absent when the title already takes two lines", () => {
        // A three-line stack measures 34.01 units of a lone arc's 37.96 half-band and overruns
        // every stacked ring, so a wrapped title has spent the arc's text budget.
        const base = computeArcTitleLayout({
          title: "Parent Teacher Conference Planning Session Extra Words Here",
          arcSpan: 60,
          innerRadius: INNER,
          outerRadius: OUTER,
        });
        const group = eventArc({
          event: makeEvent({ startAngle: 0, endAngle: 60 }),
          cx: CX,
          cy: CY,
          innerRadius: INNER,
          outerRadius: OUTER,
          layout: { ...base, fit: { lines: ["Parent Teacher", "Conference"], didOverflow: false } },
        });

        expect(durationOf(group)).toBeNull();
        expect(group.querySelectorAll("defs path")).toHaveLength(2);
      });

      // The gate is the character budget at the line's own radius and nothing else — no span
      // threshold to guess. On the full 76-unit band a 20° arc's second line carries 6 units, so
      // "45 min" lands and "2 hr 25" does not, and there is deliberately no compact fallback: one
      // format across the whole dial, or nothing on this arc.
      it.each([
        [45, "45 min"],
        [145, undefined],
      ])("fits %i minutes onto a 20° arc as %s", (durationMinutes, expected) => {
        const group = eventArc({
          event: makeEvent({
            cleanTitle: "PE",
            startAngle: 0,
            endAngle: 20,
            durationMinutes,
          }),
          cx: CX,
          cy: CY,
          innerRadius: 216,
          outerRadius: 292,
        });

        expect(group.querySelector('[data-testid="event-title-e1"]')).not.toBeNull();
        expect(durationOf(group)?.querySelector("textPath")?.textContent).toBe(expected);
      });

      // Found by rendering the fixture at 04:15: "🎮 Game Time / 1 hr 30" sat on the elapsed
      // outline of its own arc. The outline is sized from the whole band so its weight does not
      // thin with overlap depth (#26); the text is sized from this arc's ring. Pushing a one-line
      // title onto the two-line radii closed the 3.46 units between them to 0.03.
      it("is absent on a ring too thin to clear its own outline", () => {
        const BAND = 75.92;
        const RING = 22.27;
        const group = eventArc({
          event: makeEvent({ startAngle: 0, endAngle: 45, durationMinutes: 90 }),
          cx: CX,
          cy: CY,
          innerRadius: 292 - RING,
          outerRadius: 292,
          bandThickness: BAND,
          isElapsed: true,
        });

        expect(durationOf(group)).toBeNull();
        // …and the title goes back to the centre it had before, rather than staying pushed out.
        const [radius] = [...group.querySelectorAll("defs path")].map((node) =>
          arcRadius(node.getAttribute("d") ?? "")
        );
        expect(radius).toBeCloseTo(292 - RING + RING * 0.5, 4);
      });

      it("is absent when the title is rendering as a floating label instead", () => {
        // The card carries the duration in that case; drawing it on the arc as well says the same
        // thing twice.
        const group = render({ startAngle: 0, endAngle: 60 }, true);

        expect(durationOf(group)).toBeNull();
      });

      it.each([[0], [0.2]])('is absent for a %s-minute event', (durationMinutes) => {
        expect(durationOf(render({ startAngle: 0, endAngle: 60, durationMinutes }))).toBeNull();
      });
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

  describe("radial centring (#56)", () => {
    // Containment alone (baseline ± half stays within INNER/OUTER) is satisfied by a lopsided
    // placement too — the 1.25-unit stacked-ring margin that motivated this fix passed exactly
    // that check. What distinguishes centred from merely-contained is that the two clearances,
    // inner-edge-to-INNER and OUTER-to-outer-edge, come out equal.
    function twoLineClearances(cleanTitle: string, innerRadius: number, outerRadius: number, arcSpan: number) {
      const layout = computeArcTitleLayout({ title: cleanTitle, arcSpan, innerRadius, outerRadius });
      expect(layout.fit.lines).toHaveLength(2);

      const group = eventArc({
        event: makeEvent({ cleanTitle, startAngle: 0, endAngle: arcSpan }),
        cx: CX,
        cy: CY,
        innerRadius,
        outerRadius,
      });
      const radii = [...group.querySelectorAll("defs path")].map((node) =>
        arcRadius(node.getAttribute("d") ?? "")
      );
      const half = layout.titleFontSize / 2;

      return {
        innerClearance: Math.min(...radii) - half - innerRadius,
        outerClearance: outerRadius - (Math.max(...radii) + half),
      };
    }

    it("splits clearance evenly for a two-line title on a full band", () => {
      const { innerClearance, outerClearance } = twoLineClearances(
        "Parent Teacher Conference Planning Session Extra Words Here To Wrap",
        INNER,
        OUTER,
        60
      );

      expect(innerClearance).toBeCloseTo(outerClearance, 3);
    });

    it("splits clearance evenly for a two-line title on a thin, stacked ring", () => {
      // Inner/outer radii of a 22.27-unit ring against a 292-unit outer edge — the exact
      // three-deep-stack proportions whose lopsided 1.25-unit margin motivated this fix. A thin
      // ring's smaller font actually buys *more* characters per line (the arc's chord budget
      // barely shrinks while the font does), so it takes a longer title than the full-band case
      // to force a wrap here at all.
      const { innerClearance, outerClearance } = twoLineClearances(
        "Parent Teacher Conference Planning Session Extra Words Here To Wrap And Then Quite A Bit More",
        269.74,
        292,
        60
      );

      expect(innerClearance).toBeCloseTo(outerClearance, 3);
    });

    it("centres a standalone emoji across the ring", () => {
      const group = spanning(15, { eventEmoji: "🎮" });
      const emoji = group.querySelector('[data-testid="event-emoji-e1"]');
      const x = Number(emoji?.getAttribute("x"));
      const y = Number(emoji?.getAttribute("y"));
      const radiusFromCentre = Math.hypot(x - CX, y - CY);

      expect(radiusFromCentre).toBeCloseTo(INNER + (OUTER - INNER) / 2, 3);
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

    // Two baselines: the title's, and the duration line's beneath it.
    expect(titlePaths).toHaveLength(2);
    expect(wedges).toHaveLength(1);
    expect(titlePaths.map((node) => node.getAttribute("id"))).toEqual([
      "text-path-e1-0",
      "text-path-e1-1",
    ]);
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
    return {
      group,
      fill: at("fill"),
      separator: at("separator"),
      halo: at("halo"),
      outline: at("outline"),
    };
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
    const { halo, outline } = parts({ color });

    expect(halo?.getAttribute("stroke")).toBe("var(--border)");
    expect(Number(halo?.getAttribute("stroke-width"))).toBeGreaterThan(
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
    const { fill, halo, outline } = parts({ continuesAfter: true });

    for (const layer of [fill, halo, outline]) {
      expect(layer?.getAttribute("mask")).toBe("url(#arc-fade-e1)");
    }
  });

  it("draws no separator once the event is fully elapsed", () => {
    // The live band and the elapsed halo mean two different things; showing both at once on a
    // fully-spent arc would say "still live" and "already over" in the same breath.
    expect(parts().separator).toBeNull();
  });
});

/**
 * #28: a still-running event splits at "now" rather than flipping straight from live to elapsed —
 * the spent portion reads like #26's hollow outline, the rest keeps its fill.
 */
describe("eventArc while the event is draining", () => {
  function at(group: SVGGElement, part: string) {
    return group.querySelector(`[data-arc-part="${part}"]`);
  }

  function draining(overrides: Partial<ClockEvent> = {}, nowAngle = 15): SVGGElement {
    return eventArc({
      event: makeEvent({ startAngle: 0, endAngle: 60, ...overrides }),
      cx: CX,
      cy: CY,
      innerRadius: INNER,
      outerRadius: OUTER,
      nowAngle,
    });
  }

  it("keeps the fill's own opacity at full strength — the mask does the draining", () => {
    expect(at(draining(), "fill")?.getAttribute("fill-opacity")).toBe("0.85");
  });

  it("draws all three border layers at once: the live separator, the spent halo and outline", () => {
    const group = draining();

    expect(at(group, "separator")).not.toBeNull();
    expect(at(group, "halo")).not.toBeNull();
    expect(at(group, "outline")).not.toBeNull();
  });

  it("masks the fill and the live separator with the fade toward what's left", () => {
    const group = draining();

    expect(at(group, "fill")?.getAttribute("mask")).toBe("url(#arc-fade-e1)");
    expect(at(group, "separator")?.getAttribute("mask")).toBe("url(#arc-fade-e1)");
  });

  it("masks the halo and outline with a distinct fade toward what's spent", () => {
    // Fill fades in one direction, the elapsed treatment in the other — one mask cannot hold both
    // gradients pointed opposite ways from the same boundary.
    const group = draining();

    expect(at(group, "halo")?.getAttribute("mask")).toBe("url(#arc-drain-e1)");
    expect(at(group, "outline")?.getAttribute("mask")).toBe("url(#arc-drain-e1)");
  });

  it("does not drain an event that has not started yet", () => {
    const group = draining({}, -5);

    expect(at(group, "halo")).toBeNull();
    expect(at(group, "outline")).toBeNull();
    expect(at(group, "fill")?.hasAttribute("mask")).toBe(false);
  });

  it("leaves isElapsed in sole charge once the event has fully finished", () => {
    // now sits inside [0, 60], which would otherwise read as draining — isElapsed must still win.
    const group = eventArc({
      event: makeEvent({ startAngle: 0, endAngle: 60 }),
      cx: CX,
      cy: CY,
      innerRadius: INNER,
      outerRadius: OUTER,
      isElapsed: true,
      nowAngle: 15,
    });

    expect(at(group, "fill")?.getAttribute("fill-opacity")).toBe("0");
    expect(at(group, "separator")).toBeNull();
    expect(at(group, "halo")?.hasAttribute("mask")).toBe(false);
  });

  it("places the boundary from the true angles, not the widened drawn ones", () => {
    // A short event widened past MIN_ARC_DEGREES draws wider than its true span. Halfway through
    // the true 0°–10° span must land at the drawn arc's own halfway point, 10° of 0°–20°, not at
    // true-angle 5°.
    const group = eventArc({
      event: makeEvent({ startAngle: 0, endAngle: 20, trueStartAngle: 0, trueEndAngle: 10 }),
      cx: CX,
      cy: CY,
      innerRadius: INNER,
      outerRadius: OUTER,
      nowAngle: 5,
    });

    const gradient = group.querySelector('mask#arc-fade-e1 linearGradient');
    const midRadius = (INNER + OUTER) / 2;
    const expected = polarToCartesian(CX, CY, midRadius, 10);

    expect(Number(gradient?.getAttribute("x1"))).toBeCloseTo(expected.x, 4);
    expect(Number(gradient?.getAttribute("y1"))).toBeCloseTo(expected.y, 4);
  });

  it("combines a window-edge feather with the drain fade on the fill's own mask", () => {
    const group = eventArc({
      event: makeEvent({ startAngle: 0, endAngle: 60, continuesAfter: true }),
      cx: CX,
      cy: CY,
      innerRadius: INNER,
      outerRadius: OUTER,
      nowAngle: 15,
    });

    const ids = [...group.querySelectorAll('mask#arc-fade-e1 linearGradient')].map((node) =>
      node.getAttribute("id")
    );
    expect(ids).toEqual(["arc-fade-e1-end", "arc-fade-e1-drain"]);
  });
});
