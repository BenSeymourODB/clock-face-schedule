import { describe, expect, it } from "vitest";
import { type CalendarEventFields, mapEvent, resolveEventColor } from "./map-event";

const CALENDAR_COLOR = "#0b8043";
const DEFAULT_COLOR = "#3b82f6";

function fields(overrides: Partial<CalendarEventFields> = {}): CalendarEventFields {
  return {
    id: "abc123@google.com",
    title: "Team Meeting",
    startTime: new Date("2026-08-15T14:00:00Z"),
    endTime: new Date("2026-08-15T15:00:00Z"),
    isAllDay: false,
    colorId: "",
    ...overrides,
  };
}

describe("resolveEventColor", () => {
  it.each([
    ["1", "#a4bdfc"],
    ["5", "#fbd75b"],
    ["10", "#51b749"],
    ["11", "#dc2127"],
  ])("maps Google's ordinal %s to its palette colour", (colorId, expected) => {
    expect(resolveEventColor(colorId, CALENDAR_COLOR)).toBe(expected);
  });

  it("falls back to the calendar's colour when the event has none", () => {
    // getColor() returns an empty string for an event inheriting the calendar default.
    expect(resolveEventColor("", CALENDAR_COLOR)).toBe(CALENDAR_COLOR);
  });

  it.each([
    ["no calendar colour", undefined],
    ["a named colour the dial cannot parse", "rebeccapurple"],
    ["an empty calendar colour", ""],
  ])("falls back to the default given %s", (_label, calendarColor) => {
    expect(resolveEventColor("", calendarColor)).toBe(DEFAULT_COLOR);
  });

  it.each(["0", "12", "99", "banana"])(
    "falls through for the unrecognised ordinal %s rather than rendering nothing",
    (colorId) => {
      expect(resolveEventColor(colorId, CALENDAR_COLOR)).toBe(CALENDAR_COLOR);
    }
  );

  it("prefers the event's own colour over the calendar's", () => {
    expect(resolveEventColor("11", CALENDAR_COLOR)).toBe("#dc2127");
  });
});

describe("mapEvent", () => {
  it("carries the title through untouched", () => {
    // Colour-dot and emoji prefixes are parsed later, on the client — the raw title must survive.
    expect(mapEvent(fields({ title: "🟢 🎮 Game Time" })).title).toBe("🟢 🎮 Game Time");
  });

  it("emits timestamps with an explicit offset", () => {
    const mapped = mapEvent(fields());

    expect(mapped.startDate).toBe("2026-08-15T14:00:00.000Z");
    expect(mapped.endDate).toBe("2026-08-15T15:00:00.000Z");
  });

  it("round-trips to the same instant the calendar reported", () => {
    const startTime = new Date("2026-08-15T14:30:00Z");

    expect(new Date(mapEvent(fields({ startTime })).startDate).getTime()).toBe(
      startTime.getTime()
    );
  });

  it.each([true, false])("carries the all-day flag: %s", (isAllDay) => {
    expect(mapEvent(fields({ isAllDay })).isAllDay).toBe(isAllDay);
  });

  describe("occurrence ids", () => {
    it("distinguishes two occurrences of one recurring event", () => {
      // getId() returns the iCalUID, which every occurrence of a recurrence shares. Ids reach
      // the DOM as textPath fragment references, where a collision makes one arc's title follow
      // another arc's curve.
      const first = mapEvent(fields({ startTime: new Date("2026-08-15T14:00:00Z") }));
      const second = mapEvent(fields({ startTime: new Date("2026-08-15T16:00:00Z") }));

      expect(first.id).not.toBe(second.id);
    });

    it("is stable across refetches, so nothing churns between polls", () => {
      expect(mapEvent(fields()).id).toBe(mapEvent(fields()).id);
    });

    it("still distinguishes different events at the same time", () => {
      const a = mapEvent(fields({ id: "a@google.com" }));
      const b = mapEvent(fields({ id: "b@google.com" }));

      expect(a.id).not.toBe(b.id);
    });
  });
});
