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
  dialScale,
  dialWindow,
  getFetchWindow,
  getPeriodBounds,
  parseDialScaleId,
} from "../shared/clock";
import { analogClock } from "./render/analog-clock";
import { oneHourSampleEvents, sampleEvents } from "./sample-events";
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
 * Which dial scale to run at (#34).
 *
 * The deployed page is a sandboxed iframe whose own URL carries none of the viewer's query
 * parameters, so `doGet` templates the raw value onto the mount and it is parsed here — the same
 * reason `?demo=1` arrives as a data attribute. The preview has no server to template anything, so
 * the attribute is present but empty there and its own query string answers instead, which is what
 * makes `preview.html?scale=1h` work from disk.
 */
function chosenScale(mount: Element): DialScaleId {
  const templated = mount instanceof HTMLElement ? mount.dataset["scale"] : undefined;
  if (templated) return parseDialScaleId(templated);

  return parseDialScaleId(new URLSearchParams(window.location.search).get("scale"));
}

function startDisplay(): void {
  const mount = document.querySelector("#dial");
  const statusLine = document.querySelector("#status");
  if (!mount) return;

  const scale = chosenScale(mount);
  const clock = analogClock({ events: [], showSeconds: true, time: new Date(), scale });
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
    // Anchored to the drawn window's own start, not periodStart, so the fixture lands inside
    // whatever window is live at load time regardless of the hour — see sample-events.ts. Each
    // scale gets its own fixture: a 55-minute window has no room for an eleven-hour schedule, and
    // the 1-hour mode's whole claim is about events too short for the 12-hour one to show.
    const { windowStart } = dialWindow(new Date(), dialScale(scale));
    clock.setEvents(
      scale === "1h" ? oneHourSampleEvents(windowStart) : sampleEvents(windowStart)
    );
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
}

startDisplay();

const diagnostics = document.querySelector("#bridge-results");
if (diagnostics) void renderDiagnostics(diagnostics);
