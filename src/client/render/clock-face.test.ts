import { describe, expect, it } from "vitest";
import { type DialScaleId, textWidth } from "../../shared/clock";
import { clockFace } from "./clock-face";

const CX = 300;
const CY = 300;
const FACE_RADIUS = 192;

function build(time: Date, showSeconds = false, scale: DialScaleId = "12h") {
  return clockFace({ faceRadius: FACE_RADIUS, cx: CX, cy: CY, time, showSeconds, scale });
}

/** Distance from the dial's centre — what a "pulled inward" numeral ring is measured in. */
function radiusOf(element: Element): number {
  const x = Number(element.getAttribute("x")) - CX;
  const y = Number(element.getAttribute("y")) - CY;
  return Math.sqrt(x * x + y * y);
}

/**
 * How far a numeral's furthest corner reaches from the dial's centre, by the same width model
 * `pack-lines` uses everywhere else. jsdom has no text metrics, so the model is the only measure
 * available here — but both sides of every comparison below use it, which is what makes the
 * comparison meaningful even though the absolute numbers are approximate.
 *
 * The corner, not the centre, because that is where the collision is: at three and nine o'clock a
 * numeral's *width* adds straight onto its radius, while at twelve and six it barely counts.
 */
function numeralCornerReach(element: Element): number {
  const size = Number(element.getAttribute("font-size"));
  const halfWidth = textWidth(element.textContent ?? "", size) / 2;
  const halfHeight = size / 2;
  const dx = Number(element.getAttribute("x")) - CX;
  const dy = Number(element.getAttribute("y")) - CY;

  return Math.max(
    ...[-1, 1].flatMap((sx) =>
      [-1, 1].map((sy) => Math.hypot(dx + sx * halfWidth, dy + sy * halfHeight))
    )
  );
}

const HOUR_POSITIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

/** The inner end of a quarter marker — the nearest thing on the face to a numeral's outer corner. */
const QUARTER_MARKER_INNER = FACE_RADIUS * 0.84;

/** The tightest clearance any numeral on the ring has to the marker beyond it. */
function tightestMarkerClearance(face: Element): number {
  return Math.min(
    ...HOUR_POSITIONS.map(
      (hour) => QUARTER_MARKER_INNER - numeralCornerReach(find(face, `hour-number-${hour}`)!)
    )
  );
}

function at(hours: number, minutes = 0, seconds = 0): Date {
  return new Date(2026, 7, 15, hours, minutes, seconds);
}

/**
 * Ink reach either side of a line of capitals, as a fraction of font size.
 *
 * `INK_HEIGHT_RATIO`'s 1.2 em is the *em box*, which is what `getBBox` reports and what every
 * radial gate on the band is measured to. Capitals have no descenders, so their real ink is roughly
 * cap height — the same 0.35 em either side `RADIUS.hourNumeralInner`'s comment uses for the
 * numerals, and the correction #78 made to the em-box model. Using the em box here would inflate
 * the box by 4.6 units per side at the indicator's font size and stop it being conservative.
 */
const CAP_INK_HALF_EM = 0.35;

/**
 * A `<text>` element's ink box, as the four corners the renderer would put it at.
 *
 * `text-anchor: middle` and `dominant-baseline: central` centre the glyphs on (x, y). Both
 * dimensions come out *smaller* than the rendered glyphs — height from cap ink rather than the em
 * box, width from `textWidth`, which underestimates two capitals at weight 600 badly (1.2 em
 * against a measured 1.768) — so every overlap found against this box is a real overlap.
 */
function glyphBox(element: Element): { x: number; y: number; width: number; height: number } {
  const fontSize = Number(element.getAttribute("font-size"));
  const width = textWidth(element.textContent ?? "", fontSize);
  const height = fontSize * CAP_INK_HALF_EM * 2;

  return {
    x: Number(element.getAttribute("x")) - width / 2,
    y: Number(element.getAttribute("y")) - height / 2,
    width,
    height,
  };
}

