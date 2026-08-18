import { describe, expect, it } from "vitest";

import { getRollingWindow } from "../shared/clock";
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

function inWindow(
  events: { startDate: string; endDate: string }[],
  { windowStart, windowEnd }: { windowStart: Date; windowEnd: Date }
): { startDate: string; endDate: string }[] {
  return events.filter(
    (event) =>
      new Date(event.startDate).getTime() < windowEnd.getTime() &&
      new Date(event.endDate).getTime() > windowStart.getTime()
  );
}

function offsetMinutes(iso: string): number {
  return (new Date(iso).getTime() - ANCHOR.getTime()) / MINUTE_MS;
}

/** Peak concurrency, measured between consecutive endpoints rather than at them. */
function peakDepth(events: { startDate: string; endDate: string }[]): number {
  const bounds = events.flatMap((event) => [
    new Date(event.startDate).getTime(),
    new Date(event.endDate).getTime(),
  ]);
  const points = Array.from(new Set(bounds)).sort((a, b) => a - b);
  let peak = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const midpoint = (points[index]! + points[index + 1]!) / 2;
    const depth = events.filter(
      (event) =>
        new Date(event.startDate).getTime() < midpoint &&
        new Date(event.endDate).getTime() > midpoint
    ).length;
    peak = Math.max(peak, depth);
  }
  return peak;
}

describe("FIXTURE_PERIOD_MINUTES", () => {
  it("is the fixture's own span, so consecutive copies abut exactly", () => {
    const base = sampleEvents(ANCHOR);
    const firstStart = Math.min(...base.map((event) => offsetMinutes(event.startDate)));
    const lastEnd = Math.max(...base.map((event) => offsetMinutes(event.endDate)));

    expect(FIXTURE_PERIOD_MINUTES).toBe(lastEnd - firstStart);
  });
});

describe("recurringSampleEvents", () => {
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

  it.each([0, 150, 330, 500, 660, 845, 1000, 1690, 4225])(
    "fills the window at phase %i, and never past the depth the fixture was designed for",
    (phase) => {
      const view = windowAtPhase(phase);
      const visible = inWindow(recurringSampleEvents(ANCHOR, view), view);

      expect(visible.length).toBeGreaterThanOrEqual(10);
      // Three-deep is the authored cluster. A seam that overlapped would manufacture a fourth
      // ring, thinning every arc in it — the defect #70 is about, arrived at by accident.
      expect(peakDepth(visible)).toBeLessThanOrEqual(3);
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

  it("advances as the window walks forward, and is stable between advances", () => {
    // main.ts re-emits only when this changes, so a value that churned would re-render the dial
    // on every poll for nothing.
    expect(fixtureCopyIndices(ANCHOR, windowAtPhase(60))).toEqual(
      fixtureCopyIndices(ANCHOR, windowAtPhase(120))
    );
    expect(fixtureCopyIndices(ANCHOR, windowAtPhase(FIXTURE_PERIOD_MINUTES))).toContain(1);
  });

  it("looks back as well as forward, for a window opened before the anchor", () => {
    expect(fixtureCopyIndices(ANCHOR, windowAtPhase(-FIXTURE_PERIOD_MINUTES))).toContain(-1);
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
