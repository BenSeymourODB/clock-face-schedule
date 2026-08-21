import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type ClockEventInput,
  type ClockPin,
  type DialScale,
  type DialScaleId,
  TWELVE_HOUR_SCALE,
  angleForTime,
  computeDrainFraction,
  createTimeSource,
  dialOrigin,
  dialWindow,
  eventsToClockEvents,
  filterEventsForPeriod
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

/**
 * A refresher on a real `TimeSource`, collecting what it hands the dial.
 *
 * `loadedAt` defaults to a read taken now, which is what a caller constructing the dial and the
 * refresher in one breath would pass. #152's tests pass an earlier one on purpose.
 */
function refresher(pin: ClockPin | null, scale: DialScaleId, loadedAt?: Date) {
  const emissions: ClockEventInput[][] = [];
  const now = createTimeSource(pin);
  const refresh = fixtureRefresher({
    scale,
    pin,
    loadedAt: loadedAt ?? now(),
    now,
    setEvents: (events) => emissions.push(events)
  });

  return { refresh, emissions };
}

/**
 * Which of the emitted arcs the dial would draw mid-drain at `now`, in the terms the renderer
 * decides it in: the drawn set, resolved to *true* (window-clamped) angles, through
 * `computeDrainFraction`. An event clamped to the window's edge has a true angle its raw timestamps
 * do not show, which is why this goes the long way round rather than comparing dates.
 */
function drainingIds(events: ClockEventInput[], now: Date, scale: DialScale): string[] {
  const view = dialWindow(now, scale);
  const drawn = filterEventsForPeriod(events, view.windowStart, view.windowEnd);
  const origin = dialOrigin(view.windowStart, scale);
  const nowAngle = angleForTime(now, origin, scale.periodMinutes);

  return eventsToClockEvents(drawn, origin, view.windowStart, view.windowEnd, scale.periodMinutes)
    .filter(
      (event) =>
        computeDrainFraction(event.trueStartAngle, event.trueEndAngle, nowAngle) !== undefined
    )
    .map((event) => event.id);
}

/** `?now=2026-01-12T04:15&freeze=1` — the clock displaced *and* held. */
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
    { scale, pin: displaced, label: "?now=2026-01-12T04:15&freeze=1" },
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
   * The other half of reading the right clock, and the half a re-emission count cannot see: *which*
   * window the copies were tiled into. A refresher reading real time tiles them into the 15th's
   * window while the dial draws the 12th's, and no count of emissions can tell.
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

  /**
   * Both scale-dependent reads, pinned. Sweeping `SCALES` through the assertions above buys nothing
   * on its own: replacing either `demoFixture(scale)` or `dialScale(scale)` with the literal `"12h"`
   * leaves all 1,289 tests green, and `demoFixture` has no other caller and no spec of its own — so
   * the plumbing that makes the 1-hour mode draw its own fixture in its own window was unchecked
   * while a `SCALES` sweep read as though it were covered.
   *
   * The two halves need different evidence. The fixture shows in the ids, which do not overlap
   * across the two fixtures except for "n" and "w". The window shows in how many copies reach it:
   * both real pairings admit at most two, where the 1-hour fixture inside an 11-hour window admits
   * nine — the state #34 exists to avoid, drawn as full-band arcs continuing past both edges.
   */
  it.each([
    { scale: "12h" as const, own: "d", foreign: "q" },
    { scale: "1h" as const, own: "q", foreign: "d" }
  ])("draws the fixture and the window the scale names — $scale", ({ scale, own, foreign }) => {
    const { refresh, emissions } = refresher(displaced, scale);
    refresh();

    const copies = emissions[0]!.map((event) => event.id.split("@"));
    expect(copies.map(([id]) => id)).toContain(own);
    expect(copies.map(([id]) => id)).not.toContain(foreign);
    expect(new Set(copies.map(([, index]) => index)).size).toBeLessThanOrEqual(2);
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

/**
 * #152 — the load frame, which is a *different* clock question from #80's.
 *
 * #80 is about the refresher reading a clock the dial is not reading at all. This is about it
 * reading the same clock a moment *later*: `main.ts` builds the dial, appends it and measures the
 * label margin before the refresher exists, so an anchor taken here rather than handed in is later
 * than the instant the first frame is drawn at — and the fixture's `"b" 🔴 Deadline` ends exactly on
 * the anchor boundary, so it had not finished yet by the dial's own clock and drew a drain that the
 * next tick removed.
 *
 * Which corrupts the one habit `CLAUDE.md` mandates: a screenshot taken inside the first second
 * shows a seam that is not there afterwards, on the 15.56-unit ring of the four-deep cluster.
 */
describe("fixtureRefresher, on the load frame", () => {
  /**
   * Long enough to be unmissable, short of the 1,000 ms tick that ends the defect. The real delay
   * is an append plus a `getBoundingClientRect`, so this stands in for it rather than measuring it.
   */
  const LOAD_DELAY_MS = 500;

  /**
   * What the refresher hands the dial when the clock has moved on by `delayMs` between the dial's
   * own read and the refresher's construction — the load order `main.ts` has.
   */
  function loadFrame(scale: DialScaleId, delayMs: number): ClockEventInput[] {
    vi.setSystemTime(LOADED_AT);
    const loadedAt = new Date();

    vi.setSystemTime(new Date(LOADED_AT.getTime() + delayMs));
    const { refresh, emissions } = refresher(null, scale, loadedAt);
    refresh();

    return emissions[0]!;
  }

  /**
   * The mechanism, which needs nothing from the fixture's contents: an anchor read from the caller's
   * load instant cannot see the delay, so the emitted events are identical. Read here instead, every
   * timestamp in the set shifts by `LOAD_DELAY_MS` — which is the whole bug, upstream of whether any
   * particular arc happens to straddle a boundary because of it.
   */
  it.each(SCALES)("hands the dial the same fixture however long the load took — %s", (scale) => {
    expect(loadFrame(scale, LOAD_DELAY_MS)).toEqual(loadFrame(scale, 0));
  });

  /**
   * The symptom, in the terms #152 reports it, and 12-hour only — which is a measurement rather than
   * an omission. The race is scale-independent; the *visible* drain it opens is the 12-hour
   * fixture's boundary coincidence. The 1-hour fixture's nearest event to its own anchor boundary is
   * `"p"`, ending `at(3)` against a 5-minute look-behind, so no sub-second delay moves it across
   * `now`.
   *
   * Asserted through `computeDrainFraction`, which is what decides a drain, rather than
   * `hasEventInProgress`, which is the rebuild cadence and disagrees on exactly this boundary
   * (#153): `"b"` ends *at* the frame's `now`, so the strict test reads it as elapsed and the
   * inclusive one would not.
   */
  it("draws one drain on the load frame, where the delayed anchor opened two", () => {
    expect(drainingIds(loadFrame("12h", LOAD_DELAY_MS), LOADED_AT, TWELVE_HOUR_SCALE)).toEqual(["n"]);
  });
});