/** The rotation a hand's `transform` carries, in degrees. */
function rotationOf(element: Element): number {
  const match = /rotate\(\s*(-?[\d.]+)/.exec(element.getAttribute("transform") ?? "");
  return match ? Number(match[1]) : 0;
}

type Point = { x: number; y: number };

const corners = (r: { x: number; y: number; width: number; height: number }): Point[] => [
  { x: r.x, y: r.y },
  { x: r.x + r.width, y: r.y },
  { x: r.x + r.width, y: r.y + r.height },
  { x: r.x, y: r.y + r.height },
];

/** Interval a convex polygon projects onto `axis`. */
function project(points: Point[], axis: Point): [number, number] {
  const dots = points.map((p) => p.x * axis.x + p.y * axis.y);
  return [Math.min(...dots), Math.max(...dots)];
}

/**
 * Whether a hand's halo — the rotated stroke rectangle its line sweeps out — shares any area with
 * `box`. A separating-axis test over the two rectangles, so it is exact rather than sampled.
 *
 * Touching edges do not count, matching `rectsOverlap`: a halo grazing the glyph box's boundary
 * erases nothing.
 */
function haloCoversBox(
  halo: Element,
  box: { x: number; y: number; width: number; height: number }
): boolean {
  const angle = (rotationOf(halo) * Math.PI) / 180;
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);
  const halfWidth = Number(halo.getAttribute("stroke-width")) / 2;
  const y1 = Number(halo.getAttribute("y1"));
  const y2 = Number(halo.getAttribute("y2"));

  // The halo, unrotated: a vertical stripe about the dial's centre. `stroke-linecap: round` adds a
  // cap beyond each end, left out because ignoring it can only under-report an overlap.
  const stripe = corners({
    x: CX - halfWidth,
    y: Math.min(y1, y2),
    width: halfWidth * 2,
    height: Math.abs(y2 - y1),
  });

  // The box, brought into the halo's own frame by rotating it back about the centre.
  const glyphs = corners(box).map(({ x, y }) => {
    const dx = x - CX;
    const dy = y - CY;
    return { x: CX + cos * dx + sin * dy, y: CY - sin * dx + cos * dy };
  });

  const axes: Point[] = [
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: cos, y: -sin },
    { x: sin, y: cos },
  ];

  return axes.every((axis) => {
    const [aLow, aHigh] = project(stripe, axis);
    const [bLow, bHigh] = project(glyphs, axis);
    return aLow < bHigh && bLow < aHigh;
  });
}

function find(root: Element, testId: string): Element | null {
  return root.querySelector(`[data-testid="${testId}"]`);
}

