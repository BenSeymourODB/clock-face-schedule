import { describe, expect, it } from "vitest";
import { clockFace } from "./clock-face";

const CX = 300;
const CY = 300;
const RADIUS = 240;
/** RADIUS × FACE_RADIUS_RATIO. */
const FACE_RADIUS = 192;

function build(time: Date, showSeconds = false) {
  return clockFace({ radius: RADIUS, cx: CX, cy: CY, time, showSeconds });
}

function at(hours: number, minutes = 0, seconds = 0): Date {
  return new Date(2026, 7, 15, hours, minutes, seconds);
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
      expect(find(element, "hour-marker-3")?.getAttribute("stroke-width")).toBe("3");
      expect(find(element, "hour-marker-4")?.getAttribute("stroke-width")).toBe("1.5");
    });

    it("scales the face with the radius it is given", () => {
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

  describe("period indicator", () => {
    it.each([
      [at(0, 0), "AM"],
      [at(11, 59), "AM"],
      [at(12, 0), "PM"],
      [at(23, 59), "PM"],
    ])("reads %s as $1", (time, expected) => {
      expect(find(build(time).element, "period-indicator")?.textContent).toBe(expected);
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

    it("is safe when there is no second hand", () => {
      const { setTime } = build(at(3, 0));

      expect(() => setTime(at(4, 0))).not.toThrow();
    });
  });
});
