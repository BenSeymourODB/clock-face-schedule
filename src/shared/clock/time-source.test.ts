import { describe, expect, it } from "vitest";
import { createTimeSource, describeClockPin, parseClockPin } from "./time-source";

/** A Tuesday, mid-afternoon, in whatever zone the test runner is in. */
const REFERENCE = new Date(2026, 7, 18, 14, 37, 12, 450);

/** Local wall-clock components, so an assertion says nothing about the runner's zone. */
function parts(date: Date): [number, number, number, number, number, number] {
  return [
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
  ];
}

describe("parseClockPin", () => {
  it("is null when neither parameter is present", () => {
    expect(parseClockPin(null, null, REFERENCE)).toBeNull();
    expect(parseClockPin("", "", REFERENCE)).toBeNull();
    expect(parseClockPin(undefined, undefined, REFERENCE)).toBeNull();
  });

  it.each<[string, number[]]>([
    ["04:15", [2026, 7, 18, 4, 15, 0]],
    ["4:15", [2026, 7, 18, 4, 15, 0]],
    ["04:15:30", [2026, 7, 18, 4, 15, 30]],
    ["00:00", [2026, 7, 18, 0, 0, 0]],
    ["23:59:59", [2026, 7, 18, 23, 59, 59]],
    ["2026-08-18T04:15", [2026, 7, 18, 4, 15, 0]],
    ["2026-08-18 04:15", [2026, 7, 18, 4, 15, 0]],
    ["2026-08-18T04:15:30", [2026, 7, 18, 4, 15, 30]],
    // A different day entirely, which a bare HH:MM cannot reach.
    ["2026-12-25T09:05", [2026, 11, 25, 9, 5, 0]],
  ])("reads %s as a local wall time", (raw, expected) => {
    const pin = parseClockPin(raw, null, REFERENCE);

    expect(pin).not.toBeNull();
    expect(parts(pin!.origin)).toEqual(expected);
  });

  it("drops the sub-second part of the reference, so a pinned time starts on the second", () => {
    expect(parseClockPin("04:15", null, REFERENCE)!.origin.getMilliseconds()).toBe(0);
  });

  it("honours an explicit offset rather than reading it as a local time", () => {
    const pin = parseClockPin("2026-08-18T04:15:00Z", null, REFERENCE);

    expect(pin!.origin.getTime()).toBe(Date.UTC(2026, 7, 18, 4, 15, 0));
  });

  it.each<[string, string]>([
    ["noon", "not a time at all"],
    ["04:15pm", "a suffix the format does not carry"],
    ["25:00", "an hour past the end of the day"],
    ["24:00", "midnight written as the 24th hour"],
    ["04:60", "a minute past the end of the hour"],
    ["04:15:60", "a second past the end of the minute"],
    ["2026-02-30T04:15", "a date the month does not have"],
    ["2026-13-01T04:15", "a month the year does not have"],
    ["04", "an hour with no minutes"],
    ["2026-08-18", "a date with no time"],
  ])("refuses %s (%s)", (raw) => {
    expect(parseClockPin(raw, null, REFERENCE)).toBeNull();
  });

  it("freezes at the reference when freeze is given alone", () => {
    const pin = parseClockPin(null, "1", REFERENCE);

    expect(pin).toEqual({ origin: REFERENCE, frozen: true });
  });

  it("keeps a requested freeze even when the time beside it is unreadable", () => {
    // The two parameters answer different questions, so an unusable `now` must not also discard
    // the freeze — otherwise a typo silently leaves the clock running.
    const pin = parseClockPin("noon", "1", REFERENCE);

    expect(pin).toEqual({ origin: REFERENCE, frozen: true });
  });

  it.each<[string | null, boolean]>([
    [null, false],
    ["", false],
    ["0", false],
    ["true", false],
    ["1", true],
  ])("treats freeze=%s as frozen: %s", (freeze, frozen) => {
    expect(parseClockPin("04:15", freeze, REFERENCE)!.frozen).toBe(frozen);
  });
});

describe("createTimeSource", () => {
  it("reads the real clock when nothing is pinned", () => {
    let real = 1_000;
    const now = createTimeSource(null, () => real);

    expect(now().getTime()).toBe(1_000);
    real = 4_000;
    expect(now().getTime()).toBe(4_000);
  });

  it("holds still when frozen, however far the real clock runs on", () => {
    let real = 1_000;
    const now = createTimeSource({ origin: new Date(500_000), frozen: true }, () => real);

    expect(now().getTime()).toBe(500_000);
    real += 6 * 60 * 60 * 1_000;
    expect(now().getTime()).toBe(500_000);
  });

  it("runs at real speed from its origin when not frozen", () => {
    let real = 1_000;
    const now = createTimeSource({ origin: new Date(500_000), frozen: false }, () => real);

    expect(now().getTime()).toBe(500_000);
    real += 90_000;
    expect(now().getTime()).toBe(590_000);
  });

  it("returns a fresh Date each call, so a caller cannot mutate the origin", () => {
    const origin = new Date(500_000);
    const now = createTimeSource({ origin, frozen: true }, () => 0);

    const first = now();
    first.setFullYear(1999);

    expect(now().getTime()).toBe(500_000);
    expect(origin.getTime()).toBe(500_000);
  });
});

describe("describeClockPin", () => {
  it("says the clock is pinned, and that it is not the real time", () => {
    const origin = new Date(2026, 7, 18, 4, 15, 0);
    const label = describeClockPin({ origin, frozen: false });

    expect(label).toContain("pinned to");
    expect(label).toContain(origin.toLocaleTimeString());
    expect(label).toContain("not the real time");
  });

  it("distinguishes frozen from merely displaced", () => {
    const origin = new Date(2026, 7, 18, 4, 15, 0);

    expect(describeClockPin({ origin, frozen: true })).toContain("frozen at");
    expect(describeClockPin({ origin, frozen: true })).not.toContain("pinned to");
  });
});