describe("clockFace", () => {
  describe("structure", () => {
    const { element } = build(at(10, 10));

    it("draws 48 minute ticks — 60 less the 12 the hour markers occupy", () => {
      expect(element.querySelectorAll("line:not([data-testid])")).toHaveLength(48);
    });

    it.each([
      ["clock-face-bg", 1],
      ["clock-center-dot", 1],
      ["period-indicator", 1],
      ["period-indicator-halo", 1],
      ["hour-hand", 1],
      ["minute-hand", 1],
    ])("draws one %s", (testId, count) => {
      expect(element.querySelectorAll(`[data-testid="${testId}"]`)).toHaveLength(count);
    });

    it("draws a marker and a numeral for each hour", () => {
      for (const hour of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
        expect(find(element, `hour-marker-${hour}`)).not.toBeNull();
        expect(find(element, `hour-number-${hour}`)?.textContent).toBe(String(hour));
      }
    });

    it("weights the quarter markers more heavily than the rest", () => {
      const quarter = Number(find(element, "hour-marker-3")?.getAttribute("stroke-width"));
      const ordinary = Number(find(element, "hour-marker-4")?.getAttribute("stroke-width"));

      expect(quarter).toBeGreaterThan(ordinary);
      expect(quarter).toBeCloseTo(FACE_RADIUS * 0.028, 4);
      expect(ordinary).toBeCloseTo(FACE_RADIUS * 0.015, 4);
    });

    it("scales stroke widths with the dial instead of fixing them in pixels", () => {
      // Guards #14. These were absolute pixel widths while everything else scaled with the face,
      // so enlarging the dial — the entire response to "it cannot be read from there" — made the
      // linework proportionally thinner.
      const widthsAt = (faceRadius: number) => {
        const { element: dial } = clockFace({ faceRadius, cx: CX, cy: CY, time: at(10, 10) });
        return ["clock-face-bg", "hour-marker-3", "hour-marker-4"].map((id) =>
          Number(find(dial, id)?.getAttribute("stroke-width"))
        );
      };

      const small = widthsAt(100);
      const large = widthsAt(400);

      expect(small.every((width) => width > 0)).toBe(true);
      large.forEach((width, index) => expect(width / small[index]).toBeCloseTo(4, 4));
    });

    it("draws the face at exactly the radius it is given", () => {
      // Guards #19: this used to scale the radius down by 0.8 to "leave room for event arcs",
      // room the caller had already subtracted, wasting a ring as wide as the arc band.
      expect(find(element, "clock-face-bg")?.getAttribute("r")).toBe(String(FACE_RADIUS));
      // Literal, not `FACE_RADIUS * 0.035` — that evaluates to 6.720000000000001 in raw
      // floating point. roundCoord exists precisely so rendered attributes are exact.
      expect(find(element, "clock-center-dot")?.getAttribute("r")).toBe("6.72");
    });

    it("uses real SVG attribute names, not the JSX spellings", () => {
      const hand = find(element, "hour-hand");

      expect(hand?.hasAttribute("stroke-width")).toBe(true);
      expect(hand?.hasAttribute("strokeWidth")).toBe(false);
      expect(find(element, "hour-number-1")?.hasAttribute("text-anchor")).toBe(true);
    });
  });

  describe("hand angles", () => {
    it.each([
      ["midnight", at(0, 0), 0, 0],
      ["three o'clock", at(3, 0), 90, 0],
      ["half six — hour hand halfway between 6 and 7", at(6, 30), 195, 180],
      ["quarter to ten", at(9, 45), 292.5, 270],
      ["noon wraps the hour hand back to zero", at(12, 0), 0, 0],
      ["one minute to midnight", at(23, 59), 359.5, 354],
    ])("%s", (_label, time, hourAngle, minuteAngle) => {
      const { element } = build(time);

      expect(find(element, "hour-hand")?.getAttribute("transform")).toBe(
        `rotate(${hourAngle}, ${CX}, ${CY})`
      );
      expect(find(element, "minute-hand")?.getAttribute("transform")).toBe(
        `rotate(${minuteAngle}, ${CX}, ${CY})`
      );
    });
  });

  describe("second hand", () => {
    it("is omitted unless asked for", () => {
      expect(find(build(at(1, 1, 30)).element, "second-hand")).toBeNull();
    });

    it("is drawn and positioned when asked for", () => {
      const { element } = build(at(1, 1, 30), true);

      expect(find(element, "second-hand")?.getAttribute("transform")).toBe(
        `rotate(180, ${CX}, ${CY})`
      );
    });
  });

  describe("hand halos", () => {
    // Guards #44: a hand crossing a filled background (a future timer band) needs a contrasting
    // outline to stay legible, since it otherwise shares its colour with `--card-foreground`.
    it.each(["hour-hand", "minute-hand"])("draws a %s halo wider than the hand, in --card", (id) => {
      const { element } = build(at(6, 30));
      const halo = find(element, `${id}-halo`);
      const hand = find(element, id);

      expect(halo?.getAttribute("stroke")).toBe("var(--card)");
      expect(Number(halo?.getAttribute("stroke-width"))).toBeGreaterThan(
        Number(hand?.getAttribute("stroke-width"))
      );
    });

    it("gives the second hand a halo only when the hand itself is drawn", () => {
      expect(find(build(at(1, 1, 30)).element, "second-hand-halo")).toBeNull();

      const { element } = build(at(1, 1, 30), true);
      expect(find(element, "second-hand-halo")?.getAttribute("stroke")).toBe("var(--card)");
    });

    it("mounts every halo before every hand, so no hand's colour is ever overpainted", () => {
      // Guards a real regression: the hour and minute hands are collinear at the top of every
      // hour, and mounting each halo right next to its own hand let the wider minute halo paint
      // over — and visibly thin — the narrower hour hand for the whole of that minute.
      const { element } = build(at(6, 30), true);
      const children = Array.from(element.children);
      const indexOf = (testId: string) => children.indexOf(find(element, testId) as Element);

      const haloIndices = ["hour-hand-halo", "minute-hand-halo", "second-hand-halo"].map(indexOf);
      const handIndices = ["hour-hand", "minute-hand", "second-hand"].map(indexOf);

      expect(Math.max(...haloIndices)).toBeLessThan(Math.min(...handIndices));
    });

    it("shares geometry and angle with its hand, and follows it on setTime", () => {
      const { element, setTime } = build(at(3, 0), true);

      for (const id of ["hour-hand", "minute-hand", "second-hand"]) {
        const halo = find(element, `${id}-halo`);
        const hand = find(element, id);
        for (const attr of ["x1", "y1", "x2", "y2", "transform"]) {
          expect(halo?.getAttribute(attr)).toBe(hand?.getAttribute(attr));
        }
      }

      setTime(at(9, 45, 30));

      for (const id of ["hour-hand", "minute-hand", "second-hand"]) {
        expect(find(element, `${id}-halo`)?.getAttribute("transform")).toBe(
          find(element, id)?.getAttribute("transform")
        );
      }
    });
  });

  describe("period indicator", () => {
    it.each([
      [at(0, 0), "AM"],
      [at(11, 59), "AM"],
      [at(12, 0), "PM"],
      [at(23, 59), "PM"],
    ])("reads %s as $1", (time, expected) => {
      expect(find(build(time).element, "period-indicator")?.textContent).toBe(expected);
    });

    /**
     * #107. The suite checked that the indicator *said* the right thing and never that it could be
     * read: it was appended before the hands' halos, so a hand crossing it painted `var(--card)`
     * straight over the glyphs and "PM" rendered as "P И" for roughly an hour a day.
     */
    describe("staying readable while a hand crosses it", () => {
      it("is painted after every hand, every halo and the centre dot", () => {
        const { element } = build(at(6, 30), true);
        const children = Array.from(element.children);
        const indexOf = (testId: string) => children.indexOf(find(element, testId) as Element);

        const coverable = [
          "hour-hand-halo",
          "minute-hand-halo",
          "second-hand-halo",
          "hour-hand",
          "minute-hand",
          "second-hand",
          "clock-center-dot",
        ].map(indexOf);

        expect(Math.min(...coverable)).toBeGreaterThanOrEqual(0);
        expect(Math.max(...coverable)).toBeLessThan(indexOf("period-indicator-halo"));
        expect(indexOf("period-indicator-halo")).toBeLessThan(indexOf("period-indicator"));
      });

      /**
       * The property over the whole day, not one sampled hour — the entire finding was that the
       * erasure is time-dependent, so a single time would have passed on `main` at almost any hour
       * chosen. The glyph box uses `textWidth`, which underestimates this string badly (1.2 em
       * against a measured 1.768 em at weight 600), so the box tested is *narrower* than the real
       * one and every crossing it finds is a real one.
       */
      it("is painted later than every halo that crosses its glyphs, at every minute of the day", () => {
        const { element, setTime } = build(at(0, 0), true);
        const children = Array.from(element.children);
        const indexOf = (testId: string) => children.indexOf(find(element, testId) as Element);
        const indicatorIndex = indexOf("period-indicator-halo");
        const halos = ["hour-hand-halo", "minute-hand-halo", "second-hand-halo"].map(
          (id) => [id, find(element, id)!] as const
        );

        const crossed = new Set<string>();
        let crossings = 0;

        // Seconds sweep alongside the minutes so the second hand reaches the indicator too, rather
        // than sitting at twelve o'clock for the whole run.
        for (let minute = 0; minute < 24 * 60; minute += 1) {
          setTime(at(Math.floor(minute / 60), minute % 60, minute % 60));
          const box = glyphBox(find(element, "period-indicator")!);

          for (const [id, halo] of halos) {
            if (!haloCoversBox(halo, box)) continue;
            crossed.add(id);
            crossings += 1;
            expect(indexOf(id)).toBeLessThan(indicatorIndex);
          }
        }

        // Guards the assertion above against passing because nothing ever crosses — the mistake
        // `CLAUDE.md` records as a test encoding the same wrong assumption as the code. #107
        // measures the hour hand alone as obscuring the word for ~21 minutes twice a day.
        expect(crossings).toBeGreaterThan(60);
        expect(crossed).toEqual(new Set(["hour-hand-halo", "minute-hand-halo", "second-hand-halo"]));
      });

      /**
       * The cost side of mounting the label above the hands, and the one the first visual pass on
       * #107 missed: the halo band is a stretch of every hand that gets erased, so a hand *ending*
       * just past it keeps a stub instead of a tip. At the original 0.35 the 1-hour scale's
       * shortened hour hand kept 5.83 units against its own 9.20 of width, and at 06:00 and 18:00
       * all that survived past the label was a detached lozenge.
       *
       * Every hand, both scales — a mode-specific length is exactly what got missed.
       */
      it.each([
        ["12h" as DialScaleId, "hour-hand", 0.045],
        ["12h" as DialScaleId, "minute-hand", 0.028],
        ["12h" as DialScaleId, "second-hand", 0.01],
        ["1h" as DialScaleId, "hour-hand", 0.045],
        ["1h" as DialScaleId, "minute-hand", 0.028],
        ["1h" as DialScaleId, "second-hand", 0.01],
      ])("leaves the %s %s a stub that still reads as a line", (scale, id, widthRatio) => {
        const { element } = build(at(6, 0), true, scale);
        const indicator = find(element, "period-indicator")!;
        const halo = find(element, "period-indicator-halo")!;
        const fontSize = Number(indicator.getAttribute("font-size"));

        // The band the halo wipes out of anything beneath it: the glyphs' cap ink, plus half the
        // stroke on each side — a stroke straddles the outline it follows.
        const bandOuter =
          Number(indicator.getAttribute("y")) -
          CY +
          fontSize * CAP_INK_HALF_EM +
          Number(halo.getAttribute("stroke-width")) / 2;

        const hand = find(element, id)!;
        const tip = CY - Number(hand.getAttribute("y2"));
        const width = FACE_RADIUS * widthRatio;

        // Round caps make a zero-length stub a dot of exactly this width; twice that is the point
        // it reads as elongated instead.
        expect(tip - bandOuter).toBeGreaterThan(2 * width);
      });

      it("gives the word a halo of its own, in `var(--card)`, so it keeps a known ground", () => {
        // The 7:1 `--muted-foreground` gets is stated against `--card` in `Styles.html`. Over a
        // `--card-foreground` hand the same text measures 2.4:1, under the 3:1 floor a graphical
        // object gets — which is why drawing the label after the hands is not on its own a fix.
        const halo = find(build(at(6, 30)).element, "period-indicator-halo");

        expect(halo?.getAttribute("fill")).toBe("var(--card)");
        expect(halo?.getAttribute("stroke")).toBe("var(--card)");
        expect(halo?.getAttribute("stroke-linejoin")).toBe("round");
        expect(find(build(at(6, 30)).element, "period-indicator")?.getAttribute("fill")).toBe(
          "var(--muted-foreground)"
        );
      });

      it("dilates the glyphs by twice a hand's halo, measured per side", () => {
        const { element } = build(at(6, 30));
        const perSide = (el: Element | null, own: number) =>
          Number(el?.getAttribute("stroke-width")) / 2 - own / 2;

        // A stroke straddles the outline it follows, so only half of it becomes dilation. The
        // hands' own halo adds `faceRadius * 0.01` beyond each side of their line.
        const halo = Number(find(element, "period-indicator-halo")?.getAttribute("stroke-width"));

        expect(halo / 2).toBeCloseTo(2 * FACE_RADIUS * 0.01, 4);
        expect(perSide(find(element, "minute-hand-halo"), FACE_RADIUS * 0.028)).toBeCloseTo(
          FACE_RADIUS * 0.01,
          4
        );
      });

      it("matches the indicator's own geometry, so the halo sits exactly under it", () => {
        const { element } = build(at(6, 30));
        const halo = find(element, "period-indicator-halo");
        const text = find(element, "period-indicator");

        for (const attr of ["x", "y", "font-size", "font-weight", "text-anchor", "font-family"]) {
          expect(halo?.getAttribute(attr)).toBe(text?.getAttribute(attr));
        }
        // The word is in the tree twice; only one copy should be announced.
        expect(halo?.getAttribute("aria-hidden")).toBe("true");
      });
    });
  });

  describe("setTime", () => {
    it("re-points the hands without replacing them", () => {
      const { element, setTime } = build(at(3, 0), true);
      const before = {
        hour: find(element, "hour-hand"),
        minute: find(element, "minute-hand"),
        second: find(element, "second-hand"),
      };

      setTime(at(9, 45, 30));

      // Identity matters: the tick loop mutates these nodes 86,400 times a day, and W7's
      // rebuild-only-on-data-change strategy is void if setTime silently replaces them.
      expect(find(element, "hour-hand")).toBe(before.hour);
      expect(find(element, "minute-hand")).toBe(before.minute);
      expect(find(element, "second-hand")).toBe(before.second);

      expect(before.hour?.getAttribute("transform")).toBe(`rotate(292.5, ${CX}, ${CY})`);
      expect(before.minute?.getAttribute("transform")).toBe(`rotate(270, ${CX}, ${CY})`);
      expect(before.second?.getAttribute("transform")).toBe(`rotate(180, ${CX}, ${CY})`);
    });

    it("flips the period indicator across noon", () => {
      const { element, setTime } = build(at(11, 59));
      expect(find(element, "period-indicator")?.textContent).toBe("AM");

      setTime(at(12, 0));

      expect(find(element, "period-indicator")?.textContent).toBe("PM");
    });

    it("flips the indicator's halo with it, so the two never disagree", () => {
      // A halo still reading "AM" under a "PM" no longer fits the glyphs it is there to back, and
      // the mismatch shows as an unbacked letter rather than as wrong text.
      const { element, setTime } = build(at(11, 59));
      const word = () => find(element, "period-indicator")?.textContent;
      const backing = () => find(element, "period-indicator-halo")?.textContent;

      expect(backing()).toBe(word());

      setTime(at(12, 0));

      expect(word()).toBe("PM");
      expect(backing()).toBe("PM");
    });

    it("is safe when there is no second hand", () => {
      const { setTime } = build(at(3, 0));

      expect(() => setTime(at(4, 0))).not.toThrow();
    });
  });
});

