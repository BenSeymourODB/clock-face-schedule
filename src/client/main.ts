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
  PANEL_RESERVE_UNITS,
  getPeriodBounds,
  labelMarginUnits,
  panelFitsBoard,
  parseDialScaleId,
} from "../shared/clock";
import { decodePreferences, encodePreferences } from "../shared/preferences";
import { readClockPin } from "./clock-pin";
import { fixtureRefresher } from "./fixture-refresh";
import { type PreferenceStore, preferenceStore, readPreferenceWire } from "./preferences";
import { type AgendaPanelHandle, agendaPanel } from "./render/agenda-panel";
import { type AnalogClockHandle, DIAL_VIEWBOX_SIZE, analogClock } from "./render/analog-clock";
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
      }),
    // Its wire *is* used, unlike the save's: only the server knows what dropping a viewer's own
    // value falls back to, so the store learns the outcome from this answer (#83).
    reset: (keysWire) =>
      callServer<string>("resetPreferences", keysWire).catch((error: Error) => {
        console.warn(`preference not reset — ${error.message}`);
        throw error;
      })
  });
}

/**
 * The board's spare width, in the dial's own units — ADR 0009's allocation, measured (#30 item 1).
 *
 * `#dial` is the grid column the drawing sits in and its box is definite on both axes, so its
 * rendered size is the scale the whole page resolved at. `clientWidth` rather than `innerWidth`
 * because the latter counts a scrollbar, and this page has none by construction.
 *
 * `null` on a page with no layout — the preview before paint, a jsdom spec — which leaves the
 * renderer on its inherited allowance rather than on a zero.
 */
function measureLabelMargin(mount: Element): number | null {
  const box = mount.getBoundingClientRect();
  return labelMarginUnits(box, document.documentElement.clientWidth, DIAL_VIEWBOX_SIZE);
}

/**
 * How far a floating label may reach past the dial's viewBox, in the dial's units — read off the
 * frame the page actually reserves for it rather than restated here.
 *
 * `#display`'s padding *is* that reserve (`--label-frame`, sized in `Styles.html` from the worst card
 * the renderer can draw), so one read keeps the panel's threshold and the page's frame the same
 * number. Converted through `size / board.height`, the scale the dial resolves at while it is bound
 * by the board's height — which is the hypothesis `panelFitsBoard` is testing.
 *
 * Zero where there is nothing to measure, which leaves the threshold at the dial-size condition
 * alone rather than refusing the panel outright.
 */
function labelReachUnits(board: Element): number {
  const display = document.querySelector("#display");
  const height = board.getBoundingClientRect().height;
  if (!display || !(height > 0)) return 0;

  const padding = Number.parseFloat(window.getComputedStyle(display).paddingRight);
  if (!Number.isFinite(padding)) return 0;

  return (padding * DIAL_VIEWBOX_SIZE) / height;
}

/**
 * Whether the board can carry the panel without the dial paying for it and without a floating label
 * landing on it (#39, ADR 0009).
 *
 * Measured on `#board` — the row the dial and the panel share — and never on the dial's own box. The
 * dial's width depends on whether the panel is in it, so testing the dial would flap: hiding the
 * panel widens the dial, which re-satisfies the test, which shows the panel again. `#board` is the
 * whole row either way.
 *
 * The absent case is also what an unmeasurable page falls into, which is the safe direction: a panel
 * sized from a zero would be a sliver of cards nobody can read.
 */
function showPanel(board: Element): boolean {
  return panelFitsBoard(
    board.getBoundingClientRect(),
    DIAL_VIEWBOX_SIZE,
    PANEL_RESERVE_UNITS,
    labelReachUnits(board)
  );
}

/**
 * Grant the labels' margin and settle the panel's column, now and again whenever the row the two
 * sit in changes size.
 *
 * Watching a *box* rather than the window is the difference between a live figure and one taken at
 * load: a board rotated or a projector re-detected at a different resolution fires `resize`, but the
 * status line appearing does not — and it takes height from the dial, which changes both how many
 * viewBox units of the board are spare and whether the panel still fits. Both routes come out as a
 * box resize, so there is one seam, which is why the panel's test rides along here rather than
 * bringing its own observer.
 *
 * `#board` is what is observed, since it is the element whose size neither answer depends on.
 *
 * `setLabelMargin` ignores an unchanged value, so a resize that does not move the allocation costs
 * no rebuild. Falls back to `resize` where `ResizeObserver` is missing, which loses the status-line
 * case and keeps the rest.
 */
function trackBoardLayout(
  board: Element,
  mount: Element,
  panelHost: Element | null,
  clock: AnalogClockHandle
): void {
  const apply = (): void => {
    // The panel first: it decides the dial's width, so granting the margin from a box measured
    // before the column settled would hand the renderer the wrong allowance for a frame.
    panelHost?.toggleAttribute("hidden", !showPanel(board));
    clock.setLabelMargin(measureLabelMargin(mount));
  };

  apply();
  if (typeof ResizeObserver === "function") {
    new ResizeObserver(apply).observe(board);
    return;
  }
  window.addEventListener("resize", apply);
}

