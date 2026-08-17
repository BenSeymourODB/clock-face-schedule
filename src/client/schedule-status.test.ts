import { describe, expect, it } from "vitest";
import {
  type ScheduleStatus,
  describeStatus,
  nextStatus,
} from "./schedule-status";

const FIRST = new Date(2026, 7, 16, 9, 0, 0);
const LATER = new Date(2026, 7, 16, 9, 5, 0);

const failure = { ok: false, reason: "network error" } as const;

describe("nextStatus", () => {
  it.each<[string, ScheduleStatus]>([
    ["loading", { kind: "loading" }],
    ["stale", { kind: "stale", since: FIRST }],
    ["unavailable", { kind: "unavailable", reason: "network error" }],
    ["live", { kind: "live", at: FIRST }],
  ])("a success from %s goes live", (_label, current) => {
    expect(nextStatus(current, { ok: true, at: LATER })).toEqual({ kind: "live", at: LATER });
  });

  it("a failure after a success keeps the data and marks it stale", () => {
    // The whole point: never blank a wall display because one fetch failed.
    expect(nextStatus({ kind: "live", at: FIRST }, failure)).toEqual({
      kind: "stale",
      since: FIRST,
    });
  });

  it("a failure before any success has nothing to keep", () => {
    expect(nextStatus({ kind: "loading" }, failure)).toEqual({
      kind: "unavailable",
      reason: "network error",
    });
  });

  it("holds the original success time across repeated failures", () => {
    // Refreshing `since` on every failed retry would make the data read as fresher than it is,
    // which is the one thing a staleness indicator must not do.
    let status = nextStatus({ kind: "live", at: FIRST }, failure);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      status = nextStatus(status, { ok: false, reason: "still down" });
    }

    expect(status).toEqual({ kind: "stale", since: FIRST });
  });

  it("recovers to live and can go stale again from the newer time", () => {
    const recovered = nextStatus({ kind: "stale", since: FIRST }, { ok: true, at: LATER });

    expect(nextStatus(recovered, failure)).toEqual({ kind: "stale", since: LATER });
  });
});

describe("describeStatus", () => {
  it("says nothing while everything works", () => {
    expect(describeStatus({ kind: "live", at: FIRST })).toBeNull();
  });

  it.each<[ScheduleStatus, string]>([
    [{ kind: "loading" }, "Loading schedule…"],
    [{ kind: "unavailable", reason: "no calendar" }, "Schedule unavailable — no calendar"],
  ])("describes %o", (status, expected) => {
    expect(describeStatus(status)).toBe(expected);
  });

  it("states when stale data was last good, not merely that it is stale", () => {
    // "Stale" alone gives a viewer no way to judge whether to trust what they see.
    expect(describeStatus({ kind: "stale", since: FIRST })).toBe(
      `Schedule last updated ${FIRST.toLocaleTimeString()}`
    );
  });
});
