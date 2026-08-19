import { describe, expect, it } from "vitest";

import {
  type ClockEventInput,
  type DialScale,
  ONE_HOUR_SCALE,
  TWELVE_HOUR_SCALE,
  angleForTime,
  assignRings,
  dialOrigin,
  dialWindow,
  eventsToClockEvents,
  filterEventsForPeriod,
  getRollingWindow,
} from "../shared/clock";
import {
  FIXTURE_PERIOD_MINUTES,
  ONE_HOUR_FIXTURE,
  TWELVE_HOUR_FIXTURE,
  fixtureCopyIndices,
  oneHourSampleEvents,
  recurringSampleEvents,
  sampleEvents,
} from "./sample-events";

const MINUTE_MS = 60 * 1000;

/** An arbitrary anchor with a whole hour on it; the fixture's offsets are pure ms arithmetic. */
const ANCHOR = new Date(2026, 7, 18, 4, 0, 0, 0);

/** What the demo actually draws: the rolling window whose start is the anchor. */
function windowAtPhase(phaseMinutes: number): { windowStart: Date; windowEnd: Date } {
  // The anchor is `now - 3h`, so a phase of `t` minutes past load puts `now` at anchor + 3h + t.
  return getRollingWindow(new Date(ANCHOR.getTime() + (180 + phaseMinutes) * MINUTE_MS));
}

/**
 * The real filter, not a local re-implementation of it. `fixtureCopyIndices` claims to match this
 * predicate's strictness at the seam, so a copy of it here could keep agreeing with the code after
 * the predicate itself had moved.
 */
function inWindow(
  events: ClockEventInput[],
  { windowStart, windowEnd }: { windowStart: Date; windowEnd: Date }
): ClockEventInput[] {
  return filterEventsForPeriod(events, windowStart, windowEnd);
}

function offsetMinutes(iso: string): number {
  return (new Date(iso).getTime() - ANCHOR.getTime()) / MINUTE_MS;
}

/**
 * The deepest cluster the dial would open, measured the way `analog-clock.ts` measures it: through
 * the window clamp and the true angles, not from raw timestamps. `clusterDepth` is what the band
 * is divided by, so it is the number that decides whether an arc is too thin to read.
 */
function peakClusterDepth(
  events: ClockEventInput[],
  view: { windowStart: Date; windowEnd: Date },
  scale: DialScale = TWELVE_HOUR_SCALE
): number {
  // Reads the window's own start as the angle origin *and* as the rebase origin, exactly as
  // `analog-clock.ts` does. Letting `assignRings` default to 0 here would measure a stacking the
  // dial does not draw — that default silently mis-sorts any window reaching past 360°, which is
  // every 1-hour window that wraps (#34).
  const origin = dialOrigin(view.windowStart, scale);
  const resolved = eventsToClockEvents(
    filterEventsForPeriod(events, view.windowStart, view.windowEnd),
    origin,
    view.windowStart,
    view.windowEnd,
    scale.periodMinutes
  );
  const rings = assignRings(
    resolved.map((event) => ({
      id: event.id,
      startAngle: event.trueStartAngle,
      endAngle: event.trueEndAngle,
    })),
    angleForTime(view.windowStart, origin, scale.periodMinutes)
  );
  return Math.max(0, ...[...rings.values()].map((assignment) => assignment.clusterDepth));
}

/**
 * The depth the fixture is authored to — a four-deep cluster, as many rings as `maxRings` opens
 * (see `sample-events.ts`). Measured rather than restated so deepening the fixture cannot leave the
 * bound below it.
 */
const AUTHORED_CLUSTER_DEPTH = peakClusterDepth(sampleEvents(ANCHOR), windowAtPhase(0));

describe("FIXTURE_PERIOD_MINUTES", () => {
  it("is the fixture's own span, so consecutive copies abut exactly", () => {
    const base = sampleEvents(ANCHOR);
    const firstStart = Math.min(...base.map((event) => offsetMinutes(event.startDate)));
    const lastEnd = Math.max(...base.map((event) => offsetMinutes(event.endDate)));

    expect(FIXTURE_PERIOD_MINUTES).toBe(lastEnd - firstStart);
    // A period of zero would make the copy-index loop run from -Infinity, hanging the browser.
    expect(FIXTURE_PERIOD_MINUTES).toBeGreaterThan(0);
  });
});