function startDisplay(): void {
  const statusLine = document.querySelector("#status");
  const panelHost = document.querySelector("#panel");
  // The row the dial and the panel share. Falls back to the mount on a page templated before #39
  // added it, which is the diagnostics-only case: the measurement is then the dial's own box, so the
  // panel does not appear rather than appearing at the wrong width.
  const board = document.querySelector("#board");
  if (!mount) return;

  const preferences = displayPreferences(mount);
  const scale = chosenScale(mount);

  /**
   * One read for the whole of the load, so everything the first frame is built from agrees about
   * when that frame is (#152).
   *
   * A second read further down the function is later by however long the append and the label
   * measurement take, and the demo fixture has an event ending exactly on the anchor boundary — so
   * the load frame drew a drain the next tick removed, and a screenshot taken inside that second
   * showed a seam that is not there afterwards. Which is a race in the load order rather than
   * anything about the geometry, and the review habit `CLAUDE.md` mandates needs the load frame to
   * be reproducible.
   */
  const loadedAt = now();

  const clock = analogClock({
    events: [],
    showSeconds: preferences.get().showSeconds,
    time: loadedAt,
    scale
  });
  mount.append(clock.element);

  /**
   * The agenda column beside it (#39), built from the same instant the dial's first frame was — the
   * property #152 is about, extended to the second drawing on the page. Two reads here would put the
   * panel and the band a few milliseconds apart, which is invisible until an event ends inside the
   * gap and the card set disagrees with the arcs on the load frame.
   *
   * Empty until the first fetch answers, like the dial. Appended before the panel is known to fit,
   * because `trackBoardLayout` decides that from `#board`'s box and hides the host either way.
   */
  const panel: AgendaPanelHandle | null = panelHost
    ? agendaPanel({ events: [], time: loadedAt })
    : null;
  if (panel && panelHost) panelHost.append(panel.element);

  // After the append, so the box being measured is the one the drawing is laid out in.
  trackBoardLayout(board ?? mount, mount, panelHost, clock);

  // Hands before data. A google.script.run round trip runs 0.5–2s and the server cache does not
  // help a cold start, so the wall shows a working clock rather than an empty panel.
  window.setInterval(() => {
    const at = now();
    clock.setTime(at);
    panel?.setTime(at);
  }, TICK_INTERVAL_MS);

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
    // And the same `loadedAt` the dial was built with, so the anchor and the first frame agree.
    const refreshFixture = fixtureRefresher({
      scale,
      pin: clockPin,
      loadedAt,
      now,
      setEvents: (events) => {
        clock.setEvents(events);
        panel?.setEvents(events);
      }
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
      const events = await fetchWindow();
      clock.setEvents(events);
      // The same set both drawings, so a card and an arc can never name different events. The dial
      // narrows it to the rolling window itself; the panel keeps the whole fetch, which is what #37
      // widened the request for.
      panel?.setEvents(events);
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
 * **Deliberately read-only, and both write entry points are reachable that way.** An earlier version
 * sent the resolved values back to prove the save path, which is a no-op in content and a one-way
 * change in provenance: it copies the deployment's script-store defaults into the viewer's own store,
 * after which they stop tracking the deployment (#83). An empty patch exercises the entry point, the
 * patch parser and the resolution order without storing anything, and an empty key list is read-only
 * for the same reason — `resetPreferences` deletes what its wire names, and an empty wire names
 * nothing.
 *
 * Both are probed because **a missing footer entry fails silently in the browser** and nothing
 * offline catches it: the footer is generated from the bundle's export list (ADR 0002), and this is
 * the only check that the generated name is the one `google.script.run` actually resolves. Every
 * other property of these two functions a spec settles; that one it cannot.
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

  try {
    const resolved = await callServer<string>("resetPreferences", "");
    addRow(
      list,
      "preference reset",
      resolved === templated ? "reachable, and changed nothing" : `reachable, but holds ${resolved}`,
      resolved === templated ? "ok" : "note"
    );
  } catch (error) {
    addRow(list, "preference reset", `unreachable — ${(error as Error).message}`, "fail");
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

  // ADR 0009's allocation is arithmetic over an assumed board, and #30 item 1 makes it a
  // measurement — so the measurement is worth reading on the display rather than inferring it from
  // the resolution. A margin at the inherited 50.4 on a widescreen board means the sizing rule did
  // not resolve, which is #115 returning and is invisible in the drawing itself.
  //
  // The rendered size is quoted beside it because the margin is a count of *viewBox units* and so
  // moves inversely with it — and this panel is one of the few places the dial is not the whole of
  // the page, since the sections below it take height the dial would otherwise have. So the two
  // numbers are only ADR 0009's figures when read together, and the pixel one is the direct check
  // on #115: 600 px on a board taller than that is the defect, whatever the margin says.
  if (mount) {
    const margin = measureLabelMargin(mount);
    const { width, height } = mount.getBoundingClientRect();

    addRow(
      list,
      "label margin",
      margin === null
        ? "not measurable — the dial has no layout"
        : `${margin.toFixed(1)} units per side past the viewBox, at ${Math.min(width, height).toFixed(0)} px of dial`,
      margin === null ? "fail" : "ok"
    );
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
