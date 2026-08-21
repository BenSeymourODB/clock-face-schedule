import { describe, expect, it } from "vitest";
import {
  FEATHER_DEGREES,
  INK_HEIGHT_RATIO,
  TITLE_EDGE_CLEARANCE,
  TITLE_FONT_SIZE_RATIO,
  TITLE_LINE_OFFSET_RATIO,
  type ClockEvent,
  adjustForContrast,
  arcCharBudget,
  compositeOver,
  computeArcTitleLayout,
  contrastRatio,
  polarToCartesian,
} from "../../shared/clock";
import { ARC_BAND_RATIO, RING_GAP_MIN, RING_GAP_RATIO } from "./analog-clock";
import { BAND_BACKGROUND, arcEdgeStrokeWidth, arcFillColor, eventArc } from "./event-arc";

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

    describe("a fill a viewer can read the extent of (#66)", () => {
      /** What the fill is once `fill-opacity` has mixed the band back into it — what is on screen. */
      const painted = (color: string) =>
        contrastRatio(
          compositeOver(
            BAND_BACKGROUND,
            render({ color }).querySelector('[data-testid="event-arc-e1"]')!.getAttribute("fill")!,
            0.85
          )!,
          BAND_BACKGROUND
        )!;

      it.each([
        ["⚫ gray-800", "#1F2937", 1.25, "#666d77"],
        ["🟤 amber-800", "#92400E", 2.28, "#a25b30"],
      ])(
        "raises %s, whose body painted at %f:1 and could not be told from the band",
        (_label, color, before, expected) => {
          // The defect: an event's *extent* is read off where its body starts and stops, and for
          // these two there was no body to read. What revealed a ⚫ arc was incidental — the title
          // on it, and a separator only 1.15:1 against it. Pinning the hex as well as the ratio,
          // because the floor's whole justification is that this particular value keeps the title
          // white; a future floor that clears 3:1 by a different route would need re-deriving.
          expect(contrastRatio(compositeOver(BAND_BACKGROUND, color, 0.85)!, BAND_BACKGROUND)).
            toBeCloseTo(before, 2);

          const fill = render({ color }).querySelector('[data-testid="event-arc-e1"]');
          expect(fill?.getAttribute("fill")).toBe(expected);
          expect(painted(color)).toBeGreaterThanOrEqual(3);
        }
      );

      it.each([
        ["🟢 green-500", "#22C55E"],
        ["🔴 red-500", "#EF4444"],
        ["🟣 purple-500", "#A855F7"],
        ["⚪ gray-100", "#F3F4F6"],
        ["a calendar's own hex", "#5484ed"],
      ])("paints %s exactly as authored, having nothing to fix", (_label, color) => {
        // The floor is a floor and not a restyle: seven of the nine colour-dots, all eleven of
        // Google's, and the default already clear 3:1 and must come through byte-identical.
        expect(painted(color)).toBeGreaterThanOrEqual(3);
        expect(
          render({ color }).querySelector('[data-testid="event-arc-e1"]')?.getAttribute("fill")
        ).toBe(color);
      });

      it("keeps the separator meaningful against the fill it borders", () => {
        // `var(--card)` measures 1.15:1 on an authored ⚫ fill, so on the fixture ⚫ Staff Debrief
        // read as a dark *gap* beside 🟤 ⚽ rather than as a block. #74's plan records why the
        // obvious fix — a boundary stroke resolved against the band — is worse than the defect: it
        // gives a live arc the exact colour an elapsed one's outline takes. Flooring the fill needs
        // no such trade, and this is the number that says so.
        const fill = render({ color: "#1F2937" })
          .querySelector('[data-testid="event-arc-e1"]')!
          .getAttribute("fill")!;
        const painted = compositeOver(BAND_BACKGROUND, fill, 0.85)!;

        expect(contrastRatio("#16181d", painted)).toBeGreaterThan(2.5);
      });

      it("leaves the elapsed outline reading the authored colour, not the floored one", () => {
        // The two are one 8-bit step apart (⚫ `#747b83` against `#747b84`, measured against
        // `BAND_BACKGROUND`, which is the ground #74 moved that call to), so the elapsed state does
        // not notice this change — and the outline is #27/#74's to move, not this one's.
        //
        // Pinned as a literal rather than as `adjustForContrast(color, BAND_BACKGROUND, 4.5)`,
        // which is the same call with the same arguments the renderer makes: that would agree with
        // any ground or floor the renderer drifted to, which is the failure mode #74 was.
        const color = "#1F2937";
        const group = eventArc({
          event: makeEvent({ color }),
          cx: CX,
          cy: CY,
          innerRadius: INNER,
          outerRadius: OUTER,
          isElapsed: true,
        });

        const stroke = group
          .querySelector('[data-testid="event-arc-outline-e1"]')
          ?.getAttribute("stroke");

        expect(stroke).toBe("#747b83");
        expect(stroke).not.toBe(adjustForContrast(arcFillColor(color), BAND_BACKGROUND, 4.5));
      });
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
      // Past a revolution, which the 1-hour scale reaches on every window that wraps and the
      // 12-hour dial reaches most evenings (#25, #34). The decision is about a *direction*, so it
      // has to answer the same as its unwrapped twin two rows up — left raw it says "top half"
      // and the glyph renders very nearly upside down.
      ["seven o'clock past the wrap", 570, 390],
      ["one-thirty past the wrap", 405, 45],
      ["four-thirty two revolutions on", 855, 315],
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

      const offset = layout.titleFontSize * TITLE_LINE_OFFSET_RATIO;
      expect(radii).toEqual([layout.titleRadius + offset, layout.titleRadius - offset]);
    });

    /**
     * Which radius carries line one flips with the half of the dial — further out is higher at the
     * top and lower at the bottom — and getting it wrong is how lower-half titles came to read
     * bottom-up once before. The test that missed it asserted only the top-half case, so a
     * wrapped arc, whose mid-angle is past 360°, was read as top-half and stacked upside down.
     */
    it.each([
      ["the bottom half", 150, 210],
      ["the bottom half past the wrap", 510, 570],
    ])("puts the first line above the second on %s", (_label, startAngle, endAngle) => {
      const cleanTitle = "Parent Teacher Conference Planning Session Extra Words Here To Wrap";
      const layout = computeArcTitleLayout({
        title: cleanTitle,
        arcSpan: endAngle - startAngle,
        innerRadius: INNER,
        outerRadius: OUTER,
      });
      expect(layout.fit.lines).toHaveLength(2);

      const radii = [
        ...render({ cleanTitle, startAngle, endAngle }).querySelectorAll("defs path"),
      ].map((node) => arcRadius(node.getAttribute("d") ?? ""));

      // Below the horizontal the smaller radius is the higher line on screen.
      expect(radii[0]).toBeLessThan(radii[1]);
    });

    /**
     * #78. The pair above was asserted for years while the two lines' ink overlapped by 1.96 units,
     * because every assertion on them compared radii to the same ratio that produced them. This one
     * compares the gap the renderer emits against what the glyphs actually cover, so a ratio chosen
     * against the em box fails here rather than passing quietly and smudging on the wall.
     */
    it("puts the two lines far enough apart that their ink does not overlap", () => {
      const cleanTitle = "Parent Teacher Conference Planning Session Extra Words Here To Wrap";
      const radii = [...render({ cleanTitle }).querySelectorAll("defs path")].map((node) =>
        arcRadius(node.getAttribute("d") ?? "")
      );
      expect(radii).toHaveLength(2);

      const fontSize = Number(
        render({ cleanTitle }).querySelector("text")?.getAttribute("font-size")
      );
      const baselineGap = Math.abs(radii[0] - radii[1]);

      expect(baselineGap).toBeGreaterThan(fontSize * INK_HEIGHT_RATIO);
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
        const offset = layout.titleFontSize * TITLE_LINE_OFFSET_RATIO;
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

      // The title is fitted at the band's centre and this line displaces it outward at the top of
      // the dial and *inward* at the bottom, onto a smaller budget. Both halves have to agree, or
      // the same event would carry a duration in the morning and lose it in the afternoon.
      it.each([
        ["top half", 30, 75],
        ["bottom half", 150, 195],
      ])("reaches the same decision on the %s", (_label, startAngle, endAngle) => {
        const group = render({ cleanTitle: "Assembly", startAngle, endAngle });

        expect(durationOf(group)?.querySelector("textPath")?.textContent).toBe("1 hr 30");
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

      // A three-deep ring: 22.27 units of the 75.92 band, so its title renders at 6.24 units against
      // the 17.52 the dial uses for text a room has to read. Found by rendering the fixture at
      // 04:15, where "🎮 Game Time / 1 hr 30" was both a smear *and* sitting on the elapsed outline
      // of its own arc — `fitDurationLine` gates on both, and the depth-by-depth numbers are
      // asserted there.
      it("is absent on a ring sharing the band with an overlapping event", () => {
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
  /**
   * How far every wedge reaches past the arc's own edges: the width of whichever stroke the arc
   * draws widest.
   *
   * Derived from `arcEdgeStrokeWidth` rather than written as a number, because the number is what
   * went wrong (#114) — the outline is 3.36 units in this geometry against the separator's 1.44, and
   * a pad of `SEPARATOR` let it out while this spec called that correct.
   */
  const WEDGE_PAD = Math.max(SEPARATOR, arcEdgeStrokeWidth(OUTER - INNER, OUTER - INNER));

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

  it("covers the widest stroke, which would otherwise cap the boundary with a crisp line", () => {
    const [wedge] = fade({ startAngle: 0, endAngle: 60, continuesBefore: true }).wedges;
    const d = wedge.getAttribute("d") ?? "";
    // `matchAll` would be tidier, but the target is ES2019.
    const radii = d.split("A ").slice(1).map(parseFloat);

    // A stroke straddles the path by half its width in every direction — radially…
    expect(radii).toEqual([OUTER + WEDGE_PAD, INNER - WEDGE_PAD]);
    // …and angularly, past the boundary, where a bare wedge would leave a hairline behind.
    const padDegrees = (WEDGE_PAD / OUTER) * (180 / Math.PI);
    expect(wedgeSpan(d)).toBeCloseTo(FEATHER_DEGREES + padDegrees, 3);
  });

  it("sizes the mask region to the wedges it holds, so nothing is clipped near a cardinal", () => {
    // The region is a square box, so its inscribed circle is what a wedge near 0/90/180/270° has to
    // fit inside. Left at the separator's pad while the wedges grew, it would clip the *legitimate*
    // elapsed outline exactly where the old bug's hairline happened to be hidden (#114).
    const { mask } = fade({ continuesBefore: true });
    const at = (name: string) => Number(mask?.getAttribute(name));

    expect(at("width")).toBeCloseTo((OUTER + WEDGE_PAD) * 2, 4);
    expect(at("height")).toBeCloseTo((OUTER + WEDGE_PAD) * 2, 4);
    expect(at("x")).toBeCloseTo(CX - OUTER - WEDGE_PAD, 4);
    expect(at("y")).toBeCloseTo(CY - OUTER - WEDGE_PAD, 4);
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

    // Green clears the floor, so the contrast pass returns it untouched and the outline is the
    // event's own colour.
    expect(outline?.getAttribute("stroke")).toBe("#22c55e");
    expect(outline?.getAttribute("fill")).toBe("none");
  });

  it("makes the outline colour contrast-safe against the band, not the raw event colour (#27)", () => {
    // ⚫ gray-800 is invisible on the band as a raw outline (1.32:1). The renderer must hand the
    // colour through adjustForContrast against the band's ground — the specific defect #26 left
    // and this issue closes. Whether the *result* clears the floor is proven in contrast.test.ts.
    const color = "#1F2937";
    const { outline } = parts({ color });

    expect(outline?.getAttribute("stroke")).toBe(adjustForContrast(color, BAND_BACKGROUND, 4.5));
    expect(outline?.getAttribute("stroke")).not.toBe(color);
  });

  it("measures against the ground the band has, not the one the face has (#74)", () => {
    // The premise, not the assertion, was what was wrong before: this spec kept its own copy of
    // `#16181d` and asserted the outline cleared 4.5:1 against it — true, and against a ground the
    // band never sits on. Pinning the constant is what stops that drifting back; the geometric half
    // of the claim — that no arc is drawn inside the face circle — is asserted in analog-clock.test.
    expect(BAND_BACKGROUND).toBe("#0c0e12");
    expect(BAND_BACKGROUND).not.toBe("#16181d");
  });

  it("leaves a colour that already clears the floor on the band exactly as authored", () => {
    // 🟣 purple-500 is the case the correction freed: 4.49:1 against the face's ground, so it was
    // nudged to `#a856f7`, but 4.88:1 against the band's, so it needs no adjustment at all. The
    // whole point of #27's minimal blend is that a passing colour is returned untouched.
    const color = "#A855F7";

    expect(parts({ color }).outline?.getAttribute("stroke")).toBe(color);
  });

  it("draws no outline layer while the event is still to come", () => {
    expect(parts({}, false).outline).toBeNull();
  });

  it.each([
    ["⚫ gray-800, which measures 1.32:1 on the band", "#1F2937"],
    ["🟤 amber-800, which measures 2.72:1", "#92400E"],
    ["🟡 yellow, which needs no help", "#EAB308"],
  ])("carries %s at a contrast-safe weight, with no neutral band beneath", (_label, color) => {
    // #26 backed the outline with a `var(--border)` band because the event's colour could not be
    // trusted to contrast. #27 fixes the colour itself, so the outline stands alone — and must,
    // since nothing else now draws the arc's shape.
    const { halo, outline } = parts({ color });

    expect(halo).toBeNull();
    expect(contrastRatio(outline!.getAttribute("stroke")!, BAND_BACKGROUND)).toBeGreaterThanOrEqual(
      4.5
    );
  });

  it("weights the outline well above the separator hairline it replaces", () => {
    // With no fill and no neutral band behind it, a hairline is all that stands between the event
    // and not being drawn.
    const elapsed = Number(parts().outline?.getAttribute("stroke-width"));
    const live = Number(parts({}, false).separator?.getAttribute("stroke-width"));

    expect(elapsed).toBeGreaterThan(live * 2);
    expect(elapsed).toBeCloseTo(ARC_HEIGHT * 0.07, 4);
  });

  it("stays uniform at every depth the band can carry, so no ratio widening breaks it", () => {
    // Guards the reason ELAPSED_BORDER_RATIO did not grow into the retired halo's width: at 0.12
    // the ring cap clamps a three- and four-deep outline, handing the most crowded arcs the
    // thinnest mark — the inversion #26 fixed. Recomputed here rather than asserted as a constant.
    const BAND = 75.92;
    const gap = Math.max(2, BAND * 0.06);
    const widths = [1, 2, 3, 4].map((depth) => {
      const thickness = (BAND - (depth > 1 ? (depth - 1) * gap : 0)) / depth;
      return Number(
        eventArc({
          event: makeEvent(),
          cx: CX,
          cy: CY,
          innerRadius: OUTER - thickness,
          outerRadius: OUTER,
          isElapsed: true,
          bandThickness: BAND,
        })
          .querySelector('[data-arc-part="outline"]')
          ?.getAttribute("stroke-width")
      );
    });

    expect(new Set(widths).size).toBe(1);
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
    // The text now sits on the band's own ground; `--card-foreground` is 17.5:1 on `--page` (and
    // 16:1 on `--card`, which is what it was authored against), and the event colour would
    // reintroduce exactly the failures above.
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
    const { fill, outline } = parts({ continuesAfter: true });

    for (const layer of [fill, outline]) {
      expect(layer?.getAttribute("mask")).toBe("url(#arc-fade-e1)");
    }
  });

  it("draws no separator once the event is fully elapsed", () => {
    // The live band and the elapsed outline mean two different things; showing both at once on a
    // fully-spent arc would say "still live" and "already over" in the same breath.
    expect(parts().separator).toBeNull();
  });
});

/**
 * #67: the outline is sized from the whole band, deliberately, so its weight does not thin with
 * overlap depth (#26) — while the text is sized from this arc's own ring, equally deliberately. Both
 * rules are right and on a thin ring they disagree, so the two have to be compared somewhere.
 *
 * Asserted on rendered attributes rather than on the layout, because that is where the two meet: the
 * `d` of each baseline against the `stroke-width` the outline actually carries. A test computing
 * both from the same constants would encode the assumption that put the text on the stroke.
 */
describe("eventArc's title against what is stroked on its ring", () => {
  const BAND = OUTER * ARC_BAND_RATIO;
  const RING_GAP = Math.max(RING_GAP_MIN, BAND * RING_GAP_RATIO);

  /** The outermost ring of a `depth`-deep cluster, as the dial divides the band. */
  function ring(depth: number) {
    const gap = depth > 1 ? RING_GAP : 0;
    const thickness = (BAND - (depth - 1) * gap) / depth;
    return { innerRadius: OUTER - thickness, outerRadius: OUTER, bandThickness: BAND };
  }

  /**
   * A title that wraps onto two lines on this ring *and* fits — two words that each fit a line alone
   * and cannot share one.
   *
   * Derived from the ring's own budget rather than written out, because a fixed string is a two-line
   * fit on a thin ring and a truncated one-liner on a thick one. That distinction matters here: an
   * overflowing title is routed to a floating label with `forceHideTitle`, so a truncated case would
   * be asserting clearance on a configuration the dial never renders.
   */
  function wrappingTitle(depth: number, arcSpan: number) {
    const shape = ring(depth);
    const probe = computeArcTitleLayout({ ...shape, title: "x", arcSpan });
    const budget = arcCharBudget(arcSpan, probe.titleRadius, probe.titleFontSize);
    const word = "a".repeat(Math.max(1, Math.floor(budget / 2) + 1));

    return `${word} ${word}`;
  }

  function measure(depth: number, cleanTitle: string, arcSpan = 30) {
    const shape = ring(depth);
    const group = eventArc({
      event: makeEvent({ cleanTitle, startAngle: 0, endAngle: arcSpan }),
      cx: CX,
      cy: CY,
      isElapsed: true,
      ...shape,
    });

    const radii = [...group.querySelectorAll("defs > path")].map((node) =>
      arcRadius(node.getAttribute("d") ?? "")
    );
    const fontSize = Number(
      group.querySelector('[data-testid="event-title-e1"] text')?.getAttribute("font-size")
    );
    const strokeWidth = Number(
      group.querySelector('[data-arc-part="outline"]')?.getAttribute("stroke-width")
    );

    // A stroke straddles its path, so it reaches half its width back into the ring from each edge.
    return {
      radii,
      fontSize,
      strokeWidth,
      outward: shape.outerRadius - strokeWidth / 2 - (Math.max(...radii) + fontSize / 2),
      inward: Math.min(...radii) - fontSize / 2 - (shape.innerRadius + strokeWidth / 2),
    };
  }

  it.each([[1], [2], [3], [4]])("clears both edges %i deep, on two lines", (depth) => {
    const { radii, outward, inward } = measure(depth, wrappingTitle(depth, 30));

    expect(radii).toHaveLength(2);
    expect(outward).toBeGreaterThanOrEqual(TITLE_EDGE_CLEARANCE);
    expect(inward).toBeGreaterThanOrEqual(TITLE_EDGE_CLEARANCE);
  });

  it.each([[2], [3], [4]])("clears both edges %i deep, on one line", (depth) => {
    const { radii, outward, inward } = measure(depth, "Lunch");

    expect(radii).toHaveLength(1);
    expect(outward).toBeGreaterThanOrEqual(TITLE_EDGE_CLEARANCE);
    expect(inward).toBeGreaterThanOrEqual(TITLE_EDGE_CLEARANCE);
  });

  it("clears both edges when #35's duration line makes the second line", () => {
    // A lone arc's one-line title gains a duration line beneath it, so the stack is two lines the
    // font size was not held to. `fitDurationLine` applies the same clearance to the same font and
    // declines where the pair would not fit, which is what keeps this in bounds — depth 1 is the only
    // depth it survives, since its own legibility gate wants the whole band.
    const { radii, outward, inward } = measure(1, "Lunch");

    expect(radii).toHaveLength(2);
    expect(outward).toBeGreaterThanOrEqual(TITLE_EDGE_CLEARANCE);
    expect(inward).toBeGreaterThanOrEqual(TITLE_EDGE_CLEARANCE);
  });

  it("is the four-deep ring that binds, and it yields only the text", () => {
    // Where the fix shows: four deep the stack wanted 4.58 units of half-height in the 4.12 the
    // outline leaves, so the font gives up 10%. The outline is untouched — it *is* the arc once the
    // fill is gone, and capping it by the ring is the inversion #26's band-sizing exists to prevent.
    const stacked = measure(4, wrappingTitle(4, 30));
    const three = measure(3, wrappingTitle(3, 30));

    expect(stacked.fontSize).toBeLessThan((ring(4).outerRadius - ring(4).innerRadius) * TITLE_FONT_SIZE_RATIO);
    expect(stacked.strokeWidth).toBe(measure(1, "Lunch").strokeWidth);
    expect(three.fontSize).toBeCloseTo(
      (ring(3).outerRadius - ring(3).innerRadius) * TITLE_FONT_SIZE_RATIO,
      2
    );
  });

  it("leaves a one-line title on the same ring at full size", () => {
    // The room a line that is not drawn does not get to take: charging two-line reach to every arc
    // wider than the two-line span threshold cost this title 10% of its size for nothing, on the ring
    // that can least afford it (#70).
    const arcHeight = ring(4).outerRadius - ring(4).innerRadius;

    expect(measure(4, "Lunch").fontSize).toBeCloseTo(arcHeight * TITLE_FONT_SIZE_RATIO, 2);
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

  it("draws both border layers at once: the live separator and the spent outline", () => {
    const group = draining();

    expect(at(group, "separator")).not.toBeNull();
    expect(at(group, "outline")).not.toBeNull();
    // The neutral band #26 drew beneath the outline is gone (#27) — nothing should reintroduce it.
    expect(at(group, "halo")).toBeNull();
  });

  it("masks the fill and the live separator with the fade toward what's left", () => {
    const group = draining();

    expect(at(group, "fill")?.getAttribute("mask")).toBe("url(#arc-fade-e1)");
    expect(at(group, "separator")?.getAttribute("mask")).toBe("url(#arc-fade-e1)");
  });

  it("masks the outline with a distinct fade toward what's spent", () => {
    // Fill fades in one direction, the elapsed treatment in the other — one mask cannot hold both
    // gradients pointed opposite ways from the same boundary.
    const group = draining();

    expect(at(group, "outline")?.getAttribute("mask")).toBe("url(#arc-drain-e1)");
  });

  it("does not drain an event that has not started yet", () => {
    const group = draining({}, -5);

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
    expect(at(group, "outline")?.hasAttribute("mask")).toBe(false);
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
    const at = (name: string) => Number(gradient?.getAttribute(name));
    // The ramp straddles the boundary, so its *centre* is the boundary — asserted here rather than
    // an endpoint, which sits half a ramp to one side of it.
    const centre = { x: (at("x1") + at("x2")) / 2, y: (at("y1") + at("y2")) / 2 };
    const centreAngle = ((Math.atan2(centre.y - CY, centre.x - CX) * 180) / Math.PI + 450) % 360;
    const expected = polarToCartesian(CX, CY, midRadius, 10);

    // Exactly on the boundary's own radial line, and within the sagitta of the arc point: the axis
    // is a chord, so its midpoint sits ~0.28 units inside the arc at this radius.
    expect(centreAngle).toBeCloseTo(10, 4);
    expect(Math.hypot(centre.x - expected.x, centre.y - expected.y)).toBeLessThan(0.4);
  });

  /**
   * #71: every assertion above passes on a mask that drains nothing, because they check *which*
   * mask each part references and never what the mask does. A white ground plus one gradient wedge
   * left 65–83% of the spent side at full fill; these pin the occluding region that fixes it.
   */
  describe("what the masks actually hide", () => {
    // The widest stroke the arc draws, as an angle at the outer radius: how far every wedge reaches
    // past its far edge to swallow the stroke straddling the path there. The separator's 1.44 was
    // the literal here, and this arc also draws a 3.36-unit outline (#114).
    const WEDGE_PAD = arcEdgeStrokeWidth(OUTER - INNER, OUTER - INNER);
    const PAD_DEGREES = (WEDGE_PAD / OUTER) * (180 / Math.PI);

    /** Angle of a point, in the dial's 0°-at-twelve convention. */
    function angleOf(x: number, y: number): number {
      return (Math.atan2(y - CY, x - CX) * (180 / Math.PI) + 450) % 360;
    }

    /**
     * A mask wedge's angular edges — its `M` point and its outer-arc endpoint — its span, its radii
     * and its `largeArcFlag`.
     *
     * The flag is parsed on purpose: wrong, a wedge covers the *complement* of the side it was meant
     * to and hides the wrong half of the arc outright, while its two endpoint angles look identical
     * either way. Same for the radii — an occlusion drawn off the ring hides nothing at all.
     */
    function wedgeEdges(path: Element | null): {
      from: number;
      to: number;
      span: number;
      largeArc: number;
      radii: number[];
    } {
      const d = path?.getAttribute("d") ?? "";
      const [mx, my, , , , largeArc, , ax, ay] = d.split(/[ A]+/).slice(1).map(Number);
      const from = angleOf(mx, my);
      const to = angleOf(ax, ay);
      const radii = (d.match(/A ([\d.]+) /g) ?? []).map((chunk) => Number.parseFloat(chunk.slice(2)));

      return { from, to, span: (to - from + 360) % 360, largeArc, radii };
    }

    /** The padded radii every wedge is drawn at, so a mis-sized occlusion cannot pass. */
    const WEDGE_RADII = [OUTER + WEDGE_PAD, INNER - WEDGE_PAD];

    function occlusion(group: SVGGElement, maskId: string): Element | null {
      return group.querySelector(`mask#${maskId} [data-mask-part="occlusion"]`);
    }

    // now at 15° of a 0°–60° arc, so the spent side is 15° and the remaining 45°. The ramp is
    // min(FEATHER_DEGREES, 15 × 0.35) = 5.25° wide and straddles the boundary, so each solid region
    // reaches to within half of that — 2.625° — of it.
    const HALF_RAMP = 2.625;

    it("hides the spent side of the fill outright, from the ramp back to the arc's start", () => {
      const wedge = occlusion(draining(), "arc-fade-e1");
      const { to, span, radii, largeArc } = wedgeEdges(wedge);

      // Opaque black on a luminance mask: gone, not merely dimmed.
      expect(wedge?.getAttribute("fill")).toBe("#000000");
      expect(to).toBeCloseTo(15 - HALF_RAMP, 4);
      expect(span).toBeCloseTo(15 - HALF_RAMP + PAD_DEGREES, 3);
      // Drawn across the whole ring plus the stroke, and the short way round.
      expect(radii).toEqual(WEDGE_RADII);
      expect(largeArc).toBe(0);
    });

    it("hides the remaining side from the outline, so nothing unhappened wears an elapsed edge", () => {
      const wedge = occlusion(draining(), "arc-drain-e1");
      const { from, span, radii, largeArc } = wedgeEdges(wedge);

      expect(wedge?.getAttribute("fill")).toBe("#000000");
      expect(from).toBeCloseTo(15 + HALF_RAMP, 4);
      expect(span).toBeCloseTo(45 - HALF_RAMP + PAD_DEGREES, 3);
      expect(radii).toEqual(WEDGE_RADII);
      expect(largeArc).toBe(0);
    });

    /**
     * #114: every wedge was padded by `separatorWidth`, which is sized from the *ring*, while the
     * widest stroke the arc draws — the elapsed outline — is sized from the *band*. The gap between
     * them widens with stacking depth, so the escaped hairline is worst where there is least room:
     * 1.66 units on a four-deep ring, wider than the whole 1.0-unit separator beside it. Outside a
     * wedge the mask ground is opaque white, so it painted at full strength on the side of the arc
     * that has not happened yet.
     *
     * Asserted against the outline's own *rendered* `stroke-width` rather than a recomputed pad,
     * because recomputing is how the assertions above came to encode the code's own wrong
     * assumption — and against a whole stack of depths, because at ring = band the two quantities
     * are close enough that the lone-arc case alone hides most of the error.
     *
     * The whole stroke width and not the half it straddles by: at exactly half, rendering the fixture
     * left one device pixel of the outline surviving at 6–26% alpha where the wedge's antialiased
     * edge coincides with the stroke's own. Half is what the arithmetic asks for and it is not what
     * the screen needs.
     */
    it.each([
      ["a lone arc", 75.92],
      ["a two-deep ring", 35.6824],
      ["a four-deep ring", 15.5636],
    ])("swallows the outline's whole stroke on %s, not just the separator's", (_label, thickness) => {
      const BAND = 75.92;
      // Float noise: the wedge radii are `radius ± pad` unrounded, so containment is asserted to
      // within a billionth of a unit rather than exactly. The defect being guarded is 0.38 units.
      const EPSILON = 1e-9;
      // The span is recovered from path endpoints `roundCoord` quantises to four places, which at
      // this radius is worth ~1e-5°. The defect being guarded is 0.0745° at this depth.
      const QUANTISATION_DEGREES = 1e-4;
      const innerRadius = OUTER - thickness;
      const group = eventArc({
        event: makeEvent({ startAngle: 0, endAngle: 60 }),
        cx: CX,
        cy: CY,
        innerRadius,
        outerRadius: OUTER,
        bandThickness: BAND,
        nowAngle: 15,
      });
      const outline = Number(
        group.querySelector('[data-arc-part="outline"]')?.getAttribute("stroke-width")
      );
      const { radii, span } = wedgeEdges(occlusion(group, "arc-drain-e1"));
      const region = Number(group.querySelector("mask#arc-drain-e1")?.getAttribute("width"));

      // Radially, at both rims: the escaped sliver traced the whole live arc on the inner one and
      // all but 2.9° of each cardinal on the outer.
      expect(radii[0]).toBeGreaterThanOrEqual(OUTER + outline - EPSILON);
      expect(radii[1]).toBeLessThanOrEqual(innerRadius - outline + EPSILON);
      // Angularly, so the stroke's radial cap at the arc's far end goes with it — the cap across the
      // band at the window's leading edge is the failure `buildFadeMask`'s docstring names.
      expect(span).toBeGreaterThanOrEqual(
        45 - HALF_RAMP + (outline / OUTER) * (180 / Math.PI) - QUANTISATION_DEGREES
      );
      // And the region has to reach as far as the wedges inside it: its inscribed circle is what a
      // wedge near a cardinal fits within, so a box left behind clips the outline instead.
      expect(region / 2).toBeGreaterThanOrEqual(OUTER + outline - EPSILON);
    });

    it.each([
      ["fill", "arc-fade-e1", "to", -1],
      ["outline", "arc-drain-e1", "from", 1],
    ] as const)(
      "stops the %s's solid region where its own ramp begins, leaving the seam to the ramp",
      (_label, maskId, rampEdge, direction) => {
        // A solid reaching the boundary would paint over the half of the ramp lying on its own side,
        // and the crisp edge the whole seam exists to deny would be back — half a ramp from `now`.
        // 4 places, not more: `roundCoord` quantises the wedge's own path coordinates.
        expect(wedgeEdges(occlusion(draining(), maskId))[rampEdge]).toBeCloseTo(
          15 + direction * HALF_RAMP,
          4
        );
      }
    );

    it("leaves the two solid regions exactly the ramp between them", () => {
      const group = draining();
      const fill = wedgeEdges(occlusion(group, "arc-fade-e1"));
      const outline = wedgeEdges(occlusion(group, "arc-drain-e1"));

      // No double-black across the seam, and no bare sliver either side of it.
      expect(outline.from - fill.to).toBeCloseTo(2 * HALF_RAMP, 3);
    });

    it("scales the hidden region with the boundary rather than fixing it at a ramp's depth", () => {
      // The old failure got worse the longer the event: a 10°-capped ramp on a 120° arc left 83%
      // of each side untouched. Occlusion has no cap — it is however much side there is, less the
      // half-ramp that side lends to the seam.
      const group = eventArc({
        event: makeEvent({ startAngle: 0, endAngle: 120 }),
        cx: CX,
        cy: CY,
        innerRadius: INNER,
        outerRadius: OUTER,
        nowAngle: 30,
      });
      const { span } = wedgeEdges(occlusion(group, "arc-fade-e1"));

      expect(span).toBeGreaterThan(FEATHER_DEGREES);
      expect(span).toBeCloseTo(30 - FEATHER_DEGREES / 2 + PAD_DEGREES, 3);
    });

    it("draws the long way round when the side it hides exceeds a half turn", () => {
      // Wrap-aware geometry never normalises past 360 (#33), so a 288°-remaining side is a real
      // case. With largeArcFlag wrong the wedge would hide the arc's *other* side entirely — and
      // every endpoint-angle assertion above would still pass.
      const group = eventArc({
        event: makeEvent({ startAngle: -20, endAngle: 300 }),
        cx: CX,
        cy: CY,
        innerRadius: INNER,
        outerRadius: OUTER,
        nowAngle: 12,
      });

      expect(wedgeEdges(occlusion(group, "arc-drain-e1")).largeArc).toBe(1);
      expect(wedgeEdges(occlusion(group, "arc-fade-e1")).largeArc).toBe(0);
    });

    it("keeps the window feather on the spent mask too, when the arc is clamped as well", () => {
      const group = eventArc({
        event: makeEvent({ startAngle: 0, endAngle: 60, continuesBefore: true }),
        cx: CX,
        cy: CY,
        innerRadius: INNER,
        outerRadius: OUTER,
        nowAngle: 15,
      });
      const mask = group.querySelector("mask#arc-drain-e1");

      // A clamped leading edge falls on the spent side, so it is the outline's mask that has to
      // carry it — the fade and the occlusion compose rather than one replacing the other.
      expect([...(mask?.querySelectorAll("linearGradient") ?? [])].map((n) => n.id)).toEqual([
        "arc-drain-e1-start",
        "arc-drain-e1-drain",
      ]);
      expect(mask?.querySelector('[data-mask-part="occlusion"]')).not.toBeNull();
    });
  });

  /**
   * Draining the fill for the first time changes what the title sits on. Black — which
   * `readableTextColor` picks for 🟠 🟡 🟢 ⚪ once composited over the dial — measures 1.18:1 on the
   * bare dial the drained side exposes, and white on those same fills measures 1.7–3.0:1, so no one
   * colour serves both grounds.
   */
  describe("the title across the seam", () => {
    function titles(color: string): { fill: string | null; mask: string | null }[] {
      const group = eventArc({
        event: makeEvent({ startAngle: 0, endAngle: 60, color }),
        cx: CX,
        cy: CY,
        innerRadius: INNER,
        outerRadius: OUTER,
        nowAngle: 15,
      });

      // The name's own line. #35 puts a duration line on the second baseline of a one-line title,
      // and it takes the same per-side treatment — covered separately below.
      return [...group.querySelectorAll('[data-testid="event-title-e1"] text')]
        .filter((node) => node.getAttribute("data-testid") === null)
        .map((node) => ({
          fill: node.getAttribute("fill"),
          mask: node.getAttribute("mask"),
        }));
    }

    it("draws one copy per side, each masked to the ground it is coloured for", () => {
      // ⚪ gray-100: the worst case, since its fill takes black text and the dial cannot.
      expect(titles("#F3F4F6")).toEqual([
        { fill: "#000000", mask: "url(#arc-title-live-e1)" },
        { fill: "var(--card-foreground)", mask: "url(#arc-title-spent-e1)" },
      ]);
    });

    it.each([
      ["arc-title-live-e1"],
      ["arc-title-spent-e1"],
    ])("hard-edges %s: a glyph in a ramp blends to mid-grey and drops out", (maskId) => {
      // Measured on the fixture at 1.4:1 against its own ground when both copies painted at partial
      // alpha — a letter missing from the middle of the title. The arc's own masks keep their ramp;
      // the text's carry the split alone.
      const group = eventArc({
        event: makeEvent({ startAngle: 0, endAngle: 60, continuesBefore: true }),
        cx: CX,
        cy: CY,
        innerRadius: INNER,
        outerRadius: OUTER,
        nowAngle: 15,
      });
      const mask = group.querySelector(`mask#${maskId}`);

      expect(mask?.querySelector('[data-mask-part="occlusion"]')).not.toBeNull();
      expect(mask?.querySelector('[data-mask-part="ramp"]')).toBeNull();
      // And no window feather either: a clamped title is deliberately left readable (#22), and
      // draining must not quietly reverse that.
      expect(mask?.querySelectorAll("linearGradient")).toHaveLength(0);
    });

    it.each([
      // Measured on the **floored** fill (#66) — the one painted. Flooring narrows these two
      // margins sharply (14.04 and 7.69 on the authored hex) without moving the winner: a lighter
      // fill gains for black and loses for the token, and at a 3:1 floor neither crosses.
      ["⚫ gray-800", "#1F2937", 5.85],
      ["🟤 amber-800", "#92400E", 5.83],
      // These two take a *black* title while live, derived from the authored hex — but measured on
      // the composited fill the light token beats it (4.43 against 4.31, 4.60 against 4.14), so they
      // need no split either, and the copy they get is the one they keep once elapsed.
      ["🔴 red-500", "#EF4444", 4.43],
      ["🟣 purple-500", "#A855F7", 4.6],
    ])(
      "leaves %s one unmasked copy, which reads on its fill (%f:1) and on the band alike",
      (_label, color, onFill) => {
        // Splitting a title that needs no split costs two nodes and invites a seam artefact for
        // nothing.
        expect(titles(color)).toEqual([{ fill: "var(--card-foreground)", mask: null }]);
        // And the claim in that sentence, measured rather than asserted — on `arcFillColor`, so
        // the ground measured here is the ground the renderer actually paints.
        const fill = compositeOver(BAND_BACKGROUND, arcFillColor(color), 0.85)!;
        expect(contrastRatio("#f2f4f8", fill)).toBeCloseTo(onFill, 1);
        expect(contrastRatio("#f2f4f8", fill)!).toBeGreaterThan(contrastRatio("#000000", fill)!);
      }
    );

    it.each([
      ["🟠 orange-500", "#F97316"],
      ["🟡 yellow-500", "#EAB308"],
      ["🟢 green-500", "#22C55E"],
      ["🔵 blue-500", "#3B82F6"],
      ["⚪ gray-100", "#F3F4F6"],
    ])("splits %s, whose fill genuinely reads better in black", (_label, color) => {
      expect(titles(color)).toEqual([
        { fill: "#000000", mask: "url(#arc-title-live-e1)" },
        { fill: "var(--card-foreground)", mask: "url(#arc-title-spent-e1)" },
      ]);
    });

    it("splits past the boundary, where the fill has actually arrived", () => {
      // At the boundary the ramp has delivered no fill yet, so text coloured for the fill measures
      // 1.18:1 there. The split belongs at `textFlipCoverage` along the ramp instead.
      const group = eventArc({
        event: makeEvent({ startAngle: 0, endAngle: 60, color: "#EAB308" }),
        cx: CX,
        cy: CY,
        innerRadius: INNER,
        outerRadius: OUTER,
        nowAngle: 15,
      });
      const d =
        group
          .querySelector('mask#arc-title-live-e1 [data-mask-part="occlusion"]')
          ?.getAttribute("d") ?? "";
      const [, , , , , , , ax, ay] = d.split(/[ A]+/).slice(1).map(Number);
      const splitAngle = (Math.atan2(ay - CY, ax - CX) * (180 / Math.PI) + 450) % 360;

      // 15° boundary; the ramp reaches 15° + min(FEATHER_DEGREES, 15 × 0.35).
      expect(splitAngle).toBeGreaterThan(15);
      expect(splitAngle).toBeLessThanOrEqual(15 + 15 * 0.35);
    });

    it("still draws a single unmasked copy of each line when the arc is not draining", () => {
      const group = render({ startAngle: 0, endAngle: 60, color: "#F3F4F6" });
      const nodes = [...group.querySelectorAll('[data-testid="event-title-e1"] text')];

      // The name and #35's duration line, once each — masks belong to the drain and nothing else.
      expect(nodes.map((node) => node.textContent)).toEqual(["Team Meeting", "2 hr"]);
      expect(nodes.every((node) => !node.hasAttribute("mask"))).toBe(true);
    });

    it("keeps both copies on one baseline path, so the seam recolours a letter rather than doubling it", () => {
      const group = eventArc({
        event: makeEvent({ startAngle: 0, endAngle: 60, color: "#F3F4F6" }),
        cx: CX,
        cy: CY,
        innerRadius: INNER,
        outerRadius: OUTER,
        nowAngle: 15,
      });
      const hrefs = [...group.querySelectorAll('[data-testid="event-title-e1"] text')]
        .filter((node) => node.getAttribute("data-testid") === null)
        .map((node) => node.querySelector("textPath")?.getAttribute("href"));

      expect(hrefs).toEqual(["#text-path-e1-0", "#text-path-e1-0"]);
    });

    it("splits #35's duration line the same way, onto its own baseline", () => {
      // The duration line sits on the same two grounds as the name above it, so it needs the same
      // two copies — and on the *second* baseline, not the first, or it would land on the title.
      const group = eventArc({
        event: makeEvent({ startAngle: 0, endAngle: 60, color: "#EAB308", durationMinutes: 120 }),
        cx: CX,
        cy: CY,
        innerRadius: INNER,
        outerRadius: OUTER,
        nowAngle: 15,
      });
      const duration = [...group.querySelectorAll('[data-testid="event-duration-e1"]')].map(
        (node) => ({
          fill: node.getAttribute("fill"),
          mask: node.getAttribute("mask"),
          weight: node.getAttribute("font-weight"),
          href: node.querySelector("textPath")?.getAttribute("href"),
        })
      );

      expect(duration).toEqual([
        { fill: "#000000", mask: "url(#arc-title-live-e1)", weight: "400", href: "#text-path-e1-1" },
        {
          fill: "var(--card-foreground)",
          mask: "url(#arc-title-spent-e1)",
          weight: "400",
          href: "#text-path-e1-1",
        },
      ]);
    });
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
