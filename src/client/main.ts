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
  LABEL_MARGIN_KNEE_UNITS,
  PANEL_RESERVE_UNITS,
  getPeriodBounds,
  labelMarginUnits,
  panelFitsBoard,
  parseDialScaleId,
} from "../shared/clock";
import {
  PREFERENCES,
  decodePreferences,
  encodePreferences,
  resolveOverride
} from "../shared/preferences";
import { readClockPin } from "./clock-pin";
import { fixtureRefresher } from "./fixture-refresh";
import {
  type PreferenceStore,
  preferenceStore,
  readDeploymentPreferenceWire,
  readPreferenceWire
} from "./preferences";
import { type AgendaPanelHandle, agendaPanel } from "./render/agenda-panel";
import { type AnalogClockHandle, DIAL_VIEWBOX_SIZE, analogClock } from "./render/analog-clock";
import { type ScheduleStatus, describeStatus, nextStatus } from "./schedule-status";
import { scaleSwapper, withScaleParam } from "./scale-swap";
import { teacherBar } from "./teacher-bar";

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
 * Write the scale the switch has just chosen where the page already records it: onto the mount,
 * which is what `chosenScale` reads, and into `?scale=`, which is the control a board can be pointed
 * at from a URL.
 *
 * Both, rather than either. The attribute alone would leave a URL describing a dial that is no
 * longer on screen; the parameter alone would leave the two disagreeing about the mode, and the
 * attribute is the one anything re-reading the page believes.
 *
 * **The address bar does not change on the deployed app, and cannot.** The page runs inside an
 * HtmlService sandbox iframe on a `googleusercontent.com` origin that rotates between sessions, so
 * `window.location` here is the *frame's* URL — the `script.google.com/…/exec?scale=1h` one a
 * teacher typed belongs to the parent document, which this page may not touch. `doGet` templates
 * that parameter onto the mount instead, which is exactly why `chosenScale` prefers the attribute.
 * On `build/preview.html`, where the page is the document, both halves are the URL the reader sees.
 *
 * `replaceState` rather than `pushState`: a back button that silently un-toggles a wall display is
 * worse than no history at all. Wrapped, because a display must not stop working over a URL it could
 * not rewrite — `replaceState` throws in a sandbox without `allow-same-origin`, and the dial is
 * correct either way.
 */
function recordScale(mount: Element, scale: DialScaleId): void {
  if (mount instanceof HTMLElement) mount.dataset["scale"] = scale;

  try {
    window.history.replaceState(
      window.history.state,
      "",
      withScaleParam(window.location.search, scale) + window.location.hash
    );
  } catch (error) {
    console.warn(`scale not written to the URL — ${(error as Error).message}`);
  }
}

/**
 * Whether the viewer has asked for less motion — in which case the scale swap happens at the press
 * rather than behind a fade.
 *
 * Guarded on `matchMedia` itself: the fade is a nicety and a host without the API must still be able
 * to change scale.
 */
function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Whether any surface states an event's length (#178) — the URL first, then what the teacher stored.
 *
 * Four layers, most specific first: the templated attribute (what `doGet` saw in the URL), the
 * page's own query string (the preview, which has no server), the viewer's stored preference, and
 * the registry default. The parameter beating the store is the point of having one: #178 asks for
 * *"a URL parameter for checking it on the device"*, and a setting a wall display cannot be pointed
 * at is one that can only be checked from a workstation.
 *
 * Which inverts `chosenScale`'s precedence, and deliberately: `?scale=` **is** the setting there, so
 * a templated value winning keeps a deployed URL from being overridden by whatever the sandbox
 * iframe carries. Here the setting is the stored preference and the parameter is an override of it.
 *
 * The parameter's alphabet is the preference definition's own — `1` and `0` — because it is parsed
 * by that definition. One parser for both forms, so a value the store accepts and one the URL
 * accepts cannot come apart. Anything else falls *through* to the store rather than being repaired,
 * which is `resolvePreferences`' rule applied to one more layer.
 */
