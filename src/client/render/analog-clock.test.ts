import { describe, expect, it } from "vitest";
import {
  type ClockEventInput,
  INK_HEIGHT_RATIO,
  ONE_HOUR_SCALE,
  TITLE_EDGE_CLEARANCE,
  TITLE_FONT_SIZE_RATIO,
  dialWindow,
  rectsOverlap,
} from "../../shared/clock";
import readme from "../../../README.md?raw";
import { oneHourSampleEvents, sampleEvents } from "../sample-events";
import { type AnalogClockParams, analogClock } from "./analog-clock";

const SIZE = 600;
const CX = SIZE / 2;
const CY = SIZE / 2;
const OUTER_RADIUS = SIZE / 2 - 8;
/** Mirrors the radial budget: band 26% of the radius, face gap 4%. */
const ARC_THICKNESS = OUTER_RADIUS * 0.26;
const CLOCK_RADIUS = OUTER_RADIUS - ARC_THICKNESS;
const FACE_GAP = OUTER_RADIUS * 0.04;
const RING_GAP = Math.max(2, ARC_THICKNESS * 0.06);
/** Rings the band can carry before they stop reading as arcs. */
const MAX_RINGS = Math.floor(
  (ARC_THICKNESS + RING_GAP) / (ARC_THICKNESS * 0.16 + RING_GAP)
);

/**
 * Four in the morning. The rolling window (#25) is `[time − 3h, time + 8h)`, so this puts the
 * window at [1:00, 12:00) — chosen so the existing fixture hours below (1 through 10-ish) fall
 * inside it unchanged, the same way they used to fall inside the old fixed midnight-to-noon
 * period.
 */
const MORNING = new Date(2026, 7, 15, 4, 0, 0);
const AFTERNOON = new Date(2026, 7, 15, 13, 0, 0);

const LONG_TITLE = "Parent Teacher Conference Planning Committee Meeting Notes";
/**
 * Long enough to overflow its arc, short enough that the card stays two or three lines — which is
 * what puts a pile of them inside the clamp band, where the displacement pass can actually separate
 * them. It was two before #118's swatch took a character off every line.
 */
const PILE_TITLE = "Staff Debrief and Planning";

function input(
  id: string,
  startHour: number,
  endHour: number,
  overrides: Partial<ClockEventInput> = {}
): ClockEventInput {
  // Via total minutes, not `Math.floor(hour)` + `(hour % 1) * 60` separately — those don't
  // compose for a negative non-integer hour (both round toward more-negative independently,
  // silently swapping start and end for something like stamp(-0.5)).
  const stamp = (hour: number) => {
    const totalMinutes = Math.round(hour * 60);
    const wholeHours = Math.floor(totalMinutes / 60);
    return new Date(2026, 7, 15, wholeHours, totalMinutes - wholeHours * 60).toISOString();
  };

  return {
    id,
    title: `Event ${id}`,
    startDate: stamp(startHour),
    endDate: stamp(endHour),
    isAllDay: false,
    fallbackColor: "#3b82f6",
    ...overrides,
  };
}

function build(events: ClockEventInput[], overrides: Partial<AnalogClockParams> = {}) {
  return analogClock({ events, time: MORNING, ...overrides });
}

/**
 * Three overflowing events ten minutes apart. Measured with the displacement pass disabled, all
 * three cards overlap each other — 447.5..502.6, 467.9..522.9 and 486.7..541.8, on a 55.1-unit
 * card. Shared with the duration suite, which uses it as the case where the resolved pile reaches
 * the bottom of the clamp band and a duration line no longer fits.
 */
const pile = [
  input("early", 4.0, 4.4, { title: PILE_TITLE }),
  input("middle", 4.17, 4.57, { title: PILE_TITLE }),
  input("late", 4.34, 4.74, { title: PILE_TITLE }),
];

function arcs(root: SVGSVGElement): Element[] {
  // The fill layer only — an arc is three paths now, and the others carry the same id prefix.
  return [...root.querySelectorAll('path[data-arc-part="fill"]')];
}

/** Where a point on the dial sits, in the same degrees-clockwise-from-twelve the geometry uses. */
function angleAt(x: number, y: number): number {
  return (((Math.atan2(x - CX, CY - y) * 180) / Math.PI) + 360) % 360;
}

/**
 * How many degrees of dial an annular sector covers, read back off its own path.
 *
 * Only the outer sweep is needed: `M` is its start and the first `A`'s endpoint its end. Recovered
 * modulo 360, which is all a single arc can be — nothing this project draws sweeps further.
 */
function arcSpanDegrees(arc: Element): number {
  const parts =
    (arc.getAttribute("d") ?? "").match(
      /^M ([\d.-]+) ([\d.-]+) A [\d.-]+ [\d.-]+ 0 [01] 1 ([\d.-]+) ([\d.-]+)/
    ) ?? [];

  const start = angleAt(Number(parts[1]), Number(parts[2]));
  const end = angleAt(Number(parts[3]), Number(parts[4]));
  return (end - start + 360) % 360;
}

/** `M x y A R R … L x y A r r …` — the two radii of a donut segment. */
function arcRadii(arc: Element): { outer: number; inner: number } {
  const found = (arc.getAttribute("d") ?? "")
    .split("A ")
    .slice(1)
    .map((segment) => Number.parseFloat(segment));

  return { outer: found[0], inner: found[1] };
}

describe("input (test helper)", () => {
  it("orders start before end for a negative non-integer hour", () => {
    const event = input("x", -1, -0.5);
    expect(new Date(event.startDate).getTime()).toBeLessThan(new Date(event.endDate).getTime());
  });
});

function testIds(nodes: Iterable<Element>): (string | null)[] {
  return [...nodes].map((node) => node.getAttribute("data-testid"));
}

