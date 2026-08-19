import { describe, expect, it } from "vitest";

import {
  type ClockEventInput,
  assignRings,
  eventsToClockEvents,
  filterEventsForPeriod,
  getPeriodStart,
  getRollingWindow,
} from "../shared/clock";
import {
  FIXTURE_PERIOD_MINUTES,
  fixtureCopyIndices,
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
  view: { windowStart: Date; windowEnd: Date }
): number {
  const resolved = eventsToClockEvents(
    filterEventsForPeriod(events, view.windowStart, view.windowEnd),
    getPeriodStart(view.windowStart),
    view.windowStart,
    view.windowEnd
  );
  const rings = assignRings(
    resolved.map((event) => ({
      id: event.id,
      startAngle: event.trueStartAngle,
      endAngle: event.trueEndAngle,
    }))
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
    const events = recurringSampleEvents(ANCHOR, view);
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

    expect(inWindow(recurringSampleEvents(ANCHOR, view), view)).toEqual(
      inWindow(sampleEvents(ANCHOR), view)
    );
  });

  it("keeps the window populated a day after load, where a single copy has emptied it", () => {
    // #62: the rolling window walks off a fixture pinned to load-time timestamps.
    const view = windowAtPhase(24 * 60);

    expect(inWindow(sampleEvents(ANCHOR), view)).toHaveLength(0);
    expect(inWindow(recurringSampleEvents(ANCHOR, view), view).length).toBeGreaterThan(5);
  });

  // Nine distinct pictures: no two of these phases are equal modulo the period, so none of them
  // repeats another's dial. 135 and 794 are the first and last minute of the two-copy regime.
  it.each([0, 135, 270, 330, 500, 660, 794, 1000, 1500])(
    "fills the window at phase %i, and never past the depth the fixture was designed for",
    (phase) => {
      const view = windowAtPhase(phase);
      const events = recurringSampleEvents(ANCHOR, view);

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
    const events = recurringSampleEvents(ANCHOR, view);
    const ids = events.map((event) => event.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("z@1");
    expect(recurringSampleEvents(ANCHOR, windowAtPhase(0)).map((event) => event.id)).toContain("z");
  });

  it("repeats a copy's own offsets exactly one period later", () => {
    const base = sampleEvents(ANCHOR);
    const next = recurringSampleEvents(ANCHOR, windowAtPhase(FIXTURE_PERIOD_MINUTES)).filter(
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
    expect(fixtureCopyIndices(ANCHOR, windowAtPhase(0))).toEqual([0]);
  });

  it("holds one copy, then two across a seam, and never more", () => {
    expect(fixtureCopyIndices(ANCHOR, windowAtPhase(120))).toEqual([0]);
    expect(fixtureCopyIndices(ANCHOR, windowAtPhase(400))).toEqual([0, 1]);
    expect(fixtureCopyIndices(ANCHOR, windowAtPhase(900))).toEqual([1]);
  });

  it("is stable inside the two-copy regime, where the poll gate depends on it", () => {
    // main.ts re-emits only when this changes, so churn here would redraw every arc every five
    // minutes. The single-copy regime is the easy case; this is the one worth sampling.
    expect(fixtureCopyIndices(ANCHOR, windowAtPhase(200))).toEqual(
      fixtureCopyIndices(ANCHOR, windowAtPhase(600))
    );
  });

  it("looks back as well as forward, for a window opened before the anchor", () => {
    // Unreachable from main.ts, whose anchor is the load-time window start, but the function is
    // pure and its bounds are symmetric — a one-sided implementation would be wrong here.
    expect(fixtureCopyIndices(ANCHOR, windowAtPhase(-FIXTURE_PERIOD_MINUTES))).toEqual([-1]);
  });

  it("never returns a copy that misses the window entirely", () => {
    for (const phase of [0, 200, 700, 845, 1200, 2535]) {
      const view = windowAtPhase(phase);
      for (const index of fixtureCopyIndices(ANCHOR, view)) {
        const copy = recurringSampleEvents(ANCHOR, view).filter((event) =>
          index === 0 ? !event.id.includes("@") : event.id.endsWith(`@${index}`)
        );
        expect(inWindow(copy, view).length).toBeGreaterThan(0);
      }
    }
  });
});
