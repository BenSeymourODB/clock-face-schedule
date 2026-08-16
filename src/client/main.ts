/**
 * Scaffold check page (#1).
 *
 * Confirms the things everything later depends on: the client bundle reaches the browser, the
 * google.script.run bridge round-trips, server and browser agree on time, and the display has a
 * colour emoji font. Replaced by the real page shell in #8, which swaps the sample events below
 * for a live calendar.
 */
import { type ClockEventInput, getPeriodStart } from "../shared/clock";
import { analogClock } from "./render/analog-clock";

interface Pong {
  serverTime: string;
  timeZone: string;
}

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

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "unknown";
  }
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

async function renderDiagnostics(): Promise<void> {
  const list = document.getElementById("bridge-results");
  if (!list) return;
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
}

const TICK_INTERVAL_MS = 1000;

/**
 * Sample events across whichever twelve hours the page is opened in, so the dial has something
 * to draw before #3 supplies a calendar.
 *
 * The first three deliberately overlap, two of them three deep, because concentric ring stacking
 * is the part hardest to judge from a specification.
 */
function sampleEvents(periodStart: Date): ClockEventInput[] {
  const at = (hours: number, minutes: number) =>
    new Date(periodStart.getTime() + (hours * 60 + minutes) * 60_000).toISOString();
  const fallbackColor = "#3b82f6";

  return [
    { id: "a", title: "🟢 🎮 Game Time", startDate: at(0, 30), endDate: at(2, 0), isAllDay: false, fallbackColor },
    { id: "b", title: "🔴 Deadline", startDate: at(1, 0), endDate: at(3, 0), isAllDay: false, fallbackColor },
    { id: "c", title: "🟣 Study", startDate: at(1, 30), endDate: at(2, 30), isAllDay: false, fallbackColor },
    { id: "d", title: "🟡 🍽️ Lunch", startDate: at(4, 30), endDate: at(6, 30), isAllDay: false, fallbackColor },
    { id: "e", title: "📚 Reading", startDate: at(8, 0), endDate: at(8, 10), isAllDay: false, fallbackColor },
    { id: "f", title: "🔵 Parent Teacher Conference Planning Committee", startDate: at(9, 30), endDate: at(10, 40), isAllDay: false, fallbackColor },
  ];
}

function mountDial(): void {
  const mount = document.querySelector("#clock-mount");
  if (!mount) return;

  const now = new Date();
  const clock = analogClock({
    events: sampleEvents(getPeriodStart(now)),
    showSeconds: true,
    time: now,
  });

  mount.append(clock.element);
  window.setInterval(() => clock.setTime(new Date()), TICK_INTERVAL_MS);
}

mountDial();
void renderDiagnostics();