describe("analogClock", () => {
  describe("composition", () => {
    it("layers arcs beneath labels beneath the face", () => {
      // The face paints last so the hands cover any label bleeding toward the centre.
      const { element } = build([input("a", 2, 4)]);

      expect(testIds(element.children)).toEqual([
        "event-arcs-layer",
        "floating-labels-layer",
        "clock-face",
      ]);
    });

    it("lets labels paint outside the nominal box", () => {
      expect(build([]).element.getAttribute("overflow")).toBe("visible");
    });

    it("renders a bare dial when the period is empty, not an error", () => {
      const { element } = build([]);

      expect(arcs(element)).toHaveLength(0);
      expect(element.querySelector('[data-testid="clock-face"]')).not.toBeNull();
    });

    it("leaves only a hairline between the face and the arc band", () => {
      // Guards #19. The band's width used to be subtracted twice — once here and again inside
      // clockFace — leaving an empty ring as wide as the band itself, about 17% of the diameter.
      const { element } = build([]);
      const faceRadius = Number(
        element.querySelector('[data-testid="clock-face-bg"]')?.getAttribute("r")
      );
      const gap = CLOCK_RADIUS - faceRadius;

      expect(gap).toBeCloseTo(FACE_GAP, 4);
      expect(gap).toBeLessThan(ARC_THICKNESS / 2);
    });

    it("draws every arc outside the face circle, so the band's ground is the page (#74)", () => {
      // The geometric fact `event-arc.ts` used to deny: it measured elapsed outlines against
      // `--card`, which is `clock-face-bg`'s fill, while the band it draws them on sits beyond
      // that circle over `--page`. The error was safe — the real ground is darker — but it moved
      // every adjusted colour further from its authored hue than it had to. If the band is ever
      // moved inside the face, this fails and BAND_BACKGROUND is the thing to revisit.
      const { element } = build(
        // Stacked as deep as the band will go, so the innermost ring is the one measured.
        Array.from({ length: MAX_RINGS + 1 }, (_, index) => input(`deep-${index}`, 2, 5))
      );
      const faceRadius = Number(
        element.querySelector('[data-testid="clock-face-bg"]')?.getAttribute("r")
      );
      const innermost = Math.min(...arcs(element).map((arc) => arcRadii(arc).inner));

      expect(arcs(element).length).toBeGreaterThan(1);
      expect(innermost).toBeGreaterThanOrEqual(faceRadius);
    });

    it("gives the arc band a share of the radius, not a fixed pixel width", () => {
      // Guards #20: a fixed 48-unit band could not be widened for a room without editing code,
      // and did not track the dial at all.
      const wide = analogClock({ events: [], time: MORNING, size: 1200 });
      const band =
        Number(wide.element.querySelector('[data-testid="clock-face-bg"]')?.getAttribute("r")) /
        (1200 / 2 - 8);

      // Face keeps the same fraction of the radius at any size.
      expect(band).toBeCloseTo((CLOCK_RADIUS - FACE_GAP) / OUTER_RADIUS, 4);
    });
  });

  describe("the window track", () => {
    it("draws it first in the arcs layer, so events paint over it", () => {
      const { element } = build([input("a", 2, 4)]);
      const arcsLayer = element.querySelector('[data-testid="event-arcs-layer"]');

      expect(arcsLayer?.firstElementChild?.getAttribute("data-testid")).toBe("window-track");
    });

    it("stays fully under an elapsed arc's outline where the two meet (#74)", () => {
      // The track is `var(--border)` at half opacity — `#3c4049`, 1.86:1 on the page — and it sits
      // exactly where an outermost elapsed arc's outline is drawn. Every outline colour measures
      // ~2.4:1 against it, so a sliver of track peeking out from under one would be a light fringe
      // halving the contrast the outline is resolved to. It does not: the stroke straddles the rim
      // by half its width, which is wider than the track, so it hides it. Confirmed by reading the
      // rendered pixels either side of the outline — `#0c0e12` both ways — but the margin is 0.09
      // units at the thinnest ring the band can open, so it is worth holding rather than trusting.
      const trackThickness = OUTER_RADIUS * 0.008;
      const thinnestRing = ARC_THICKNESS * 0.16;
      // The stroke is sized from the band, then capped at 0.4 of the ring it is drawn on.
      const narrowestOutline = Math.min(ARC_THICKNESS * 0.07, thinnestRing * 0.4);

      expect(narrowestOutline / 2).toBeGreaterThan(trackThickness);
    });

    it("spans exactly the current rolling window, in the same angle space as the arcs", () => {
      // MORNING is 4:00, periodStart is midnight, and the window is [1:00, 12:00) — angles 30°
      // (1:00 is 60min past midnight) to 360° (12:00 is 720min past midnight) against the
      // 720-minute period, i.e. angleForTime(1:00, periodStart) and angleForTime(12:00, periodStart).
      const { element } = build([]);
      const track = element.querySelector('[data-testid="window-track"]');
      const d = track?.getAttribute("d") ?? "";
      const [, startX, startY] = d.match(/^M ([\d.-]+) ([\d.-]+)/) ?? [];

      // The outer path starts 30° clockwise of 12 o'clock and ends back at 12 o'clock (360°).
      expect(Number(startX)).toBeGreaterThan(CX); // clockwise of 12 o'clock, right of centre
      expect(Number(startY)).toBeLessThan(CY); // still in the upper half at only 30°
    });

    it("rebuilds with the window as the clock ticks into a new minute", () => {
      const clock = build([]);
      const before = clock.element.querySelector('[data-testid="window-track"]')?.getAttribute("d");

      clock.setTime(new Date(MORNING.getTime() + 70_000));
      const after = clock.element.querySelector('[data-testid="window-track"]')?.getAttribute("d");

      expect(after).not.toBe(before);
    });
  });

  describe("window filtering", () => {
    it("keeps only events overlapping the rolling window", () => {
      // MORNING's window is [1:00, 12:00) — "before" ends before it starts, "during" sits
      // inside, "after" starts once it has ended.
      const { element } = build([
        input("before", -1, -0.5),
        input("during", 2, 4),
        input("after", 14, 16),
      ]);

      expect(testIds(arcs(element))).toEqual(["event-arc-during"]);
    });

    it("drops all-day events, which have no angles to draw", () => {
      const { element } = build([input("timed", 2, 4), input("allday", 0, 12, { isAllDay: true })]);

      expect(testIds(arcs(element))).toEqual(["event-arc-timed"]);
    });
  });

  describe("ring stacking", () => {
    it("gives a lone event the whole band", () => {
      const { element } = build([input("a", 2, 4)]);
      const { outer, inner } = arcRadii(arcs(element)[0]);

      expect(outer).toBeCloseTo(OUTER_RADIUS, 4);
      expect(inner).toBeCloseTo(CLOCK_RADIUS, 4);
    });

    it("keeps non-overlapping events on one ring", () => {
      const { element } = build([input("a", 1, 2), input("b", 3, 4), input("c", 5, 6)]);
      const outers = arcs(element).map((arc) => arcRadii(arc).outer);

      expect(outers).toEqual([OUTER_RADIUS, OUTER_RADIUS, OUTER_RADIUS]);
    });

    it("stacks overlapping events inward, earliest outermost", () => {
      const { element } = build([input("a", 2, 4), input("b", 2.5, 4.5), input("c", 3, 5)]);

      const thickness = (ARC_THICKNESS - 2 * RING_GAP) / 3;
      const outers = arcs(element).map((arc) => arcRadii(arc).outer);

      expect(outers[0]).toBeCloseTo(OUTER_RADIUS, 4);
      expect(outers[1]).toBeCloseTo(OUTER_RADIUS - (thickness + RING_GAP), 4);
      expect(outers[2]).toBeCloseTo(OUTER_RADIUS - 2 * (thickness + RING_GAP), 4);
    });

    it("never lets the innermost ring cross the clock face", () => {
      const { element } = build([input("a", 2, 4), input("b", 2.5, 4.5), input("c", 3, 5)]);
      const inners = arcs(element).map((arc) => arcRadii(arc).inner);

      for (const inner of inners) {
        expect(inner).toBeGreaterThanOrEqual(CLOCK_RADIUS - 1e-6);
      }
    });

    it("does not charge an isolated event for a crowd elsewhere on the dial", () => {
      // The headline of #9. Depth used to be dial-wide, so this lunch arc — which overlaps
      // nothing — was thinned to a third of the band by a cluster three hours earlier, and lost
      // its emoji and title to it.
      const { element } = build([
        input("a", 1, 3),
        input("b", 1.5, 3.5),
        input("c", 2, 4),
        input("lunch", 8, 10),
      ]);
      const lunch = element.querySelector('path[data-testid="event-arc-lunch"]');

      expect(arcRadii(lunch!).outer).toBeCloseTo(OUTER_RADIUS, 4);
      expect(arcRadii(lunch!).inner).toBeCloseTo(CLOCK_RADIUS, 4);
    });

    it("does not stack events that only overlap once widened to the minimum span", () => {
      // A five-minute event is drawn 7.5° wide so it stays visible. Assigning rings from the
      // drawn angles made it appear to clash with a neighbour six minutes later, and the phantom
      // cost both of them two thirds of the band.
      const { element } = build([input("brief", 9, 9 + 5 / 60), input("after", 9.1, 10)]);
      const outers = arcs(element).map((arc) => arcRadii(arc).outer);

      expect(outers).toEqual([OUTER_RADIUS, OUTER_RADIUS]);
    });

    it("stops opening rings once they would stop reading as arcs", () => {
      // Nine mutually overlapping events. Unbounded, the band divided nine ways gives slivers,
      // and past about eighteen the arithmetic went negative and rendered arcs inside out.
      const events = Array.from({ length: 9 }, (_, index) =>
        input(`e${index}`, 2 + index * 0.1, 6)
      );
      const { element } = build(events);
      const drawn = arcs(element).map((arc) => arcRadii(arc));

      expect(new Set(drawn.map((radii) => radii.outer.toFixed(4))).size).toBeLessThanOrEqual(
        MAX_RINGS
      );
      for (const { inner, outer } of drawn) {
        expect(outer).toBeGreaterThan(inner);
        expect(inner).toBeGreaterThanOrEqual(CLOCK_RADIUS - 1e-6);
      }
    });

    /**
     * #67: the dial derives each arc's title layout before the arc renders, so it is the dial that
     * has to hand the layout the stroke that arc will draw on its own ring edges. Miss it and a
     * two-line title on a four-deep ring sits 0.55 units from the outline — inside the one unit
     * below which two marks stop reading as two — and every number here still looks right in
     * isolation, which is why this measures the rendered attributes against each other.
     */
    it("keeps a stacked ring's two-line title clear of its own elapsed outline", () => {
      // Four mutually overlapping events; "a" takes the outermost ring and a title long enough to
      // wrap at that ring's font size. All four have ended by MORNING, so the outline is drawn.
      const wrapping = "Parent Teacher Conference Planning Committee Meeting Notes and Actions";
      const { element } = build([
        input("a", 2, 3, { title: wrapping }),
        input("b", 2, 4),
        input("c", 2.2, 4),
        input("d", 2.4, 4),
      ]);

      const group = element.querySelector('[data-testid="event-arc-group-a"]');
      const { inner, outer } = arcRadii(group!.querySelector('[data-arc-part="fill"]')!);
      const radii = [...group!.querySelectorAll("defs > path")].map((node) =>
        Number(/A ([\d.]+) /.exec(node.getAttribute("d") ?? "")?.[1])
      );
      const fontSize = Number(
        group!.querySelector('[data-testid="event-title-a"] text')?.getAttribute("font-size")
      );
      const strokeReach =
        Number(group!.querySelector('[data-arc-part="outline"]')?.getAttribute("stroke-width")) / 2;

      // The premise: four rings deep, and a title that really did take two lines.
      expect(outer - inner).toBeCloseTo((ARC_THICKNESS - 3 * RING_GAP) / 4, 4);
      expect(radii).toHaveLength(2);

      // Real ink, not the em box (#90). `fontSize / 2` here was the same model the cap carried, and
      // it made this assertion inert: with both sides on the em box it reported the floor exactly
      // whatever the real gap was, so it passed on a stack 0.64 units clear of a promised 1.00.
      expect(Math.max(...radii) + (fontSize * INK_HEIGHT_RATIO) / 2).toBeLessThanOrEqual(
        outer - strokeReach - TITLE_EDGE_CLEARANCE
      );
      expect(Math.min(...radii) - (fontSize * INK_HEIGHT_RATIO) / 2).toBeGreaterThanOrEqual(
        inner + strokeReach + TITLE_EDGE_CLEARANCE
      );
    });

    /**
     * The fixture's own three-deep two-line case (#90 moved that depth from "the ring ratio wins" to
     * "the outline wins", and the 12-hour fixture's stacked title is four deep). Driven through the
     * real fixture and the real dial so it guards the *placement*, not a string: everything asserted
     * here is read off the rendered attributes, so retiming `s` out of the cluster, shortening its
     * title back to one line, or losing it to a floating label each fails a different line.
     */
    it("keeps the 1-hour fixture's three-deep ring on two capped lines", () => {
      // Seeded exactly as demo mode seeds it — from the window's own start — so the fixture's own
      // offsets decide where `s` lands rather than a time chosen to suit the assertion.
      const time = new Date(2026, 7, 15, 4, 20, 0);
      const { windowStart } = dialWindow(time, ONE_HOUR_SCALE);
      const { element } = build(oneHourSampleEvents(windowStart), { time, scale: "1h" });

      const group = element.querySelector('[data-testid="event-arc-group-s"]');
      const { inner, outer } = arcRadii(group!.querySelector('[data-arc-part="fill"]')!);
      const radii = [...group!.querySelectorAll("defs > path")].map((node) =>
        Number(/A ([\d.]+) /.exec(node.getAttribute("d") ?? "")?.[1])
      );
      const fontSize = Number(
        group!.querySelector('[data-testid="event-title-s"] text')?.getAttribute("font-size")
      );
      const ring = (ARC_THICKNESS - 2 * RING_GAP) / 3;

      // Three rings deep, and `s` on the innermost of them — where the fixture's comment says it is.
      expect(outer - inner).toBeCloseTo(ring, 4);
      expect(outer).toBeCloseTo(OUTER_RADIUS - 2 * (ring + RING_GAP), 4);

      // Two lines, drawn on the arc rather than promoted to a card that would sidestep the geometry.
      expect(radii).toHaveLength(2);
      expect(element.querySelector('[data-testid="floating-label-s"]')).toBeNull();

      // And the cap binds there, which is the boundary this case exists to show.
      expect(fontSize).toBeLessThan((outer - inner) * TITLE_FONT_SIZE_RATIO);
    });
  });

  describe("title overflow routing", () => {
    it("promotes an overflowing title to a label and suppresses the in-arc copy", () => {
      const { element } = build([input("a", 2, 3, { title: LONG_TITLE })]);

      expect(element.querySelector('[data-testid="floating-label-a"]')).not.toBeNull();
      expect(element.querySelector('[data-testid="event-title-a"]')).toBeNull();
    });

    it("leaves a title that fits on its arc", () => {
      const { element } = build([input("a", 2, 5)]);

      expect(element.querySelector('[data-testid="floating-label-a"]')).toBeNull();
      expect(element.querySelector('[data-testid="event-title-a"]')).not.toBeNull();
    });

    it("does not label an arc too narrow to see", () => {
      // Six minutes, widened to the 7.5° floor — still under the 10° visibility threshold, so a
      // label would point at a sliver nobody can find.
      const { element } = build([input("a", 2, 2.1, { title: LONG_TITLE })]);

      expect(element.querySelector('[data-testid="floating-label-a"]')).toBeNull();
    });

    it("orders labels clockwise regardless of input order", () => {
      const { element } = build([
        input("late", 8, 9, { title: LONG_TITLE }),
        input("early", 2, 3, { title: LONG_TITLE }),
      ]);

      expect(
        testIds(element.querySelectorAll('[data-testid="floating-labels-layer"] > g'))
      ).toEqual(["floating-label-early", "floating-label-late"]);
    });
  });

  /**
   * #35: the dial hands each surface the event's own duration as text, since angular extent is the
   * only channel carrying it and `MIN_ARC_DEGREES` flattens everything under fifteen minutes into
   * the same 7.5°.
   */
  describe("duration", () => {
    function labelLines(element: SVGSVGElement, id: string): string[] {
      return [...element.querySelectorAll(`[data-testid^="floating-label-text-${id}-"]`)].map(
        (node) => node.textContent ?? ""
      );
    }

    it("states an arc's duration on the line its title left free", () => {
      const { element } = build([input("a", 2, 5)]);

      expect(
        element.querySelector('[data-testid="event-duration-a"] textPath')?.textContent
      ).toBe("3 hr");
    });

    it("states it on the card instead when the title overflowed", () => {
      const { element } = build([input("a", 2, 2.5, { title: LONG_TITLE })]);

      expect(element.querySelector('[data-testid="event-duration-a"]')).toBeNull();
      expect(labelLines(element, "a").slice(-1)).toEqual(["30 min"]);
    });

    /**
     * A duration line makes a card 40% taller, and two cards landing on each other hides a title
     * that is on a card *because* it did not fit its arc. The line is optional, so it goes rather
     * than the title — but only where displacement (#30 item 2) cannot make room for it first,
     * which is what #136 settled: the two passes iterate together rather than in sequence.
     */
    describe('rather than covering a card already placed', () => {
      function cardRects(element: SVGSVGElement) {
        return [...element.querySelectorAll('[data-testid^="floating-label-rect-"]')].map((node) => {
          const at = (name: string) => Number(node.getAttribute(name));
          return {
            id: node.getAttribute("data-testid")?.replace("floating-label-rect-", "") ?? "",
            x: at("x"),
            y: at("y"),
            width: at("width"),
            height: at("height"),
          };
        });
      }

      // Two overflowing events 45 minutes apart — routine on a school day, per #30's own numbers.
      const adjacent = [
        input("first", 2, 2.75, { title: LONG_TITLE }),
        input("second", 2.75, 3.25, { title: LONG_TITLE }),
      ];

      it("keeps every card clear of every other", () => {
        const rects = cardRects(build(adjacent).element);

        expect(rects).toHaveLength(2);
        expect(rectsOverlap(rects[0], rects[1])).toBe(false);
      });

      it("keeps the durations where the cards are far enough apart", () => {
        const spread = [
          input("morning", 2, 3, { title: LONG_TITLE }),
          input("evening", 8, 9, { title: LONG_TITLE }),
        ];
        const { element } = build(spread);

        for (const id of ["morning", "evening"]) {
          expect(labelLines(element, id).slice(-1)).toEqual(["1 hr"]);
        }
      });

      it("keeps both durations where displacement separates the cards (#136)", () => {
        // These two cards overlap at their title-only size, so the un-displaced comparison this
        // pass used to make declined the later one's line. Displacement resolves the collision, so
        // the line was given up for nothing — and the cards still clear each other with it.
        const { element } = build(adjacent);
        const rects = cardRects(element);

        expect(labelLines(element, "first").slice(-1)).toEqual(["45 min"]);
        expect(labelLines(element, "second").slice(-1)).toEqual(["30 min"]);
        expect(rectsOverlap(rects[0], rects[1])).toBe(false);
      });

      it("still drops a duration displacement cannot make room for", () => {
        // The negative half, and the one that matters: `pile`'s later cards are displaced hard
        // against the bottom of the clamp band, so a line there would push one out of the frame the
        // page is sized for (#121). Clockwise order decides which of the three yields, matching the
        // order a reader scans the dial.
        //
        // How many yield has moved twice, and both times because a card's *width* moved:
        //
        // - #118's swatch cost a character a line, so `PILE_TITLE` needed three lines at the
        //   earliest card's angle instead of two and **two** of the three yielded where one had.
        // - #183 clears a card against the height it draws rather than the tallest it may reach,
        //   which hands these cards 160.7 units instead of 121.4. `PILE_TITLE` is back to two lines
        //   — `Staff Debrief` / `and Planning`, where it was `Staff` / `Debrief and` / `Planning` —
        //   so the card carrying a duration is 79.58 units tall again and **one** yields.
        //
        // The property is unchanged and is what the assertions below are: the last card in
        // clockwise order still gives up its duration, and every yielding card keeps its whole
        // title, which is what the pass exists to protect.
        const { element } = build(pile);
        const rects = cardRects(element);

        expect(labelLines(element, "early").slice(-1)).toEqual(["24 min"]);
        expect(labelLines(element, "middle").slice(-1)).toEqual(["24 min"]);
        expect(labelLines(element, "late").slice(-1)).not.toEqual(["24 min"]);
        expect(labelLines(element, "late").join(" ")).toBe(PILE_TITLE);
        for (const rect of rects) {
          expect(rects.filter((other) => other !== rect && rectsOverlap(rect, other))).toEqual([]);
        }
      });
    });

    // The arc runs 10:00 to noon and stops at the period's edge; the event runs to 13:00. Deriving
    // the text from the drawn angles would make it agree with the drawing and say "2 hr", which is
    // the one thing this channel exists not to do.
    it("states the event's own length where the period cut the arc short", () => {
      const { element } = build([input("a", 10, 13)]);

      expect(
        element.querySelector('[data-testid="event-duration-a"] textPath')?.textContent
      ).toBe("3 hr");
    });
  });

  /**
   * #30 item 2. The duration pass above only declines an *optional* line; when cards overlap on
   * their titles alone it has nothing left to give, and until this landed they simply overlapped.
   *
   * Piles form at twelve and six o'clock for a reason worth knowing: `y = cy − R·cos θ`, so
   * `dy/dθ = R·sin θ` is **zero** at both, and events tens of minutes apart land at nearly the same
   * height. The fixture's own case is three cards within 22 units of each other at `?now=11:00`.
   */
  describe("cards that still overlap are moved apart vertically", () => {
    function cardRects(element: SVGSVGElement) {
      return [...element.querySelectorAll('[data-testid^="floating-label-rect-"]')].map((node) => {
        const at = (name: string) => Number(node.getAttribute(name));
        return {
          id: node.getAttribute("data-testid")?.replace("floating-label-rect-", "") ?? "",
          x: at("x"),
          y: at("y"),
          width: at("width"),
          height: at("height"),
        };
      });
    }

    function anyOverlap(rects: ReturnType<typeof cardRects>): string[] {
      const hits: string[] = [];
      rects.forEach((rect, index) =>
        rects.forEach((other, otherIndex) => {
          if (otherIndex > index && rectsOverlap(rect, other)) hits.push(`${rect.id}+${other.id}`);
        })
      );
      return hits;
    }

    it("clears a three-deep pile", () => {
      const rects = cardRects(build(pile).element);

      expect(rects).toHaveLength(3);
      expect(anyOverlap(rects)).toEqual([]);
    });

    it("leaves a dial whose cards already clear each other untouched", () => {
      // The property that keeps this from disturbing a correct layout: a card overlapping nothing
      // is never in a component, so its position is the one the clamp produced.
      const spread = [
        input("morning", 2, 3, { title: LONG_TITLE }),
        input("evening", 8, 9, { title: LONG_TITLE }),
      ];
      const rects = cardRects(build(spread).element);
      const naturalYs = rects.map((rect) => rect.y);

      expect(anyOverlap(rects)).toEqual([]);
      expect(cardRects(build(spread).element).map((rect) => rect.y)).toEqual(naturalYs);
    });

    it("never moves a card toward the dial's centre line", () => {
      // `faceClearanceLimit` is monotone in the distance from that line, so this is what keeps a
      // displaced card off the face without re-deriving the width it was wrapped to.
      for (const rect of cardRects(build(pile).element)) {
        // Every card in this pile sits below the centre line, so none of them may move up.
        expect(rect.y + rect.height / 2).toBeGreaterThan(CY);
      }
    });
  });

  /**
   * #23: the emoji renders inline with the title, so it has to travel with the title onto a
   * floating label rather than being left behind on the arc.
   */
  describe("the event emoji follows the title", () => {
    function labelText(element: SVGSVGElement, id: string): string {
      return [...element.querySelectorAll(`[data-testid^="floating-label-text-${id}-"]`)]
        .map((node) => node.textContent ?? "")
        .join(" ");
    }

    it("renders the emoji inline on the arc, with no separate glyph", () => {
      const { element } = build([input("a", 2, 5, { title: "🟢 🎮 Game Time" })]);

      expect(
        [...element.querySelectorAll('[data-testid="event-title-a"] textPath')]
          .map((node) => node.textContent)
          .join(" ")
      ).toContain("🎮");
      expect(element.querySelector('[data-testid="event-emoji-a"]')).toBeNull();
    });

    it("moves the emoji onto the label rather than leaving it on the arc", () => {
      // Rendering the fixture settled this: a glyph left on the arc overlapped the label's own
      // text, and the label already carries the emoji inline, so the arc copy was a collision
      // bought for nothing.
      const { element } = build([input("a", 2, 3, { title: `🔵 📚 ${LONG_TITLE}` })]);

      expect(element.querySelector('[data-testid="floating-label-a"]')).not.toBeNull();
      expect(labelText(element, "a")).toContain("📚");
      expect(element.querySelector('[data-testid="event-emoji-a"]')).toBeNull();
    });

    it("does not let a label's card and an arc glyph both claim the same event", () => {
      // The guard the collision needed: exactly one surface carries the emoji, whichever it is.
      const { element } = build([
        input("labelled", 2, 3, { title: `🔵 📚 ${LONG_TITLE}` }),
        input("inline", 5, 8, { title: "🟢 🎮 Game Time" }),
        input("narrow", 10, 10.4, { title: "🟠 🍽️ Lunch" }),
      ]);

      for (const id of ["labelled", "inline", "narrow"]) {
        const onArc = element.querySelector(`[data-testid="event-title-${id}"]`) !== null;
        const glyph = element.querySelector(`[data-testid="event-emoji-${id}"]`) !== null;
        const label = element.querySelector(`[data-testid="floating-label-${id}"]`) !== null;

        expect([onArc, glyph, label].filter(Boolean)).toHaveLength(1);
      }
    });

    it("never renders the colour-dot prefix, on the arc or the label", () => {
      const { element } = build([
        input("fits", 2, 5, { title: "🟢 🎮 Game Time" }),
        input("overflows", 6, 7, { title: `🔵 📚 ${LONG_TITLE}` }),
      ]);

      expect(element.textContent).not.toContain("🟢");
      expect(element.textContent).not.toContain("🔵");
    });

    it("keeps the standalone glyph on an arc too narrow for any title", () => {
      // 24 minutes is 12°: past the emoji floor, short of the title floor. The title here is the
      // emoji alone, which fits the 4-unit budget at that span and so is not promoted to a label —
      // leaving the glyph as the only thing naming the event.
      const { element } = build([input("a", 2, 2.4, { title: "🟠 🍽️" })]);

      expect(element.querySelector('[data-testid="event-title-a"]')).toBeNull();
      expect(element.querySelector('[data-testid="floating-label-a"]')).toBeNull();
      expect(element.querySelector('[data-testid="event-emoji-a"]')).not.toBeNull();
    });
  });

  /**
   * #172 — a card whose event the panel already names, and which is landing on another card, is
   * dropped rather than resolved. The name is not lost: it is in the column at 21.2576 units on a
   * plain ground, against the 17.52 the card would have given it on the band.
   *
   * The pure rule is tested at `labelsDischargedByPanel`; these assert the dial calls it, that it
   * calls it at the right *moment*, and the one property no unit test of the rule can see — that a
   * suppressed card comes back when the panel stops naming its event.
   */
  describe("labels the agenda panel already names", () => {
    const cardIds = (element: SVGSVGElement) =>
      [...element.querySelectorAll('[data-testid^="floating-label-rect-"]')]
        .map((node) => node.getAttribute("data-testid")?.replace("floating-label-rect-", "") ?? "")
        .sort();

    it("drops a colliding card the panel names, and keeps the rest of the pile", () => {
      const named = new Set(["early"]);
      const clock = build(pile, { namedElsewhere: () => named });

      expect(cardIds(clock.element)).toEqual(["late", "middle"]);
    });

    it("keeps every card when no panel is up", () => {
      // The safe direction, and a real board: #171 has the panel vanishing as the display approaches
      // square, and there the card is the only thing naming its arc.
      expect(cardIds(build(pile, { namedElsewhere: () => new Set() }).element)).toEqual([
        "early",
        "late",
        "middle",
      ]);
      expect(cardIds(build(pile).element)).toEqual(["early", "late", "middle"]);
    });

    it("keeps a card the panel names when it is colliding with nothing", () => {
      // Suppressing unconditionally would take this one too. Measured over 96 pins it would take 66
      // cards against this rule's 25 and clear exactly the same 20 band covers — the 41 it keeps
      // were contributing none of them, because a card in no collision covers nothing.
      const spread = [
        input("morning", 2, 3, { title: LONG_TITLE }),
        input("evening", 8, 9, { title: LONG_TITLE }),
      ];
      const clock = build(spread, { namedElsewhere: () => new Set(["morning", "evening"]) });

      expect(cardIds(clock.element)).toEqual(["evening", "morning"]);
    });

    /**
     * **The race the rule would otherwise open, and the reason the panel's set is a rebuild
     * trigger.** The dial rebuilds on a calendar minute, on an event ending, and every tick while
     * anything is in progress. The panel rebuilds when its *column* changes — a trigger none of
     * those cover, since the column holds only what fits and an event entering the top of it can
     * push the last one out with nothing on the band changing at all.
     *
     * Without this, a card suppressed because the panel named its event would stay suppressed after
     * the panel dropped the row, and the event would be named **nowhere** — #146's defect arriving
     * as a race rather than as a policy. The tick below is inside the same calendar minute and after
     * every event in the pile has ended, so the set is the *only* thing that has changed.
     */
    it("brings a suppressed card back when the panel stops naming its event", () => {
      let named = new Set(["early"]);
      const clock = build(pile, { namedElsewhere: () => named });
      expect(cardIds(clock.element)).toEqual(["late", "middle"]);

      named = new Set();
      clock.setTime(new Date(MORNING.getTime() + 30_000));

      expect(cardIds(clock.element)).toEqual(["early", "late", "middle"]);
    });

    /**
     * The mirror of the above, and the reason the key is about membership rather than order: a tick
     * that changes neither the minute nor the column must still not rebuild, or the dial is
     * reconstructing its whole tree every second on a device meant to run for weeks.
     */
    it("does not rebuild for a tick where the panel's set is unchanged", () => {
      const named = new Set(["early"]);
      const clock = build([input("a", 2, 4)], { namedElsewhere: () => named });
      const arc = clock.element.querySelector('path[data-testid="event-arc-a"]');

      clock.setTime(new Date(MORNING.getTime() + 30_000));

      expect(clock.element.querySelector('path[data-testid="event-arc-a"]')).toBe(arc);
    });

    /**
     * Suppression runs on the cards' *natural* rects, before `planOptionalLines` decides duration
     * lines — which is what makes the relief free rather than retrospective. Measured after the
     * resolver only 6 of 251 cards still overlap, because it has already paid for the rest.
     *
     * Asserted through the resolver's own output: with the pile's third card gone the survivors are
     * far enough apart to afford the duration lines the full pile makes them decline.
     */
    it("hands the duration pass a dial the suppressed card is already out of", () => {
      // Which cards kept their duration line, by id — read off the rendered text rather than
      // counted, because a count cannot tell "three cards, one silent" from "two cards, both
      // speaking" and those are the two states this is about.
      const withDuration = (element: SVGSVGElement) =>
        [...element.querySelectorAll('[data-testid^="floating-label-text-"]')]
          .filter((node) => node.textContent === "24 min")
          .map(
            (node) =>
              node
                .getAttribute("data-testid")
                ?.replace("floating-label-text-", "")
                .replace(/-\d+$/, "") ?? ""
          )
          .sort();

      const full = build(pile, { namedElsewhere: () => new Set() }).element;
      const relieved = build(pile, { namedElsewhere: () => new Set(["early"]) }).element;

      // Three piled cards cannot all afford the line — `planOptionalLines` makes one go without,
      // and on this fixture it is `late`, whose title then wraps 2 → 2 at a different width.
      expect(withDuration(full)).toEqual(["early", "middle"]);

      // With the panel-named card out before the pass runs, both survivors keep theirs. That is the
      // relief being free: no card gave up an event's length to buy another card room.
      expect(withDuration(relieved)).toEqual(["late", "middle"]);
    });
  });

  describe("ticking", () => {
    it("re-points the hands on every tick", () => {
      const clock = build([], { showSeconds: true });
      const hand = clock.element.querySelector('[data-testid="second-hand"]');
      const before = hand?.getAttribute("transform");

      clock.setTime(new Date(MORNING.getTime() + 30_000));

      expect(hand?.getAttribute("transform")).not.toBe(before);
    });

    it("does not rebuild the arcs for a tick within the same calendar minute", () => {
      // The tick runs every second; rebuilding the tree that often would be 86,400 needless
      // reconstructions a day on a device meant to run untouched for weeks. Both ticks here land
      // after the event's own end, so nothing is draining and nothing should rebuild.
      const clock = build([input("a", 2, 4)]);
      const arc = clock.element.querySelector('path[data-testid="event-arc-a"]');

      clock.setTime(new Date(MORNING.getTime() + 30_000));

      expect(clock.element.querySelector('path[data-testid="event-arc-a"]')).toBe(arc);
    });

    it("rebuilds the arcs once the rolling window has moved into a new minute", () => {
      // Unlike the old fixed 12-hour period, which rebuilt only on rollover, the rolling window
      // (#25) moves continuously — so every calendar minute is a rebuild, whether or not any
      // event's own state changed.
      const clock = build([input("a", 2, 4)]);
      const arc = clock.element.querySelector('path[data-testid="event-arc-a"]');

      clock.setTime(new Date(MORNING.getTime() + 70_000));

      expect(clock.element.querySelector('path[data-testid="event-arc-a"]')).not.toBe(arc);
    });

    it("drops an event once the rolling window has moved past it", () => {
      // The payoff #25 exists for: an event ages off the band as the window slides forward,
      // rather than staying drawn until the next twice-daily rollover.
      const clock = build([input("a", 2, 4)]);
      expect(testIds(arcs(clock.element))).toEqual(["event-arc-a"]);

      clock.setTime(new Date(2026, 7, 15, 10, 30, 0)); // window becomes [7:30, 18:30)

      expect(testIds(arcs(clock.element))).toEqual([]);
    });

    it("brings a future event onto the band as the window advances", () => {
      // The symmetric half of the same payoff: look-ahead is never exhausted the way the fixed
      // period's was near its own end (the issue's own "15 minutes of future left at 11:45").
      const clock = build([input("a", 20, 21)]); // outside the initial [1:00, 12:00) window
      expect(testIds(arcs(clock.element))).toEqual([]);

      clock.setTime(new Date(2026, 7, 15, 13, 30, 0)); // window becomes [10:30, 21:30)

      expect(testIds(arcs(clock.element))).toEqual(["event-arc-a"]);
    });

    it("rebuilds every tick while an event drains, then again once it fully elapses", () => {
      // #28: a still-running event is no longer a static state between rollovers — the boundary
      // moves every second, so the tick can no longer assume nothing changes mid-event either.
      const clock = build([input("lesson", 9.5, 10)]);
      const before = clock.element.querySelector('path[data-arc-part="fill"]');
      expect(before?.getAttribute("fill-opacity")).toBe("0.85");
      expect(clock.element.querySelector('[data-arc-part="outline"]')).toBeNull();

      clock.setTime(new Date(2026, 7, 15, 9, 45, 0));
      const draining = clock.element.querySelector('path[data-arc-part="fill"]');
      expect(draining).not.toBe(before);
      expect(draining?.getAttribute("fill-opacity")).toBe("0.85");
      expect(clock.element.querySelector('[data-arc-part="outline"]')).not.toBeNull();

      clock.setTime(new Date(2026, 7, 15, 9, 50, 0));
      expect(clock.element.querySelector('path[data-arc-part="fill"]')).not.toBe(draining);

      clock.setTime(new Date(2026, 7, 15, 10, 15, 0));
      const after = clock.element.querySelector('path[data-arc-part="fill"]');

      expect(after?.getAttribute("fill-opacity")).toBe("0");
      expect(clock.element.querySelector('[data-arc-part="separator"]')).toBeNull();
      expect(clock.element.querySelector('[data-arc-part="outline"]')).not.toBeNull();
    });

    it("rebuilds the arcs the moment an event finishes, even within the same minute", () => {
      // Elapsed arcs are drawn hollow (#26), so a tick can no longer assume nothing about an arc
      // changes between minute-boundary rebuilds — the elapsed check is a backstop alongside the
      // minute check for exactly this case. Timed to start and end entirely within one calendar
      // minute, and not yet started at build time, so neither the minute check nor drain's
      // in-progress check (#28) is what triggers the rebuild — isolating the elapsed check alone.
      const brief = {
        startDate: new Date(2026, 7, 15, 10, 0, 10).toISOString(),
        endDate: new Date(2026, 7, 15, 10, 0, 40).toISOString(),
      };
      const clock = build(
        [input("brief", 9.5, 10, brief)],
        { time: new Date(2026, 7, 15, 10, 0, 0) }
      );
      const before = clock.element.querySelector('path[data-arc-part="fill"]');
      expect(before?.getAttribute("fill-opacity")).toBe("0.85");
      expect(clock.element.querySelector('[data-arc-part="halo"]')).toBeNull();

      clock.setTime(new Date(2026, 7, 15, 10, 0, 50)); // same minute, event now elapsed
      const after = clock.element.querySelector('path[data-arc-part="fill"]');

      expect(after?.getAttribute("fill-opacity")).toBe("0");
      expect(clock.element.querySelector('[data-arc-part="separator"]')).toBeNull();
      expect(clock.element.querySelector('[data-arc-part="outline"]')).not.toBeNull();
    });

    it("flips the period indicator across noon", () => {
      const clock = build([]);
      expect(clock.element.querySelector('[data-testid="period-indicator"]')?.textContent).toBe(
        "AM"
      );

      clock.setTime(AFTERNOON);

      expect(clock.element.querySelector('[data-testid="period-indicator"]')?.textContent).toBe(
        "PM"
      );
    });
  });

  describe("setEvents", () => {
    it("replaces the arcs", () => {
      const clock = build([input("a", 2, 4)]);

      clock.setEvents([input("b", 5, 6), input("c", 7, 8)]);

      expect(testIds(arcs(clock.element))).toEqual(["event-arc-b", "event-arc-c"]);
    });

    it("clears the labels of events that are gone", () => {
      const clock = build([input("a", 2, 3, { title: LONG_TITLE })]);
      expect(clock.element.querySelector('[data-testid="floating-label-a"]')).not.toBeNull();

      clock.setEvents([]);

      expect(clock.element.querySelector('[data-testid="floating-label-a"]')).toBeNull();
    });
  });

  describe("accessible name", () => {
    it.each([
      [[], "0 events"],
      [[input("a", 2, 4)], "1 event"],
      [[input("a", 2, 4), input("b", 5, 6)], "2 events"],
    ])("counts %#: %s", (events, expected) => {
      expect(build(events).element.getAttribute("aria-label")).toContain(expected);
    });

    it("keeps the stated time current as the clock ticks", () => {
      const clock = build([]);

      clock.setTime(AFTERNOON);

      expect(clock.element.getAttribute("aria-label")).toContain(
        AFTERNOON.toLocaleTimeString()
      );
    });
  });
});

