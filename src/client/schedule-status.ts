/**
 * Whether the dial is showing fresh data, and what to say when it is not.
 *
 * A display that has run for a week and briefly cannot reach the server should keep showing the
 * schedule it has, marked as old — a blank dial is worse than a stale one, and on a wall nobody
 * is standing by to retry. The distinction that matters is between *never loaded* and *loaded,
 * now failing*: the first has nothing worth keeping, the second does.
 *
 * Pure, so the transitions can be tested without a clock, a network, or a DOM.
 */

export type ScheduleStatus =
  | { kind: "loading" }
  | { kind: "live"; at: Date }
  | { kind: "stale"; since: Date }
  | { kind: "unavailable"; reason: string };

export type FetchOutcome = { ok: true; at: Date } | { ok: false; reason: string };

export function nextStatus(current: ScheduleStatus, outcome: FetchOutcome): ScheduleStatus {
  if (outcome.ok) return { kind: "live", at: outcome.at };

  switch (current.kind) {
    case "live":
      return { kind: "stale", since: current.at };
    // Already stale: keep the *original* success time. Overwriting it on each failed retry would
    // make the age of the data creep forward and read as fresher than it is.
    case "stale":
      return current;
    default:
      return { kind: "unavailable", reason: outcome.reason };
  }
}

/** Text for the status line, or `null` when there is nothing worth saying. */
export function describeStatus(status: ScheduleStatus): string | null {
  switch (status.kind) {
    case "loading":
      return "Loading schedule…";
    // Working as intended needs no chrome — the display carries no message at all.
    case "live":
      return null;
    case "stale":
      return `Schedule last updated ${status.since.toLocaleTimeString()}`;
    case "unavailable":
      return `Schedule unavailable — ${status.reason}`;
  }
}
