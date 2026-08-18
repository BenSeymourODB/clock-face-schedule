import { describe, expect, it } from "vitest";
import { type ClockEventInput, rectsOverlap } from "../../shared/clock";
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
     * A duration line makes a card 40% taller, and cards have no collision avoidance (#30). On the
     * fixture that turned a 9.5-unit gap into a 15-unit overlap — which hides a title that is on a
     * card *because* it did not fit its arc. The line is optional, so it goes rather than the title.
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

      it("drops the later card's duration, not its title", () => {
        // Clockwise order decides which one yields, matching the order a reader scans the dial.
        const { element } = build(adjacent);

        expect(labelLines(element, "first").slice(-1)).toEqual(["45 min"]);
        expect(labelLines(element, "second").slice(-1)).not.toEqual(["30 min"]);
        expect(labelLines(element, "second").length).toBeGreaterThan(0);
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