/**
 * The 1-hour scale (#34). The mode exists because a classroom day is mostly sub-hour events and
 * the 12-hour band draws them all as slivers; these pin that the band actually runs at twelve
 * times the resolution, and against the right window.
 */
describe("analogClock at the 1-hour scale", () => {
  /** MORNING is 4:00, so the 1-hour window is [3:55, 4:50). */
  const oneHour = (events: ClockEventInput[]) => build(events, { scale: "1h" });

  it("draws a 20-minute event at 120° rather than 10°", () => {
    const event = [input("a", 4 + 5 / 60, 4 + 25 / 60)];

    expect(arcSpanDegrees(arcs(oneHour(event).element)[0])).toBeCloseTo(120, 3);
    expect(arcSpanDegrees(arcs(build(event).element)[0])).toBeCloseTo(10, 3);
  });

  /**
   * The complaint #32 was opened about: `MIN_ARC_DEGREES` floors anything under 15 minutes at
   * 7.5°, so on the 12-hour dial a 5-minute and a 15-minute event are drawn *identically*. At 6°
   * per minute the floor stops binding and the two are told apart again.
   */
  it("stops drawing a 5- and a 15-minute event identically", () => {
    const spanAt = (scale: "12h" | "1h", minutes: number) =>
      arcSpanDegrees(
        arcs(build([input("a", 4 + 5 / 60, 4 + (5 + minutes) / 60)], { scale }).element)[0]
      );

    expect(spanAt("12h", 5)).toBeCloseTo(spanAt("12h", 15), 3);
    expect(spanAt("1h", 5)).toBeCloseTo(30, 3);
    expect(spanAt("1h", 15)).toBeCloseTo(90, 3);
  });

  it("shows only what overlaps 5 minutes back and 50 ahead", () => {
    const { element } = oneHour([
      input("in-progress", 3 + 50 / 60, 4 + 10 / 60),
      input("just-ended", 3 + 40 / 60, 3 + 56 / 60),
      input("long-gone", 3, 3 + 30 / 60),
      input("soon", 4 + 30 / 60, 4 + 45 / 60),
      input("beyond", 5, 5 + 30 / 60),
    ]);

    expect(new Set(arcs(element).map((arc) => arc.getAttribute("data-testid")))).toEqual(
      new Set(["event-arc-in-progress", "event-arc-just-ended", "event-arc-soon"])
    );
  });

  it("spans the same 330° band as the 12-hour dial, leaving the same gap", () => {
    const trackSpan = (scale: "12h" | "1h") =>
      arcSpanDegrees(
        build([], { scale }).element.querySelector('[data-testid="window-track"]')!
      );

    expect(trackSpan("1h")).toBeCloseTo(330, 3);
    expect(trackSpan("12h")).toBeCloseTo(330, 3);
  });

  it("passes the scale to the face, which draws the hour numbers on their own ring", () => {
    expect(
      oneHour([]).element.querySelectorAll('[data-testid^="hour-number-inner-"]')
    ).toHaveLength(12);
    expect(build([]).element.querySelectorAll('[data-testid^="hour-number-inner-"]')).toHaveLength(
      0
    );
  });

  /**
   * Every 1-hour window wraps past twelve o'clock unless `now` sits within 5 minutes of the hour,
   * so this is the ordinary case rather than an edge one (#33). An arc on the far side of the wrap
   * must still be drawn the short way round — the failure mode is a 15-minute event painted as
   * 345° of dial.
   */
  it("draws an event past the wrap the short way round", () => {
    const wrapping = analogClock({
      events: [input("a", 5 + 5 / 60, 5 + 20 / 60)],
      time: new Date(2026, 7, 15, 4, 45, 0),
      scale: "1h",
    });

    expect(arcSpanDegrees(arcs(wrapping.element)[0])).toBeCloseTo(90, 3);
  });

  /**
   * `assignRings` rebases every angle onto the window's start before sorting, and defaults that
   * origin to 0 — a no-op only while the window stays inside `[0, 360)`. A 1-hour window at 10:45
   * runs 240°–570°, so rebased onto 0 an event past the wrap sorts *before* one before it, and
   * interval partitioning walked in the wrong order puts two overlapping events on the same ring.
   * The later one is then drawn at identical radii and is invisible — the worst failure this dial
   * has, since an event that is not there cannot be read at any size.
   */
  it("stacks two events that overlap across the top of the hour", () => {
    const wrapping = analogClock({
      events: [input("a", 10 + 50 / 60, 11 + 10 / 60), input("b", 11, 11 + 5 / 60)],
      time: new Date(2026, 7, 15, 10, 45, 0),
      scale: "1h",
    });

    const radii = arcs(wrapping.element).map((arc) => arcRadii(arc));
    expect(radii).toHaveLength(2);
    expect(radii[0].outer).not.toBeCloseTo(radii[1].outer, 3);
    expect(radii[0].inner).not.toBeCloseTo(radii[1].inner, 3);
  });

  it("keeps rebuilding as the window rolls", () => {
    const clock = oneHour([input("a", 4 + 30 / 60, 4 + 45 / 60)]);
    const before = clock.element.querySelector('[data-testid="window-track"]')?.getAttribute("d");

    clock.setTime(new Date(MORNING.getTime() + 70_000));

    expect(clock.element.querySelector('[data-testid="window-track"]')?.getAttribute("d")).not.toBe(
      before
    );
  });
});

