/**
 * The display.
 *
 * Mounts the dial, ticks it, and polls the accessing user's calendar. The diagnostic panels from
 * the scaffold survive behind `?check=1` — a smart board still has to be checked for a colour
 * emoji font and a working bridge, and that check has to happen on the device.
 */
import {
  type ClockEventInput,
  type DialScaleId,
  createTimeSource,
  describeClockPin,
  describePinnedInstant,
  getFetchWindow,
  getPeriodBounds,
  parseDialScaleId,
} from "../shared/clock";
import { decodePreferences, encodePreferences } from "../shared/preferences";
import { readClockPin } from "./clock-pin";
import { fixtureRefresher } from "./fixture-refresh";
import { type PreferenceStore, preferenceStore, readPreferenceWire } from "./preferences";
import { analogClock } from "./render/analog-clock";
import { type ScheduleStatus, describeStatus, nextStatus } from "./schedule-status";

const TICK_INTERVAL_MS = 1_000;
const POLL_INTERVAL_MS = 5 * 60 * 1_000;

/**
 * Events are fetched for the dial's rolling window (#25) and the whole calendar day (#37, for
 * #36's benefit), each widened by this many hours. The margin covers the time between polls: the
 * rolling window moves continuously, so without it the leading edge would outrun the last fetch
 * by however long it has been since. See `getFetchWindow`.
 */
const FETCH_MARGIN_HOURS = 1;

const mount = document.querySelector("#dial");

/**
 * The dial's notion of "now", read through one seam so `?now` / `?freeze` have one place to apply
 * and every time-dependent state is reachable on purpose rather than by luck (#72).
 */
const clockPin = readClockPin(
  mount instanceof HTMLElement ? mount : null,
  window.location.search,
  new Date()
);
const now = createTimeSource(clockPin);

/** google.script.run is callback-based; everything downstream wants to await. */
function callServer<T>(name: string, ...args: unknown[]): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const runner = google.script.run
      .withSuccessHandler((value) => resolve(value as T))
      .withFailureHandler(reject);

    const fn = runner[name] as ((...args: unknown[]) => void) | undefined;
    if (typeof fn !== "function") {
      // Not a network failure: google.script.run's method list is generated from a static scan
      // of top-level declarations, so a missing name means the build footer did not emit one.
      reject(new Error(`no server function named "${name}" — check the build footer`));
      return;
    }
    fn.apply(runner, args);
  });
}

function fetchWindow(): Promise<ClockEventInput[]> {
  const { windowStart, windowEnd } = getFetchWindow(now(), FETCH_MARGIN_HOURS);

  return callServer<ClockEventInput[]>(
    "getEvents",
    windowStart.toISOString(),
    windowEnd.toISOString()
  );
}

/**
 * The templated attribute wins over the query string, so the deployed app honours a stored
 * preference while the server-less preview can still be pointed at either scale by hand.
 */
function chosenScale(mount: Element): DialScaleId {
  const templated = mount instanceof HTMLElement ? mount.dataset["scale"] : undefined;
  if (templated) return parseDialScaleId(templated);

  return parseDialScaleId(new URLSearchParams(window.location.search).get("scale"));
}

/**
 * Preferences as `doGet` left them, with nothing on screen waiting for a save.
 *
 * A failed save is a log line rather than a status-line failure: the status line is the schedule's,
 * and a display that cannot remember a setting is still showing the right time with the right
 * events on it.
 *
 * The bridge call is *returned* rather than fired, which is what lets the store keep one write in
 * flight at a time (#84) — two `google.script.run` calls have no ordering between them, so the
 * store needs to know when one is over. The log line rethrows rather than swallowing: the store
 * drains on a rejection just as it does on a success, so this changes no behaviour today, but a
 * promise that only ever resolves would report a refused write as a stored one — and #84's other
 * remedy, reconciling against the wire `savePreferences` echoes back, needs the truth.
 */
function displayPreferences(mount: Element): PreferenceStore {
  return preferenceStore({
    wire: readPreferenceWire(mount),
    save: (wire) =>
      callServer<string>("savePreferences", wire).catch((error: Error) => {
        console.warn(`preference not saved — ${error.message}`);
        throw error;
      })
  });
}

