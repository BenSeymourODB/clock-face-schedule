/**
 * The display.
 *
 * Mounts the dial, ticks it, and polls the accessing user's calendar. The diagnostic panels from
 * the scaffold survive behind `?check=1` — a smart board still has to be checked for a colour
 * emoji font and a working bridge, and that check has to happen on the device.
 */
import {
  type ClockEventInput,
  getFetchWindow,
  getPeriodBounds,
  getRollingWindow,
} from "../shared/clock";
import { decodePreferences, encodePreferences } from "../shared/preferences";
import { analogClock } from "./render/analog-clock";
import { type PreferenceStore, preferenceStore, readPreferenceWire } from "./preferences";
import { sampleEvents } from "./sample-events";
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
  const { windowStart, windowEnd } = getFetchWindow(new Date(), FETCH_MARGIN_HOURS);

  return callServer<ClockEventInput[]>(
    "getEvents",
    windowStart.toISOString(),
    windowEnd.toISOString()
  );
}

/**
 * Preferences as `doGet` left them, with saves going back over the bridge unawaited.
 *
 * A failed save is a log line rather than a status-line failure: the status line is the schedule's,
 * and a display that cannot remember a setting is still showing the right time with the right
 * events on it.
 */
function displayPreferences(mount: Element): PreferenceStore {
  return preferenceStore({
    wire: readPreferenceWire(mount),
    save: (wire) => {
      void callServer<string>("savePreferences", wire).catch((error: Error) => {
        console.warn(`preference not saved — ${error.message}`);
      });
    }
  });
}

function startDisplay(): void {
  const mount = document.querySelector("#dial");
  const statusLine = document.querySelector("#status");
  if (!mount) return;

  const preferences = displayPreferences(mount);

  const clock = analogClock({
    events: [],
    showSeconds: preferences.get().showSeconds,
    time: new Date()
  });
  mount.append(clock.element);

  // Hands before data. A google.script.run round trip runs 0.5–2s and the server cache does not
  // help a cold start, so the wall shows a working clock rather than an empty panel.
  window.setInterval(() => clock.setTime(new Date()), TICK_INTERVAL_MS);

  function setStatusText(text: string | null): void {
    if (!statusLine) return;
    statusLine.textContent = text ?? "";
    statusLine.toggleAttribute("hidden", text === null);
  }

  /**
   * Sample events instead of a calendar, for judging legibility on the display itself.
   *
   * Set by `?demo=1` on the deployed app, and always on in the local preview, which has no server
   * to ask. Deliberately says so on screen: a wall left in this mode must not be mistaken for a
   * real schedule, and the whole point of the mode is that someone is standing in front of it.
   */
  if (mount instanceof HTMLElement && mount.dataset["demo"] === "1") {
    // Anchored to the rolling window's own start, not periodStart, so the fixture lands inside
    // whatever window is live at load time regardless of the hour — see sample-events.ts.
    clock.setEvents(sampleEvents(getRollingWindow(new Date()).windowStart));
    setStatusText("Sample events — not a real calendar");
    return;
  }

  let status: ScheduleStatus = { kind: "loading" };

  function showStatus(): void {
    setStatusText(describeStatus(status));
  }

  async function refresh(): Promise<void> {
    try {
      clock.setEvents(await fetchWindow());
      status = nextStatus(status, { ok: true, at: new Date() });
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
 * Preferences, checked on the device rather than on a workstation.
 *
 * Reports what arrived in the page, then writes the values **already in effect** straight back and
 * confirms the server echoes them. Storing what is already resolved makes the write a no-op in
 * content, so running the diagnostic cannot change how the display behaves — while still exercising
 * the half of the path a page load never touches. Until #47 exists, this is the only way to find out
 * on the board whether `PropertiesService` is reachable at all.
 */
async function checkPreferences(list: Element): Promise<void> {
  const wire = readPreferenceWire(document.querySelector("#dial"));

  if (wire === null) {
    // The attribute is templated unconditionally, so its absence means doGet's templating broke.
    addRow(list, "preferences", "no data-preferences on the mount", "fail");
    return;
  }
  addRow(list, "preferences", wire === "" ? "none stored — using defaults" : wire, "ok");

  const resolved = encodePreferences(decodePreferences(wire));
  try {
    const echoed = await callServer<string>("savePreferences", resolved);
    addRow(
      list,
      "preference write",
      echoed === resolved ? "stored and echoed back" : `stored, resolved to ${echoed}`,
      echoed === resolved ? "ok" : "note"
    );
  } catch (error) {
    addRow(list, "preference write", `unavailable — ${(error as Error).message}`, "fail");
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

  addRow(list, "browser time", new Date().toString(), "ok");

  const { periodStart, periodEnd } = getPeriodBounds(new Date());
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