function chosenDurations(mount: Element, preferences: PreferenceStore): boolean {
  const templated = mount instanceof HTMLElement ? mount.dataset["durations"] : undefined;
  const query = new URLSearchParams(window.location.search).get("durations");

  return resolveOverride(
    PREFERENCES.showEventDurations,
    [templated, query],
    preferences.get().showEventDurations
  );
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
    // The layer beneath the viewer's own, so a reset shows its result without a round trip (#157).
    deploymentWire: readDeploymentPreferenceWire(mount),
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
 * `#dial` is the flex remainder of `#board` — the row it shares with the panel (#39) — and its box
 * is definite on both axes, so its rendered size is the scale the whole page resolved at.
 * `clientWidth` rather than `innerWidth` because the latter counts a scrollbar, and this page has
 * none by construction.
 *
 * `null` on a page with no layout — the preview before paint, a jsdom spec — which leaves the
 * renderer on its inherited allowance rather than on a zero.
 */
function measureLabelMargin(mount: Element, board: Element, panelShown: boolean): number | null {
  const box = mount.getBoundingClientRect();

  /**
   * The viewport, or the row — and which one it is decides whether a card can land on the panel.
   *
   * A card may paint into `#display`'s padding: that frame exists for it (#115), so dividing the
   * *viewport* is the right answer for three of the dial's four sides. On the fourth, once the panel
   * is up, the frame **is** the panel — so the room that actually exists beside the dial is the row's
   * own width minus the column, and granting more than that is granting a card permission to paint
   * over the agenda. `analog-clock.ts` turns the grant straight into `labelAllowance`, so the reach
   * it permits is exactly this number: measure the row and a collision stops being possible rather
   * than becoming unlikely.
   *
   * Costs nothing where it matters. ADR 0009's guaranteed card width saturates at 13 characters a
   * line for any margin at or above 75.4, and `panelFitsBoard` will not show a panel that leaves
   * less — so 16:9 goes 234.5 → 183.2 and 16:10 172.1 → 120.8, both still saturated.
   */
  const available = panelShown
    ? board.getBoundingClientRect().width
    : document.documentElement.clientWidth;

  return labelMarginUnits(box, available, DIAL_VIEWBOX_SIZE);
}

/**
 * Whether the board can carry the panel without the dial paying for it and without the labels paying
 * either (#39, ADR 0009).
 *
 * The second term is ADR 0009's own knee: below 75.4 units of margin the labels stop being saturated
 * and every unit the panel takes is a character off a card, which is the trade the ADR says its 180
 * units must not make. Above it, both are at their best and the panel is free.
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
    LABEL_MARGIN_KNEE_UNITS
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
    // The panel first, and its answer reused rather than asked twice: it decides both the dial's
    // width and which width the margin is measured against, so a box read before the column
    // settled would hand the renderer the wrong allowance for a frame.
    const shown = showPanel(board);
    panelHost?.toggleAttribute("hidden", !shown);
    clock.setLabelMargin(measureLabelMargin(mount, board, shown));
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
  // The teacher's controls (ADR 0008). Absent only on a jsdom fixture that mounts a bare `#dial`;
  // `Index.html` emits it outside every scriptlet, so a real page always has one.
  const barHost = document.querySelector("#bar");
  // The row the dial and the panel share. `Index.html` emits it outside every scriptlet, so a real
  // page always has one and the fallback below is only reached by a jsdom fixture that mounts a bare
  // `#dial`. Falling back to the mount keeps such a page working with no panel, rather than throwing.
  const board = document.querySelector("#board");
  if (!mount) return;

  /**
   * The mount, past the guard above.
   *
   * `mount` is module-level, and TypeScript does not carry the `if (!mount) return` narrowing into a
   * nested function — so the closures below would see `Element | null` and have to re-test something
   * that cannot be null by the time they run. Verified by removing this and reading the error rather
   * than assumed.
   */
  const dial = mount;

  const preferences = displayPreferences(mount);
  /**
   * The scale the switch is showing, which the dial follows rather than leads.
   *
   * Moved by `changeScale` alone, and moved *there* before the picture catches up: the fade means
   * the dial arrives a beat late, and a press during that beat has to be answered by the scale the
   * switch now says rather than by the one the earlier press asked for.
   */
  let currentScale = chosenScale(mount);
  /**
   * Read once for the load, and handed to both drawings so they cannot disagree about it — the same
   * property `loadedAt` has below. A dial stating lengths beside a panel that is not is the mixed
   * picture #178 exists to remove, arriving from the plumbing instead of from the geometry.
   */
  const showDurations = chosenDurations(mount, preferences);

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

  /**
   * The agenda column beside the dial (#39). Declared before the dial because the dial reads it, and
   * assigned after because it is built from the same instant — so the binding is what carries the
   * dependency and the closure below is what defers it.
   */
  let panel: AgendaPanelHandle | null = null;

  /**
   * What the panel is naming, for the dial's suppression rule (#172).
   *
   * **Gated on the column being drawn, not merely built.** `main` ticks the panel even where the
   * board is too narrow to show it, so `panel.namedIds()` is populated on a board that displays no
   * column at all (#171) — and suppressing a card against an invisible surface would leave the arc
   * named nowhere. `trackBoardLayout` owns the `hidden` attribute, so reading it here keeps one
   * answer to "is the panel up" rather than a second copy of `panelFitsBoard`'s arithmetic.
   */
  const panelNames = (): ReadonlySet<string> =>
    panel && panelHost && !panelHost.hasAttribute("hidden") ? panel.namedIds() : new Set<string>();

  const clock = analogClock({
    events: [],
    showSeconds: preferences.get().showSeconds,
    time: loadedAt,
    scale: currentScale,
    showDurations,
    namedElsewhere: panelNames
  });
  mount.append(clock.element);

  /**
   * Built from the same instant the dial's first frame was — the property #152 is about, extended to
   * the second drawing on the page. Two reads here would put the panel and the band a few
   * milliseconds apart, which is invisible until an event ends inside the gap and the card set
   * disagrees with the arcs on the load frame.
   *
   * Empty until the first fetch answers, like the dial. Appended before the panel is known to fit,
   * because `trackBoardLayout` decides that from `#board`'s box and hides the host either way.
   */
  panel = panelHost ? agendaPanel({ events: [], time: loadedAt, showDurations }) : null;
  if (panel && panelHost) panelHost.append(panel.element);

  // After the append, so the box being measured is the one the drawing is laid out in.
  trackBoardLayout(board ?? mount, mount, panelHost, clock);

  // Hands before data. A google.script.run round trip runs 0.5–2s and the server cache does not
  // help a cold start, so the wall shows a working clock rather than an empty panel.
  // The panel is ticked even where the board is too narrow to show it. `setTime` early-returns
  // unless the card set changed, so a hidden column costs a filter and a sort over one day's events
  // and touches no DOM — and gating it on visibility would need a "bring it current on re-show" path
  // that reads the clock a second time, which is the defect #152 was. Same call #57 makes about the
  // drain rebuild: cheap on any modern device, and no measurement says otherwise.
  //
  // **The panel goes first, and the order is load-bearing since #172.** The dial's suppression pass
  // reads the column's card set, so ticking the dial first would decide which labels to drop against
  // the *previous* tick's column — for one tick after every change, which is exactly the moment a
  // card is appearing or leaving. The dial's own rebuild key would correct it on the following tick,
  // so the symptom is a single stale frame rather than a stuck one, which is worse to find.
  window.setInterval(() => {
    const at = now();
    panel?.setTime(at);
    clock.setTime(at);
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
  const showingFixture = mount instanceof HTMLElement && mount.dataset["demo"] === "1";

  /** The demo fixture's poll, once one has been seated. Re-seated by every scale change. */
  let refreshFixture: (() => void) | null = null;

  /**
   * Point the fixture at a scale.
   *
   * Called again on every scale change, because both halves of the fixture are scale-bound (#34):
   * `demoFixture` picks a different set of sample events per scale, and `fixtureAnchor` places it
   * against that scale's own window. A refresher kept across a switch would tile the 12-hour
   * fixture's thirteen hours of events across a window 55 minutes wide.
   *
   * Re-seated from `loadedAt` rather than from a fresh `now()`, which is the property #152 bought
   * and the one a scale switch could quietly spend: the anchor is what fixes every event's offset
   * from `now`, so reading the clock here would move the fixture's *states* — the elapsed arc, the
   * one straddling `now` — as a side effect of changing scale.
   */
  function seatFixture(forScale: DialScaleId): void {
    // Handed the same `now` the tick above reads, which is the whole of what `fixture-refresh.ts`
    // exists to make checkable: a pinned dial whose copy set kept moving would empty itself (#80).
    refreshFixture = fixtureRefresher({
      scale: forScale,
      pin: clockPin,
      loadedAt,
      now,
      // Panel first, for the reason the tick is: the dial's suppression pass reads the column.
      setEvents: (events) => {
        panel?.setEvents(events);
        clock.setEvents(events);
      }
    });
    refreshFixture();
  }

  /**
   * Redraw at the other scale — everything a scale change touches, in one place, so the fade below
   * has one thing to defer.
   */
  function drawScale(next: DialScaleId): void {
    clock.setScale(next);
    if (showingFixture) seatFixture(next);
  }

  /** The fade, and the clearing of it on every path out — `scale-swap.ts` owns both. */
  const swapDial = scaleSwapper({
    dial: dial instanceof HTMLElement ? dial : null,
    redraw: drawScale,
    reducedMotion: prefersReducedMotion
  });

  /**
   * The switch's answer: record the choice, then let the dial catch up behind a fade.
   *
   * Two steps, in this order and not the other. The URL and the mount are written *now* because they
   * are the record of what was asked for; the picture is deferred because swapping every mark on the
   * dial at once reads as a fault rather than as a mode. The switch has already moved by the time
   * this runs and does not wait either — a control that lagged the press by the fade would feel
   * broken to whoever is standing at the board.
   */
  function changeScale(next: DialScaleId): void {
    if (next === currentScale) return;
    currentScale = next;
    recordScale(dial, next);
    swapDial(next);
  }

  if (barHost) {
    barHost.append(teacherBar({ scale: currentScale, onScaleChange: changeScale }).element);
  }

  if (showingFixture) {
    seatFixture(currentScale);
    setStatusText("Sample events — not a real calendar");
    window.setInterval(() => refreshFixture?.(), POLL_INTERVAL_MS);
    return;
  }

  let status: ScheduleStatus = { kind: "loading" };

  function showStatus(): void {
    setStatusText(describeStatus(status));
  }

  async function refresh(): Promise<void> {
    try {
      const events = await fetchWindow();
      // The same set both drawings, so a card and an arc can never name different events. The dial
      // narrows it to the rolling window itself; the panel keeps the whole fetch, which is what #37
      // widened the request for.
      //
      // Panel first, for the reason the tick is: the dial's suppression pass reads the column, so a
      // dial rebuilt before it would drop labels against the *previous* fetch's card set (#172).
      panel?.setEvents(events);
      clock.setEvents(events);
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
  const dial = document.querySelector("#dial");
  const wire = readPreferenceWire(dial);

  if (wire === null) {
    // The attribute is emitted whatever the conditions are, so its absence means templating broke.
    addRow(list, "preferences", "no data-preferences on the mount", "fail");
    return;
  }
  addRow(list, "preferences", wire === "" ? "none stored — using defaults" : wire, "ok");

  /**
   * The layer a reset lands on, checked for the same reason and with the same failure: the attribute
   * is emitted whatever the conditions are, so its absence means templating broke — and a reset would
   * then silently land on the code default where the deployment has an answer of its own, which is
   * the exact behaviour #157 removed and has no other symptom on screen.
   */
  const deployment = readDeploymentPreferenceWire(dial);

  if (deployment === null) {
    addRow(list, "deployment preferences", "no data-deployment-preferences on the mount", "fail");
  } else {
    addRow(
      list,
      "deployment preferences",
      deployment === "" ? "not templated — a reset lands on the code defaults" : deployment,
      "ok"
    );
  }

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
  //
  // Reported against the panel's own state (#39), because the two answers differ: with the column up
  // the margin is the room beside the dial, and without it the whole of the board's slack. A row
  // saying "234.5" on a board whose panel is drawn would mean `measureLabelMargin` had divided the
  // viewport rather than the row, which is the intrusion this panel exists to make visible.
  const board = document.querySelector("#board");
  if (mount && board) {
    const shown = showPanel(board);
    const margin = measureLabelMargin(mount, board, shown);
    const { width, height } = mount.getBoundingClientRect();

    addRow(
      list,
      "label margin",
      margin === null
        ? "not measurable — the dial has no layout"
        : `${margin.toFixed(1)} units per side past the viewBox, at ${Math.min(width, height).toFixed(0)} px of dial, panel ${shown ? "drawn" : "absent"}`,
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
