import { describe, expect, it } from "vitest";
import type { ClockEventInput } from "../../shared/clock";
import { type AnalogClockParams, analogClock } from "./analog-clock";

const SIZE = 600;
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

/** Nine in the morning, so the period runs midnight → noon. */
const MORNING = new Date(2026, 7, 15, 9, 0, 0);
const AFTERNOON = new Date(2026, 7, 15, 13, 0, 0);

const LONG_TITLE = "Parent Teacher Conference Planning Committee Meeting Notes";

function input(
  id: string,
  startHour: number,
  endHour: number,
  overrides: Partial<ClockEventInput> = {}
): ClockEventInput {
  const stamp = (hour: number) =>
    new Date(2026, 7, 15, Math.floor(hour), Math.round((hour % 1) * 60)).toISOString();

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

function arcs(root: SVGSVGElement): Element[] {
  // The fill layer only — an arc is three paths now, and the others carry the same id prefix.
  return [...root.querySelectorAll('path[data-arc-part="fill"]')];
}

/** `M x y A R R … L x y A r r …` — the two radii of a donut segment. */
function arcRadii(arc: Element): { outer: number; inner: number } {
  const found = (arc.getAttribute("d") ?? "")
    .split("A ")
    .slice(1)
    .map((segment) => Number.parseFloat(segment));

  return { outer: found[0], inner: found[1] };
}

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

  describe("period filtering", () => {
    it("keeps only events overlapping the current twelve hours", () => {
      const { element } = build([input("morning", 2, 4), input("afternoon", 14, 16)]);

      expect(testIds(arcs(element))).toEqual(["event-arc-morning"]);
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

  describe("ticking", () => {
    it("re-points the hands without rebuilding the arcs", () => {
      // The tick runs every second; rebuilding the tree that often would be 86,400 needless
      // reconstructions a day on a device meant to run untouched for weeks.
      const clock = build([input("a", 2, 4)]);
      const arc = clock.element.querySelector('path[data-testid="event-arc-a"]');
      const hand = clock.element.querySelector('[data-testid="minute-hand"]');
      const before = hand?.getAttribute("transform");

      clock.setTime(new Date(2026, 7, 15, 10, 30, 0));

      expect(clock.element.querySelector('path[data-testid="event-arc-a"]')).toBe(arc);
      expect(hand?.getAttribute("transform")).not.toBe(before);
    });

    it("rebuilds the arcs when the period rolls over", () => {
      const clock = build([input("morning", 2, 4), input("afternoon", 14, 16)]);
      expect(testIds(arcs(clock.element))).toEqual(["event-arc-morning"]);

      clock.setTime(AFTERNOON);

      expect(testIds(arcs(clock.element))).toEqual(["event-arc-afternoon"]);
    });

    it("rebuilds the arcs the moment an event finishes", () => {
      // Elapsed arcs are drawn hollow (#26), so the tick can no longer assume nothing about an
      // arc changes between rollovers — but it must still not rebuild on every second.
      const clock = build([input("lesson", 9.5, 10)]);
      const before = clock.element.querySelector('path[data-arc-part="fill"]');
      expect(before?.getAttribute("fill-opacity")).toBe("0.85");

      clock.setTime(new Date(2026, 7, 15, 9, 45, 0));
      expect(clock.element.querySelector('path[data-arc-part="fill"]')).toBe(before);

      clock.setTime(new Date(2026, 7, 15, 10, 15, 0));
      const after = clock.element.querySelector('path[data-arc-part="fill"]');

      expect(after).not.toBe(before);
      expect(after?.getAttribute("fill-opacity")).toBe("0");
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
