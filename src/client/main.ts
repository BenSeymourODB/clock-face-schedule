/**
 * Scaffold check page (#1).
 *
 * Confirms the things everything later depends on: the client bundle reaches the browser, the
 * google.script.run bridge round-trips, server and browser agree on time, and the display has a
 * colour emoji font. Replaced by the dial itself in #8.
 */

import {
  type ClockEventInput,
  computeArcTitleLayout,
  eventsToClockEvents,
  getPeriodStart,
} from "../shared/clock";
import { clockFace } from "./render/clock-face";
import { eventArc } from "./render/event-arc";
import { floatingLabel } from "./render/floating-label";
import { svg } from "./svg";

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

const DIAL = { size: 600, margin: 8, arcThickness: 48 } as const;

/** Sample events across the current period, so the arcs have something to draw. */
function sampleEvents(periodStart: Date): ClockEventInput[] {
  const at = (hours: number, minutes: number) =>
    new Date(periodStart.getTime() + (hours * 60 + minutes) * 60_000).toISOString();
  const fallbackColor = "#3b82f6";

  return [
    { id: "a", title: "🟢 🎮 Game Time", startDate: at(0, 30), endDate: at(2, 0), isAllDay: false, fallbackColor },
    { id: "b", title: "🔴 Deadline", startDate: at(2, 30), endDate: at(3, 0), isAllDay: false, fallbackColor },
    { id: "c", title: "🟡 🍽️ Lunch", startDate: at(4, 0), endDate: at(6, 30), isAllDay: false, fallbackColor },
    { id: "d", title: "📚 Reading", startDate: at(8, 0), endDate: at(8, 10), isAllDay: false, fallbackColor },
    { id: "e", title: "🔵 Parent Teacher Conference Planning Committee", startDate: at(9, 30), endDate: at(10, 40), isAllDay: false, fallbackColor },
  ];
}

/**
 * A standing preview of the dial, so the geometry can be judged on the display it will actually
 * run on rather than in jsdom.
 *
 * Deliberately *not* the real orchestration — there is no ring stacking and no tick; both are
 * #7. Every event here sits on a single ring, which is why none of them overlap.
 */
function mountDial(): void {
  const mount = document.querySelector("#clock-mount");
  if (!mount) return;

  const cx = DIAL.size / 2;
  const cy = DIAL.size / 2;
  const outerRadius = cx - DIAL.margin;
  const innerRadius = outerRadius - DIAL.arcThickness;

  const now = new Date();
  const periodStart = getPeriodStart(now);
  const events = eventsToClockEvents(sampleEvents(periodStart), periodStart);

  const arcs = svg("g");
  const labels = svg("g");

  for (const event of events) {
    const arcSpan = event.endAngle - event.startAngle;
    const layout = computeArcTitleLayout({
      cleanTitle: event.cleanTitle,
      arcSpan,
      innerRadius,
      outerRadius,
    });
    // A label only helps if the arc it points at is wide enough to see.
    const isOverflow = layout.fit.didOverflow && arcSpan >= 10;

    arcs.append(
      eventArc({ event, cx, cy, innerRadius, outerRadius, layout, forceHideTitle: isOverflow })
    );

    if (isOverflow) {
      labels.append(
        floatingLabel({
          id: event.id,
          text: event.cleanTitle,
          anchorAngle: (event.startAngle + event.endAngle) / 2,
          anchorRadius: outerRadius,
          labelRadius: outerRadius + DIAL.arcThickness * 0.6,
          color: event.color,
          cx,
          cy,
          clockBox: { top: cy - outerRadius, bottom: cy + outerRadius, height: outerRadius * 2 },
          fontSize: layout.titleFontSize,
        })
      );
    }
  }

  // Face last so the hands draw over any label bleeding toward the centre.
  const face = clockFace({ radius: innerRadius, cx, cy, time: now, showSeconds: true });
  mount.append(arcs, labels, face.element);
}

mountDial();
void renderDiagnostics();
