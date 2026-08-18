/**
 * Where the pinned clock's two values come from, on both of the ways this page gets served.
 *
 * The deployed app runs in an HtmlService iframe on a rotating `googleusercontent.com` origin, so
 * the browser never sees the URL the viewer typed — which is why `doGet` templates `demo` onto the
 * mount as `data-demo` rather than the client reading `location.search`. The same applies here.
 *
 * `build/preview.html` has no server at all: the build resolves the includes and strips the
 * scriptlets, so the templated attributes arrive **empty** and the query string is the only source
 * left. Both paths matter, and empty is the common case rather than an edge one.
 */
import { type ClockPin, getDayStart, getRollingWindow, parseClockPin } from "../shared/clock";

/** Empty is absent: a stripped `data-now="<?= pinnedNow ?>"` leaves the attribute behind. */
function firstPresent(...values: (string | null | undefined)[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value !== "") return value;
  }
  return null;
}

/**
 * Read the pin from the page. The templated attributes win, so a deployed URL cannot be overridden
 * by whatever the sandbox iframe happens to carry.
 */
export function readClockPin(
  mount: HTMLElement | null,
  search: string,
  reference: Date
): ClockPin | null {
  const query = new URLSearchParams(search);

  return parseClockPin(
    firstPresent(mount?.dataset["now"], query.get("now")),
    firstPresent(mount?.dataset["freeze"], query.get("freeze")),
    reference
  );
}

/**
 * Where the demo fixture's `at(h, m)` offsets are measured from.
 *
 * Belongs to the pin rather than to the fixture, because it is the pin that has to *mean*
 * something. Unpinned, #25 anchors the fixture to the rolling window's own start so the whole
 * thing lands inside whatever window is live at load — but that start is `now − 3h`, so every
 * event's offset relative to `now` is a constant and the elapsed / in-progress / future partition
 * is invariant under any value of `?now`. Pinning the clock would rotate the picture and change
 * nothing about the states, which are the reason for pinning it.
 *
 * So a **displaced** clock anchors the fixture to that day's midnight instead. The offsets then
 * read as clock times and the pinned time of day becomes the phase between `now` and the anchor.
 * The two rules coincide at 03:00, where midnight *is* `now − 3h`, which makes the unpinned
 * picture "as if pinned to 03:00" rather than a third behaviour.
 *
 * **Displaced, not merely pinned.** `?freeze=1` alone holds the real clock still without moving
 * it, so re-anchoring for it would empty the dial for no reason a viewer asked for: at 14:37 the
 * fixture drops from thirteen arcs to one, because midnight anchoring puts the whole fixture
 * behind the window.
 *
 * The same arithmetic bounds where a displaced pin is useful at all. The fixture spans 22:50 the
 * previous day to 13:15, against a window of `[now − 3h, now + 8h]`, so arcs on the dial fall away
 * through the afternoon — 13 at 03:00, 5 at 09:00, 3 at 12:00, and **none from 17:00**. That is a
 * property of what the fixture covers rather than of the anchoring, and it is why midnight
 * anchoring is not made unconditional: #25 moved away from exactly this.
 */
export function fixtureAnchor(pin: ClockPin | null, now: Date): Date {
  return pin?.displaced ? getDayStart(now) : getRollingWindow(now).windowStart;
}