function startDisplay(): void {
  const statusLine = document.querySelector("#status");
  if (!mount) return;

  const preferences = displayPreferences(mount);
  const scale = chosenScale(mount);

  const clock = analogClock({
    events: [],
    showSeconds: preferences.get().showSeconds,
    time: now(),
    scale
  });
  mount.append(clock.element);

  // Hands before data. A google.script.run round trip runs 0.5–2s and the server cache does not
  // help a cold start, so the wall shows a working clock rather than an empty panel.
  window.setInterval(() => clock.setTime(now()), TICK_INTERVAL_MS);

  /**
   * Standing notices, ahead of whatever the schedule has to say. A pinned clock has to announce
   * itself for the reason demo mode does: a wall showing a time that is not the time is worse than
   * one showing invented events, and worse still if it looks ordinary.
   */
  const notices = clockPin ? [describeClockPin(clockPin, new Date())] : [];

  function setStatusText(text: string | null): void {
    if (!statusLine) return;
    const parts = text === null ? notices : notices.concat([text]);
    statusLine.textContent = parts.join(" · ");
    statusLine.toggleAttribute("hidden", parts.length === 0);
  }

  /**
   * Sample events instead of a calendar, for judging legibility on the display itself.
   *
   * Set by `?demo=1` on the deployed app, and always on in the local preview, which has no server
   * to ask. Deliberately says so on screen: a wall left in this mode must not be mistaken for a
   * real schedule, and the whole point of the mode is that someone is standing in front of it.
   */
  if (mount instanceof HTMLElement && mount.dataset["demo"] === "1") {
    // Handed the same `now` the tick above reads, which is the whole of what `fixture-refresh.ts`
    // exists to make checkable: a pinned dial whose copy set kept moving would empty itself (#80).
    const refreshFixture = fixtureRefresher({
      scale,
      pin: clockPin,
      now,
      setEvents: (events) => clock.setEvents(events)
    });

    refreshFixture();
    setStatusText("Sample events — not a real calendar");
    window.setInterval(refreshFixture, POLL_INTERVAL_MS);
    return;
  }

  let status: ScheduleStatus = { kind: "loading" };

  function showStatus(): void {
    setStatusText(describeStatus(status));
  }

  async function refresh(): Promise<void> {
    try {
      clock.setEvents(await fetchWindow());
      status = nextStatus(status, { ok: true, at: now() });
    } catch (error) {
      // Deliberately does not touch the dial: whatever it is showing stays up, marked old.
      status = nextStatus(status, { ok: false, reason: (error as Error).message });
    }
    showStatus();
  }

  showStatus();
  void refresh();
  window.setInterval(() => void refresh(), POLL_INTERVAL_MS);
}

// ---------------------------------------------------------------------------
// Diagnostics — rendered only when doGet was called with ?check=1.
// ---------------------------------------------------------------------------

interface Pong {
  serverTime: string;
  timeZone: string;
}

type RowState = "ok" | "note" | "fail";

function addRow(list: Element, label: string, value: string, state: RowState): void {
  const term = document.createElement("dt");
  term.textContent = label;

  const description = document.createElement("dd");
  description.textContent = value;
  description.dataset["state"] = state;

  list.append(term, description);
}

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "unknown";
  }
}

/**
 * Preferences, checked on the device rather than on a workstation: what arrived in the page, and
 * whether the store is reachable through the bridge at all.
 *
 * **Deliberately read-only.** An earlier version sent the resolved values back to prove the write
 * path, which is a no-op in content and a one-way change in provenance: it copies the deployment's
 * script-store defaults into the viewer's own store, after which they stop tracking the deployment
 * and nothing here can unset them (#83). Sending an empty patch exercises the entry point, the patch
 * parser and the resolution order without storing anything. Until #47 exists the write path has no
 * production caller anyway, so there is nothing to check that a spec cannot.
 */
async function checkPreferences(list: Element): Promise<void> {
  const wire = readPreferenceWire(document.querySelector("#dial"));

  if (wire === null) {
    // The attribute is emitted whatever the conditions are, so its absence means templating broke.
    addRow(list, "preferences", "no data-preferences on the mount", "fail");
    return;
  }
  addRow(list, "preferences", wire === "" ? "none stored — using defaults" : wire, "ok");

  const templated = encodePreferences(decodePreferences(wire));
  try {
    const resolved = await callServer<string>("savePreferences", "");
    // A mismatch is worth seeing rather than hiding: the page and the store disagreeing means the
    // display is showing something other than what a reload would give it.
    addRow(
      list,
      "preference store",
      resolved === templated ? "reachable, and agrees with the page" : `reachable, but holds ${resolved}`,
      resolved === templated ? "ok" : "note"
    );
  } catch (error) {
    addRow(list, "preference store", `unreachable — ${(error as Error).message}`, "fail");
  }
}

async function renderDiagnostics(list: Element): Promise<void> {
  list.textContent = "";
  const localZone = browserTimeZone();

  try {
    const pong = await callServer<Pong>("ping");
    addRow(list, "server time", pong.serverTime, "ok");
    addRow(list, "script timezone", pong.timeZone, "ok");
    // A mismatch is not a failure — ADR 0005 makes the browser authoritative — but it means the
    // manifest timeZone is wrong for wherever this display lives.
    addRow(
      list,
      "browser timezone",
      localZone === pong.timeZone ? localZone : `${localZone} — manifest says ${pong.timeZone}`,
      localZone === pong.timeZone ? "ok" : "note"
    );
  } catch (error) {
    addRow(list, "server bridge", `unreachable — ${(error as Error).message}`, "fail");
    addRow(list, "browser timezone", localZone, "ok");
  }

  // The device's own clock, deliberately not the dial's: this panel exists to find a display whose
  // clock is wrong, and a pin would mask exactly that. The pin gets its own row instead, in the
  // same format as the row above so the two can be read against each other. The status line's
  // wording is not reused here — it names the time a second time, and the row label already says
  // what this is.
  addRow(list, "browser time", new Date().toString(), "ok");
  if (clockPin) {
    addRow(list, "clock pin", describePinnedInstant(clockPin, now()), "note");
  }

  const { periodStart, periodEnd } = getPeriodBounds(now());
  try {
    const events = await callServer<ClockEventInput[]>(
      "getEvents",
      periodStart.toISOString(),
      periodEnd.toISOString()
    );
    const plural = events.length === 1 ? "event" : "events";
    addRow(list, "calendar", `${events.length} ${plural} in this period`, "ok");
  } catch (error) {
    addRow(list, "calendar", `unavailable — ${(error as Error).message}`, "fail");
  }

  await checkPreferences(list);
}

startDisplay();

const diagnostics = document.querySelector("#bridge-results");
if (diagnostics) void renderDiagnostics(diagnostics);
