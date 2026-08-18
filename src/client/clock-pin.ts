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
 * So a pinned clock anchors the fixture to that day's midnight instead. The offsets then read as
 * clock times and the pinned time of day becomes the phase between `now` and the anchor. The two
 * rules coincide at 03:00, where midnight *is* `now − 3h`, which makes the unpinned picture "as if
 * pinned to 03:00" rather than a third behaviour.
 *
 * Not made unconditional: anchoring to midnight always is what #25 moved away from, and it would
 * leave the fixture off the dial outside a few hours of the day.
 */
export function fixtureAnchor(pin: ClockPin | null, now: Date): Date {
  return pin ? getDayStart(now) : getRollingWindow(now).windowStart;
}