/**
 * The board's spare width, granted to the labels (#30 item 1, ADR 0009).
 *
 * The margin is stated from the viewBox, so these are the same numbers the ADR and
 * `docs/brainstorms/2026-08-21-label-placement-fork.md` quote: 50.4 inherited, 172.1 on a 16:10
 * board as it renders, 234.5 on a 16:9 one.
 */
describe("analogClock's label margin", () => {
  const INHERITED = OUTER_RADIUS * 2 * 0.1 - 8;
  const SIXTEEN_NINE = 234.5;

  /** An event every half hour with a title too long for its arc, so cards land all round the dial. */
  const SWEEP = Array.from({ length: 22 }, (_unused, index) =>
    input(`s${index}`, 1 + index / 2, 1 + index / 2 + 25 / 60, { title: LONG_TITLE })
  );

  function cards(margin?: number | null): { x: number; width: number; y: number; height: number }[] {
    const { element } = build(SWEEP, margin === undefined ? {} : { labelMargin: margin });
    const rects = [...element.querySelectorAll('[data-testid^="floating-label-rect-"]')];

    expect(rects.length, "no card was drawn").toBeGreaterThan(8);
    return rects.map((rect) => ({
      x: Number(rect.getAttribute("x")),
      width: Number(rect.getAttribute("width")),
      y: Number(rect.getAttribute("y")),
      height: Number(rect.getAttribute("height")),
    }));
  }

  /** How far past the viewBox the widest card reaches, on the horizontal axis alone. */
  function widestReach(margin?: number | null): number {
    return cards(margin).reduce(
      (most, card) => Math.max(most, -card.x, card.x + card.width - SIZE),
      0
    );
  }

  it.each([
    ["nothing passed", undefined],
    ["an explicit null, which is what an unmeasurable page yields", null],
    ["a margin below the inherited allowance, which the floor absorbs", 10],
  ])("keeps the inherited allowance for %s", (_label, margin) => {
    expect(widestReach(margin)).toBeLessThanOrEqual(INHERITED + 1e-9);
  });

  /**
   * The property the whole change exists for, asserted on the drawn output rather than on the
   * geometry it came from: a granted margin has to reach the *renderer*, and the renderer is the
   * layer that converts the viewBox figure into `ClockBox.labelAllowance`.
   */
  it("spends a granted margin, and stays inside it", () => {
    const granted = widestReach(SIXTEEN_NINE);

    expect(granted).toBeGreaterThan(INHERITED);
    expect(granted).toBeLessThanOrEqual(SIXTEEN_NINE + 1e-9);
  });

  /**
   * More characters a line, measured as *fewer lines for the same titles* — which is the property a
   * viewer sees. Not the longest single line: a card at twelve o'clock already has 65 characters a
   * line at the inherited allowance, so the widest line on the dial is capped by the title's own
   * length and does not move. The sides are where the margin is spent.
   */
  it("wraps the same titles onto fewer lines once the margin is granted", () => {
    const lineCount = (margin?: number | null) =>
      build(SWEEP, margin === undefined ? {} : { labelMargin: margin }).element.querySelectorAll(
        '[data-testid^="floating-label-text-"]'
      ).length;

    expect(lineCount(SIXTEEN_NINE)).toBeLessThan(lineCount());
  });

  it("re-grants the margin without rebuilding for an unchanged one", () => {
    const clock = build(SWEEP);
    const before = clock.element.querySelector('[data-testid="floating-labels-layer"]')?.innerHTML;

    clock.setLabelMargin(null);
    expect(
      clock.element.querySelector('[data-testid="floating-labels-layer"]')?.innerHTML
    ).toBe(before);

    clock.setLabelMargin(SIXTEEN_NINE);
    expect(
      clock.element.querySelector('[data-testid="floating-labels-layer"]')?.innerHTML
    ).not.toBe(before);
  });

  /**
   * Vertical reach is `#display`'s padding to pay for and #121's to argue about.
   *
   * **This asserted `granted ≤ inherited`, on the reasoning that "a wider card is a *shorter* one —
   * it needs fewer lines for the same title — so this cannot regress". #183 falsified that**, and
   * the test earned its keep by being an assertion rather than the reasoning: a wider card is
   * shorter, but it also overlaps more neighbours *horizontally*, so the displacement pass has to
   * spread the stack further vertically to separate them. Measured on this sweep of 22 identical
   * over-long titles, granting the margin went from 11.3 units of reach to 42.9.
   *
   * Fewer cards reach at all — three against the inherited allowance's six — and the fixture does
   * not move: worst reach there is 49.08 units at `?now=19:45&freeze=1`, identical before and after,
   * and already further than this sweep reaches. So the comparison retired here was a proxy that
   * stopped tracking the thing it was named for, not a bound being breached.
   *
   * What replaces it is the bound that actually exists and that the old test never asserted: a
   * card's centre stays inside the clamp band, which is the 10% of dial height `Styles.html` sizes
   * the frame from. That is absolute rather than comparative, so it cannot drift with the sweep.
   * The two reach figures are pinned beside it so any future movement in either is still caught —
   * the same "guard on a known regression rather than a fix" the #98 clearance figures are.
   */
  it("keeps every card's centre inside the frame the page reserves", () => {
    const allowance = (SIZE - 16) * 0.1;

    for (const margin of [undefined, SIXTEEN_NINE]) {
      for (const card of cards(margin)) {
        const centre = card.y + card.height / 2;

        expect(centre).toBeGreaterThanOrEqual(8 - allowance - 1e-9);
        expect(centre).toBeLessThanOrEqual(SIZE - 8 + allowance + 1e-9);
      }
    }
  });

  it("reaches 21.9 units past the dial box unmargined and 42.9 with 16:9 granted", () => {
    const tallest = (margin?: number | null) =>
      cards(margin).reduce((most, card) => Math.max(most, -card.y, card.y + card.height - SIZE), 0);

    expect(tallest()).toBeCloseTo(21.9, 1);
    expect(tallest(SIXTEEN_NINE)).toBeCloseTo(42.9, 1);
  });

});