describe("recurringSampleEvents", () => {
  it("abuts consecutive copies exactly — no gap, and no overlap", () => {
    // The load-bearing property, and the one the period is chosen for. Asserted on generated copies
    // rather than on the period's formula, which would only restate the implementation: at P = 800
    // every other test in this file still passes while each seam overlaps by 45 minutes.
    // Mid-seam, where both copies are emitted — a phase where one has already left says nothing
    // about how the two meet.
    const view = windowAtPhase(400);
    const events = recurringSampleEvents(TWELVE_HOUR_FIXTURE, ANCHOR, view);
    const copy = (suffix: string) =>
      events.filter((event) => (suffix === "" ? !event.id.includes("@") : event.id.endsWith(suffix)));

    const lastEndOfFirst = Math.max(...copy("").map((event) => offsetMinutes(event.endDate)));
    const firstStartOfNext = Math.min(...copy("@1").map((event) => offsetMinutes(event.startDate)));

    expect(copy("").length).toBeGreaterThan(0);
    expect(firstStartOfNext).toBe(lastEndOfFirst);
  });

  it("draws exactly what a single copy drew at load, with the same ids", () => {
    // The whole point: every screenshot this repo has judged the fixture by is still valid. A
    // period other than the fixture's own span would pull a neighbouring copy into this window.
    const view = windowAtPhase(0);

    expect(inWindow(recurringSampleEvents(TWELVE_HOUR_FIXTURE, ANCHOR, view), view)).toEqual(
      inWindow(sampleEvents(ANCHOR), view)
    );
  });

  it("keeps the window populated a day after load, where a single copy has emptied it", () => {
    // #62: the rolling window walks off a fixture pinned to load-time timestamps.
    const view = windowAtPhase(24 * 60);

    expect(inWindow(sampleEvents(ANCHOR), view)).toHaveLength(0);
    expect(inWindow(recurringSampleEvents(TWELVE_HOUR_FIXTURE, ANCHOR, view), view).length).toBeGreaterThan(5);
  });

  // Nine distinct pictures: no two of these phases are equal modulo the period, so none of them
  // repeats another's dial. 135 and 794 are the first and last minute of the two-copy regime.
  it.each([0, 135, 270, 330, 500, 660, 794, 1000, 1500])(
    "fills the window at phase %i, and never past the depth the fixture was designed for",
    (phase) => {
      const view = windowAtPhase(phase);
      const events = recurringSampleEvents(TWELVE_HOUR_FIXTURE, ANCHOR, view);

      expect(inWindow(events, view).length).toBeGreaterThanOrEqual(10);
      // Measured against the authored cluster rather than a literal: a seam that overlapped would
      // open a ring past it, thinning every arc in that cluster — the defect #70 is about, arrived
      // at by accident. Deriving the bound is what keeps it honest when the fixture is deepened,
      // which is how a hard-coded 3 outlived the three-deep cluster it was written for.
      expect(peakClusterDepth(events, view)).toBeLessThanOrEqual(AUTHORED_CLUSTER_DEPTH);
    }
  );

  it("gives every copy distinct ids, leaving copy 0's bare", () => {
    // Ids reach the DOM as data-testid="event-arc-<id>", so a duplicate would collide there and a
    // renamed copy-0 id would break every existing reference to the fixture.
    const view = windowAtPhase(FIXTURE_PERIOD_MINUTES);
    const events = recurringSampleEvents(TWELVE_HOUR_FIXTURE, ANCHOR, view);
    const ids = events.map((event) => event.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("z@1");
    expect(recurringSampleEvents(TWELVE_HOUR_FIXTURE, ANCHOR, windowAtPhase(0)).map((event) => event.id)).toContain("z");
  });

  it("repeats a copy's own offsets exactly one period later", () => {
    const base = sampleEvents(ANCHOR);
    const next = recurringSampleEvents(TWELVE_HOUR_FIXTURE, ANCHOR, windowAtPhase(FIXTURE_PERIOD_MINUTES)).filter(
      (event) => event.id.endsWith("@1")
    );

    expect(next).toHaveLength(base.length);
    for (const event of next) {
      const original = base.find((candidate) => `${candidate.id}@1` === event.id);
      expect(original).toBeDefined();
      expect(offsetMinutes(event.startDate) - offsetMinutes(original!.startDate)).toBe(
        FIXTURE_PERIOD_MINUTES
      );
      expect(offsetMinutes(event.endDate) - offsetMinutes(original!.endDate)).toBe(
        FIXTURE_PERIOD_MINUTES
      );
    }
  });
});

describe("fixtureCopyIndices", () => {
  it("returns 0 alone at load — the neighbours do not reach the window", () => {
    expect(fixtureCopyIndices(TWELVE_HOUR_FIXTURE, ANCHOR, windowAtPhase(0))).toEqual([0]);
  });

  it("holds one copy, then two across a seam, and never more", () => {
    expect(fixtureCopyIndices(TWELVE_HOUR_FIXTURE, ANCHOR, windowAtPhase(120))).toEqual([0]);
    expect(fixtureCopyIndices(TWELVE_HOUR_FIXTURE, ANCHOR, windowAtPhase(400))).toEqual([0, 1]);
    expect(fixtureCopyIndices(TWELVE_HOUR_FIXTURE, ANCHOR, windowAtPhase(900))).toEqual([1]);
  });

  it("is stable inside the two-copy regime, where the poll gate depends on it", () => {
    // main.ts re-emits only when this changes, so churn here would redraw every arc every five
    // minutes. The single-copy regime is the easy case; this is the one worth sampling.
    expect(fixtureCopyIndices(TWELVE_HOUR_FIXTURE, ANCHOR, windowAtPhase(200))).toEqual(
      fixtureCopyIndices(TWELVE_HOUR_FIXTURE, ANCHOR, windowAtPhase(600))
    );
  });

  it("looks back as well as forward, for a window opened before the anchor", () => {
    // Unreachable from main.ts, whose anchor is the load-time window start, but the function is
    // pure and its bounds are symmetric — a one-sided implementation would be wrong here.
    expect(fixtureCopyIndices(TWELVE_HOUR_FIXTURE, ANCHOR, windowAtPhase(-FIXTURE_PERIOD_MINUTES))).toEqual([-1]);
  });

  it("never returns a copy that misses the window entirely", () => {
    for (const phase of [0, 200, 700, 845, 1200, 2535]) {
      const view = windowAtPhase(phase);
      for (const index of fixtureCopyIndices(TWELVE_HOUR_FIXTURE, ANCHOR, view)) {
        const copy = recurringSampleEvents(TWELVE_HOUR_FIXTURE, ANCHOR, view).filter((event) =>
          index === 0 ? !event.id.includes("@") : event.id.endsWith(`@${index}`)
        );
        expect(inWindow(copy, view).length).toBeGreaterThan(0);
      }
    }
  });
});

/**
 * The 1-hour fixture tiles too (#34), and it is the fixture that needs to.
 *
 * The 12-hour window is eleven hours wide against an 845-minute fixture, so one copy survives about
 * thirteen hours. The 1-hour window is **55 minutes** against a 78-minute fixture: a single copy
 * leaves the elapsed arc behind in about three minutes and empties the dial inside the hour. The
 * same battery, because none of the properties are cheaper here for being smaller.
 */
describe("the 1-hour fixture, recurring", () => {
  /** The 1-hour anchor is `now − 5min`, so a phase of `t` puts `now` at anchor + 5 + t. */
  function view(phaseMinutes: number): { windowStart: Date; windowEnd: Date } {
    return dialWindow(
      new Date(ANCHOR.getTime() + (ONE_HOUR_SCALE.lookbehindMinutes + phaseMinutes) * MINUTE_MS),
      ONE_HOUR_SCALE
    );
  }

  const events = (phase: number) => recurringSampleEvents(ONE_HOUR_FIXTURE, ANCHOR, view(phase));

  const AUTHORED_DEPTH = peakClusterDepth(
    oneHourSampleEvents(ANCHOR),
    view(0),
    ONE_HOUR_SCALE
  );

  it("takes its period from its own span, not the other fixture's", () => {
    const base = oneHourSampleEvents(ANCHOR);
    const firstStart = Math.min(...base.map((event) => offsetMinutes(event.startDate)));
    const lastEnd = Math.max(...base.map((event) => offsetMinutes(event.endDate)));

    expect(ONE_HOUR_FIXTURE.periodMinutes).toBe(lastEnd - firstStart);
    expect(ONE_HOUR_FIXTURE.periodMinutes).toBeGreaterThan(0);
    expect(ONE_HOUR_FIXTURE.periodMinutes).not.toBe(FIXTURE_PERIOD_MINUTES);
  });

  it("abuts consecutive copies exactly — no gap, and no overlap", () => {
    const drawn = events(40);
    const copy = (suffix: string) =>
      drawn.filter((event) =>
        suffix === "" ? !event.id.includes("@") : event.id.endsWith(suffix)
      );

    expect(copy("").length).toBeGreaterThan(0);
    expect(Math.min(...copy("@1").map((event) => offsetMinutes(event.startDate)))).toBe(
      Math.max(...copy("").map((event) => offsetMinutes(event.endDate)))
    );
  });

  it("draws exactly what a single copy drew at load, with the same ids", () => {
    expect(inWindow(events(0), view(0))).toEqual(inWindow(oneHourSampleEvents(ANCHOR), view(0)));
  });

  /**
   * How fast a single copy decays, measured rather than asserted from the period: nine arcs at
   * load, eight three minutes later once the elapsed one has gone, **one** by fifty minutes, and
   * none at seventy. That is the state a wall left in demo mode would sit in while still captioned
   * "Sample events", and it is the reason this fixture recurs rather than being left anchored.
   */
  it.each([
    [3, 8],
    [50, 1],
    [70, 0],
    [24 * 60, 0],
  ])("has %i-minute-old single copy down to %i arcs, where the tiling does not", (phase, left) => {
    expect(inWindow(oneHourSampleEvents(ANCHOR), view(phase))).toHaveLength(left);
    expect(inWindow(events(phase), view(phase)).length).toBeGreaterThan(3);
  });

  /**
   * Tiling restores the *states*, not the individual arcs — `p` itself does not come back for
   * another 78 minutes, and asserting that it did would have been asserting a thing this design
   * does not do. What matters is that a viewer arriving at an arbitrary minute still finds the
   * three states the fixture exists to show, rather than only someone who reloads.
   *
   * Measured across three whole periods: something is in view at every minute, an in-progress arc
   * at 216 of 234, an elapsed one at 114 — never absent for longer than 17 minutes at a stretch.
   */
  it("keeps every state reachable, not just present at load", () => {
    const states = (phase: number) => {
      const now = new Date(ANCHOR.getTime() + (ONE_HOUR_SCALE.lookbehindMinutes + phase) * MINUTE_MS);
      const drawn = inWindow(events(phase), view(phase));
      return {
        drawn: drawn.length,
        elapsed: drawn.filter((event) => new Date(event.endDate) <= now).length,
        running: drawn.filter(
          (event) => new Date(event.startDate) <= now && now < new Date(event.endDate)
        ).length,
      };
    };

    // At load, all three states at once — #76 asks for the draining one, #66 for the trio together.
    expect(states(0)).toMatchObject({ elapsed: 1, running: 1 });
    expect(states(0).drawn).toBe(9);

    const sampled = Array.from({ length: ONE_HOUR_FIXTURE.periodMinutes * 3 }, (_, phase) =>
      states(phase)
    );

    expect(sampled.every((state) => state.drawn >= 4)).toBe(true);
    expect(sampled.filter((state) => state.elapsed > 0).length).toBeGreaterThan(sampled.length / 3);
    expect(sampled.filter((state) => state.running > 0).length).toBeGreaterThan(
      (sampled.length * 3) / 4
    );
  });

  /**
   * `fixtureCopyIndices` returns candidate copies rather than claiming each is drawn, because a
   * window narrower than a fixture's largest internal gap could be handed a copy with nothing in
   * view. This fixture is the case that makes the caution concrete — 55-minute window — and then
   * defuses it, its largest internal gap being one minute.
   */
  it("never returns a copy that misses the window entirely", () => {
    for (const phase of [0, 20, 40, 78, 100, 156, 300, 1440]) {
      for (const index of fixtureCopyIndices(ONE_HOUR_FIXTURE, ANCHOR, view(phase))) {
        const copy = events(phase).filter((event) =>
          index === 0 ? !event.id.includes("@") : event.id.endsWith(`@${index}`)
        );
        expect(inWindow(copy, view(phase)).length).toBeGreaterThan(0);
      }
    }
  });

  it.each([0, 20, 40, 60, 78, 100, 156, 300, 1440])(
    "fills the window at phase %i, and never past the depth the fixture was designed for",
    (phase) => {
      expect(inWindow(events(phase), view(phase)).length).toBeGreaterThanOrEqual(4);
      expect(peakClusterDepth(events(phase), view(phase), ONE_HOUR_SCALE)).toBeLessThanOrEqual(
        AUTHORED_DEPTH
      );
    }
  );

  it("gives every copy distinct ids, leaving copy 0's bare", () => {
    const ids = events(ONE_HOUR_FIXTURE.periodMinutes).map((event) => event.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("p@1");
    expect(events(0).map((event) => event.id)).toContain("p");
  });

  it("is stable between polls inside the two-copy regime", () => {
    // main.ts re-emits only when this changes, and the 1-hour window crosses a seam every 78
    // minutes rather than every fourteen hours — so churn here would redraw every arc far more
    // often than on the 12-hour dial.
    expect(fixtureCopyIndices(ONE_HOUR_FIXTURE, ANCHOR, view(20))).toEqual(
      fixtureCopyIndices(ONE_HOUR_FIXTURE, ANCHOR, view(40))
    );
  });
});