/**
 * The 1-hour scale (#34). Both scales stay drawn in either mode — the face never withholds the
 * time — so every assertion here is about *emphasis* moving, not about anything disappearing.
 */
describe("clockFace at the 1-hour scale", () => {
  const { element } = build(at(10, 10), false, "1h");
  const twelveHour = build(at(10, 10)).element;

  it("puts 5-minute values on the outer ring, with 0 rather than 60 at the top", () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(
      (hour) => find(element, `hour-number-${hour}`)?.textContent
    );

    expect(values).toEqual(["5", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55", "0"]);
  });

  /**
   * Every 5-minute value except 0 is two digits, and at three and nine o'clock that second digit
   * adds straight onto the numeral's radius — which took the clearance to the hour marker from
   * 13.65 units to 3.75, and drew the marker as a dash welded to the number. Found by rendering;
   * invisible to every other assertion here, because nothing else compares the two rings.
   */
  it("keeps its two-digit numerals clear of the hour markers", () => {
    expect(tightestMarkerClearance(element)).toBeGreaterThan(tightestMarkerClearance(twelveHour));
  });

  it("pulls the outer ring in to pay for that, and no further", () => {
    const oneHour = radiusOf(find(element, "hour-number-3")!);
    const twelve = radiusOf(find(twelveHour, "hour-number-3")!);

    expect(oneHour).toBeLessThan(twelve);
    expect(twelve - oneHour).toBeLessThan(0.03 * FACE_RADIUS);
  });

  it("adds a second ring carrying the hour numbers", () => {
    for (const hour of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      expect(find(element, `hour-number-inner-${hour}`)?.textContent).toBe(String(hour));
    }
  });

  it("draws no inner ring on the 12-hour dial", () => {
    expect(twelveHour.querySelectorAll('[data-testid^="hour-number-inner-"]')).toHaveLength(0);
  });

  it("pulls the hour numbers inward, clear of the outer ring's ink", () => {
    const inner = find(element, "hour-number-inner-3")!;
    const outer = find(element, "hour-number-3")!;
    const innerSize = Number(inner.getAttribute("font-size"));
    const outerSize = Number(outer.getAttribute("font-size"));

    expect(radiusOf(inner)).toBeLessThan(radiusOf(outer));

    // Digits have no descenders, so their ink is about cap height — 0.35em either side of the
    // baseline rather than the 0.5em the em box claims (#78). The two rings must not touch even
    // measured that way, and the gap is what stops "15" and "3" reading as one number.
    const innerInkEdge = radiusOf(inner) + 0.35 * innerSize;
    const outerInkEdge = radiusOf(outer) - 0.35 * outerSize;
    expect(outerInkEdge - innerInkEdge).toBeGreaterThan(innerSize);
  });

  it("keeps the hour numbers louder than the AM/PM indicator", () => {
    // #70 measures the period indicator as the smallest text the dial asks a room to read. These
    // numerals are the answer to "which hour is it" — the anchor #34 worried about losing — so
    // they may be quiet, but not the quietest thing on the face.
    const numeral = Number(find(element, "hour-number-inner-3")?.getAttribute("font-size"));
    const indicator = Number(find(element, "period-indicator")?.getAttribute("font-size"));

    expect(numeral).toBeGreaterThan(indicator);
  });

  it("greys the hour hand and the hour numbers to the same colour", () => {
    const hand = find(element, "hour-hand")?.getAttribute("stroke");

    expect(hand).toBe("var(--muted-foreground)");
    expect(find(element, "hour-number-inner-3")?.getAttribute("fill")).toBe(hand);
  });

  it("keeps the minute hand at full emphasis", () => {
    expect(find(element, "minute-hand")?.getAttribute("stroke")).toBe("var(--card-foreground)");
  });

  /**
   * Greying the hand alone would re-create the defect `RADIUS` was written to remove: with its
   * numerals pulled inward, an unshortened hour hand crosses them mid-shaft and points past them
   * at nothing. The tip has to stop inside the glyph it indicates, as it does on the 12-hour dial.
   */
  it("shortens the hour hand so it still points at its own numerals", () => {
    const tip = CY - Number(find(element, "hour-hand")?.getAttribute("y2"));
    const numeral = find(element, "hour-number-inner-3")!;
    const inkInnerEdge =
      radiusOf(numeral) - 0.35 * Number(numeral.getAttribute("font-size"));

    expect(tip).toBeLessThan(inkInnerEdge);
    expect(tip).toBeGreaterThan(inkInnerEdge - 0.1 * FACE_RADIUS);

    // And it is genuinely shorter than the 12-hour hand, rather than merely recoloured.
    expect(tip).toBeLessThan(CY - Number(find(twelveHour, "hour-hand")?.getAttribute("y2")));
  });

  it("moves its halo with it, so the shortened hand is still fully backed", () => {
    expect(find(element, "hour-hand-halo")?.getAttribute("y2")).toBe(
      find(element, "hour-hand")?.getAttribute("y2")
    );
  });

  it("emphasises exactly one of the two hands", () => {
    const strokes = ["hour-hand", "minute-hand"].map((id) =>
      find(element, id)?.getAttribute("stroke")
    );

    expect(new Set(strokes).size).toBe(2);
    expect(strokes).toContain("var(--card-foreground)");
    expect(strokes).toContain("var(--muted-foreground)");
  });

  it("still draws every minute tick and hour marker", () => {
    // 6° is one minute at this scale, so the tick track becomes a true minute scale and the hour
    // markers land on the five-minute values. Nothing needed changing — which is worth pinning,
    // because "the ticks now mean something else" is easy to break by tidying them.
    expect(element.querySelectorAll("line:not([data-testid])")).toHaveLength(48);
    for (const hour of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      expect(find(element, `hour-marker-${hour}`)).not.toBeNull();
    }
  });

  it("points both hands at the real time, so the face never withholds it", () => {
    const { element: face } = build(at(10, 45), false, "1h");

    expect(face.querySelector('[data-testid="hour-hand"]')?.getAttribute("transform")).toBe(
      `rotate(322.5, ${CX}, ${CY})`
    );
    expect(face.querySelector('[data-testid="minute-hand"]')?.getAttribute("transform")).toBe(
      `rotate(270, ${CX}, ${CY})`
    );
  });
});

describe("clockFace at the 12-hour scale", () => {
  const { element } = build(at(10, 10));

  /**
   * The counterpart of the 1-hour mode's greyed hour hand, and the half that is easy to lose: the
   * band runs at 0.5° per minute here, so a minute hand sweeping twelve times faster than the arcs
   * is the pointer a viewer cannot usefully read the band against. No test asserted either hand's
   * colour before #34, so both are pinned now.
   */
  it("greys the minute hand and keeps the hour hand at full emphasis", () => {
    expect(find(element, "hour-hand")?.getAttribute("stroke")).toBe("var(--card-foreground)");
    expect(find(element, "minute-hand")?.getAttribute("stroke")).toBe("var(--muted-foreground)");
  });

  it("still numbers the outer ring 1–12", () => {
    for (const hour of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      expect(find(element, `hour-number-${hour}`)?.textContent).toBe(String(hour));
    }
  });
});
