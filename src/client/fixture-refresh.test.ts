import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type ClockEventInput,
  type ClockPin,
  type DialScaleId,
  createTimeSource
} from "../shared/clock";
import { fixtureRefresher } from "./fixture-refresh";

/**
 * The real clock at load. Deliberately hours away from the pinned time below, so an emission
 * anchored to the wrong one of the two is a different copy set rather than a coincidence.
 */
const LOADED_AT = new Date(2026, 0, 15, 9, 0, 0);

/**
 * What `?now=2026-01-12T04:15` resolves to — README's times-table pin, on an *earlier day*.
 *
 * The day matters. A displaced pin anchors the fixture at midnight, and midnight of today is the
 * same instant whichever clock is read, so a same-day pin cannot tell the two apart: the 12-hour
 * fixture's copy set is `[0, 1]` from either window. Three days back, the copy the pin asks for
 * lands on the 12th and the copy real time asks for lands on the 15th.
 */
const PINNED_AT = new Date(2026, 0, 12, 4, 15, 0);

const HOUR_MS = 60 * 60 * 1_000;

/**
 * Fake system time rather than an injected real clock, and that is the point rather than a
 * convenience: `createTimeSource` already takes a `readRealClock`, but an injection cannot fail on
 * the regression this file exists to catch. A literal `new Date()` inside the refresher would ignore
 * the injected clock, and real time does not measurably advance during a test — so the broken code
 * would emit the same set twice and pass. Faking the system clock is what makes `new Date()` move.
 */
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(LOADED_AT);
});

afterEach(() => {
  vi.useRealTimers();
});

/** A refresher on a real `TimeSource`, collecting what it hands the dial. */
function refresher(pin: ClockPin | null, scale: DialScaleId) {
  const emissions: ClockEventInput[][] = [];
  const refresh = fixtureRefresher({
    scale,
    pin,
    now: createTimeSource(pin),
    setEvents: (events) => emissions.push(events)
  });

  return { refresh, emissions };
}

/** `?now=04:15&freeze=1` — the clock displaced *and* held. */
const displaced: ClockPin = { origin: PINNED_AT, frozen: true, displaced: true };

/**
 * `?freeze=1` alone — the real clock held where it stood, which #80 names as the quieter half: the
 * origin is real time, so nothing about the picture looks pinned, and the copy set must still hold.
 */
const held: ClockPin = { origin: LOADED_AT, frozen: true, displaced: false };

const SCALES: DialScaleId[] = ["12h", "1h"];

describe("fixtureRefresher, under a frozen clock", () => {
  /**
   * #80's assertion, in the terms the issue states it: the same copy set twice, however much real
   * time passes between the two calls. 14 hours is past the point a single 12-hour copy walks out of
   * the window, and fifteen window-widths on the 1-hour dial; 40 days is there to make the failure
   * unmissable rather than marginal.
   */
  it.each(SCALES.flatMap((scale) => [
    { scale, pin: displaced, label: "?now=04:15&freeze=1" },
    { scale, pin: held, label: "?freeze=1" }
  ]))("emits once and never again — $scale, $label", ({ scale, pin }) => {
    const { refresh, emissions } = refresher(pin, scale);

    refresh();
    expect(emissions).toHaveLength(1);

    vi.setSystemTime(new Date(LOADED_AT.getTime() + 14 * HOUR_MS));
    refresh();
    vi.setSystemTime(new Date(LOADED_AT.getTime() + 40 * 24 * HOUR_MS));
    refresh();

    expect(emissions).toHaveLength(1);
  });

  /**
   * The other half of reading the right clock, and the half a re-emission count cannot see: the
   * fixture has to land on the day the pin names. `?now=` takes a date, a displaced pin anchors the
   * fixture at that day's midnight, and 🟡 Lunch sits 4h30 along it — so a refresher reading real
   * time puts this arc on the 15th while the dial draws the 12th.
   */
  it.each(SCALES)("lands the fixture beside the pinned instant, not beside today — %s", (scale) => {
    const { refresh, emissions } = refresher(displaced, scale);
    refresh();

    // A copy reaches at most a fixture-span past the window it was tiled into, so everything
    // emitted sits within a day of the pin. The real clock is three days away, so anything anchored
    // to it lands three days out — the failure this is here to name.
    for (const event of emissions[0]!) {
      const from = Math.abs(new Date(event.startDate).getTime() - PINNED_AT.getTime());
      expect(from / (24 * HOUR_MS), `${event.id} starts ${event.startDate}`).toBeLessThan(1);
    }
  });

  it("anchors copy 0 at the pinned day's midnight, keeping the bare ids everything names", () => {
    const { refresh, emissions } = refresher(displaced, "12h");
    refresh();

    // 🟡 Lunch is 4h30 along the fixture, and a displaced pin anchors at midnight — so it draws at
    // 04:30 on the 12th. Reading real time would put it on the 15th.
    const lunch = emissions[0]!.find((event) => event.id === "d");
    const start = new Date(lunch?.startDate ?? "");
    expect([start.getFullYear(), start.getMonth(), start.getDate()]).toEqual([2026, 0, 12]);
    expect([start.getHours(), start.getMinutes()]).toEqual([4, 30]);
  });
});

describe("fixtureRefresher, under a running clock", () => {
  it("hands the dial a later copy once the window has walked onto one", () => {
    const { refresh, emissions } = refresher(null, "12h");
    refresh();

    // Past the ~13 hours a single 12-hour copy survives (#62), so the set has to have changed.
    vi.setSystemTime(new Date(LOADED_AT.getTime() + 14 * HOUR_MS));
    refresh();

    expect(emissions).toHaveLength(2);
    expect(emissions[1]!.some((event) => event.id.includes("@"))).toBe(true);
  });

  it("stays quiet while the copy set is unchanged, since setEvents redraws every arc", () => {
    const { refresh, emissions } = refresher(null, "12h");
    refresh();

    vi.setSystemTime(new Date(LOADED_AT.getTime() + 60_000));
    refresh();

    expect(emissions).toHaveLength(1);
  });
});