/**
 * README's ring-thickness figures, asserted against the dial that produces them.
 *
 * #150 put `15.56`, `75.92` and `35.68` into README prose and guarded none of them — in the file
 * `clock-pin.test.ts` already reads through `?raw` for exactly this reason, whose docstring says
 * "prose is the copy nothing checks … That was the second time in two days". Move
 * `ARC_BAND_RATIO`, `RING_GAP_RATIO` or `MIN_RING_THICKNESS_RATIO` and every other spec stays green
 * while README goes on telling a reviewer to reach for a 35.68-unit ring that no longer exists
 * (#153).
 *
 * Read off the rendered `d` attributes rather than recomputed from the ratios: a second copy of
 * `(band − (depth − 1) × gap) / depth` here would keep agreeing with README after the renderer's
 * own formula had moved, which is the failure one level down.
 */
describe("the ring thicknesses README states in prose", () => {
  /** The 12-hour fixture at load, which is the dial README's figures describe. */
  const FIXTURE_ANCHOR = new Date(2026, 7, 18, 4, 0, 0, 0);
  const FIXTURE_NOW = new Date(FIXTURE_ANCHOR.getTime() + 3 * 60 * 60 * 1000);

  function thicknessOf(id: string): number {
    const { element } = analogClock({
      events: sampleEvents(FIXTURE_ANCHOR),
      time: FIXTURE_NOW,
    });
    const arc = element.querySelector(`path[data-testid="event-arc-${id}"]`);
    if (!arc) throw new Error(`the fixture no longer draws an arc "${id}"`);

    const { outer, inner } = arcRadii(arc);
    return outer - inner;
  }

  /**
   * Same reader as `clock-pin.test.ts`'s, and deliberately a copy of the *helper* rather than of
   * any figure: a reworded sentence has to fail loudly here, not silently assert nothing.
   */
  function readmeSays(pattern: RegExp): RegExpExecArray {
    const found = pattern.exec(readme);

    if (!found) {
      throw new Error(
        `README no longer carries ${pattern} — the sentence moved or was reworded, so this guard ` +
          `is asserting nothing. Fix the pattern or restore the figures.`
      );
    }
    return found;
  }

  it("draws the draining arc and a lone arc at the two widths README names", () => {
    const [, clustered, lone] = readmeSays(
      /renders at that\s+cluster's ([\d.]+)-unit ring rather than a lone arc's ([\d.]+)/
    );

    // "n" 🟡 Tidy Up and Line Up — the drain in the default picture — and "d" 🟡 🍽️ Lunch, the
    // isolated arc the fixture carries precisely so a whole-band width is on screen beside it.
    expect(thicknessOf("n")).toBeCloseTo(Number(clustered), 1);
    expect(thicknessOf("d")).toBeCloseTo(Number(lone), 1);
  });

  it("draws the unconfounded drain at the width README sends a reviewer to", () => {
    const [, twoDeep] = readmeSays(/⚫ Staff Debrief draws it\s+at ([\d.]+) units, clear of the cluster/);

    // "w" ⚫ Staff Debrief, two deep with 🟤 ⚽ — the pin README points at for drain geometry.
    expect(thicknessOf("w")).toBeCloseTo(Number(twoDeep), 1);
  });

  /**
   * The claim that makes the two figures above mean anything: the thin one is thin *because* it is
   * in the cluster. Without this, both could drift to the same number and the prose would still
   * parse.
   */
  it("keeps the drain thinner than the arc it sends a reviewer to instead", () => {
    expect(thicknessOf("n")).toBeLessThan(thicknessOf("w"));
    expect(thicknessOf("w")).toBeLessThan(thicknessOf("d"));
  });
});
