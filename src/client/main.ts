/**
 * Scaffold check page (#1).
 *
 * Confirms the things everything later depends on: the client bundle reaches the browser, the
 * google.script.run bridge round-trips, server and browser agree on time, and the display has a
 * colour emoji font. Replaced by the dial itself in #8.
 */

import { clockFace } from "./render/clock-face";

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
    // manifest timeZone is wrong for wherever this display lives, which is worth correcting.
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

/**
 * A standing preview of the dial. Rendered once — ticking is #7, event arcs are #5 and #7 —
 * so the geometry can be judged on the display it will actually run on rather than in jsdom.
 *
 * `radius` is what #7 will pass: half the viewBox, less an 8px margin, less the 48px band
 * reserved for event arcs. The empty ring around the face is that band.
 */
function mountClockFace(): void {
  const mount = document.querySelector("#clock-mount");
  if (!mount) return;

  const { element } = clockFace({
    radius: 244,
    cx: 300,
    cy: 300,
    time: new Date(),
    showSeconds: true,
  });
  mount.append(element);
}

mountClockFace();
void renderDiagnostics();
