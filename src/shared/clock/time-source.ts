/**
 * The clock's one seam.
 *
 * Every time-dependent thing the dial draws — an elapsed arc (#26), a draining one (#28), the
 * window-edge feather (#22), the hands — is a function of "now", and until this existed "now" was
 * `new Date()` called at half a dozen sites. That made the interesting states reachable only by
 * waiting for them: #71 shipped a drain that never drained, through two releases, because nobody
 * could see a mid-drain arc without deliberate effort.
 *
 * Pinning the clock is also the difference between a test constructing a time and a test
 * monkeypatching a global, which is most of the value even with no URL parameter attached.
 *
 * Browser-side by construction — ADR 0005 makes browser-local time authoritative, and a pinned
 * clock is a refinement of that rather than an exception to it. The server never parses these
 * values; it passes them through as authored.
 */

/** A clock displaced from the real one, held still, or both. */
export interface ClockPin {
  /** What the clock reads at the moment the source is created. */
  origin: Date;
  /** Whether it holds still there rather than running on. */
  frozen: boolean;
  /**
   * Whether `origin` came from `?now`, as opposed to being the real clock held where it stood.
   *
   * `?freeze=1` alone is a pin whose origin *is* the real time, and callers that change what they
   * draw because time was moved must not react to it — freezing the clock moves nothing.
   */
  displaced: boolean;
}

/** Reads `now`. The single site the rest of the client goes through. */
export type TimeSource = () => Date;

/** `HH:MM` or `HH:MM:SS` — that time on the reference date. */
const CLOCK_TIME = /^(\d{1,2}):([0-5]\d)(?::([0-5]\d))?$/;

/** A full date-time, `T` or space separated, with an optional `Z` / `±HH:MM` offset. */
const DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):([0-5]\d)(?::([0-5]\d))?(Z|[+-]\d{2}:?\d{2})?$/;

const HOURS_IN_DAY = 24;

function isPresent(value: string | null | undefined): value is string {
  return typeof value === "string" && value !== "";
}

/**
 * Resolve `?now` against the reference instant.
 *
 * Returns `null` for anything it cannot read, which makes the clock fall back to the real one. A
 * wall showing the real time is the safe wrong answer here; a wall showing an invented time with
 * no label on it is not.
 */
function pad(value: number): string {
  return value < 10 ? `0${value}` : `${value}`;
}

/**
 * Whether the calendar has that day at all — 2026-02-30 and 2026-04-31 do not exist, and the Date
 * constructor rolls them silently into the next month.
 *
 * Checked in UTC so the answer does not depend on the runner's zone, and checked *before* the
 * offset branch below rather than after the local construction: a zoned string goes to the
 * platform parser, which rolls impossible dates just as quietly and has no guard of its own.
 *
 * Deliberately about the day and not the hour. A wall time inside a spring-forward gap does not
 * exist either, and letting the constructor resolve it to the hour after is the answer a pin
 * wants — the reviewer asked for an instant, not for a string to be validated.
 */
function isRealCalendarDay(year: number, month: number, day: number): boolean {
  const utc = new Date(Date.UTC(year, month - 1, day));
  return (
    utc.getUTCFullYear() === year && utc.getUTCMonth() === month - 1 && utc.getUTCDate() === day
  );
}

function parseInstant(raw: string, reference: Date): Date | null {
  const clockTime = CLOCK_TIME.exec(raw);
  if (clockTime) {
    const hours = Number(clockTime[1]);
    if (hours >= HOURS_IN_DAY) return null;

    return new Date(
      reference.getFullYear(),
      reference.getMonth(),
      reference.getDate(),
      hours,
      Number(clockTime[2]),
      Number(clockTime[3] ?? 0),
      0
    );
  }

  const dateTime = DATE_TIME.exec(raw);
  if (!dateTime) return null;

  const hours = Number(dateTime[4]);
  if (hours >= HOURS_IN_DAY) return null;

  const [year, month, day] = [Number(dateTime[1]), Number(dateTime[2]), Number(dateTime[3])];
  if (!isRealCalendarDay(year, month, day)) return null;

  const minutes = Number(dateTime[5]);
  const seconds = Number(dateTime[6] ?? 0);
  const zone = dateTime[7];

  // An explicit offset means the caller has already said which instant they mean, so hand it to
  // the platform parser rather than re-deriving it. Without one the value is a local wall time,
  // which is what a reviewer typing a time into a URL means.
  //
  // Rebuilt from the captured groups rather than passed through as authored, so the two branches
  // accept the same inputs: the platform parser wants a two-digit hour and a colon in the offset,
  // and `4:15` / `+0100` are fine everywhere else here.
  if (zone) {
    const offset = zone === "Z" || zone.indexOf(":") !== -1 ? zone : `${zone.slice(0, 3)}:${zone.slice(3)}`;
    const parsed = new Date(
      `${year}-${pad(month)}-${pad(day)}T${pad(hours)}:${pad(minutes)}:${pad(seconds)}${offset}`
    );
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return new Date(year, month - 1, day, hours, minutes, seconds, 0);
}

/**
 * Read the pin from the two raw parameter values, or `null` if the clock is not pinned.
 *
 * `freeze` alone is meaningful: it stops the real clock where it stands, which is what a
 * screenshot of live calendar data needs. The two are read independently, so an unreadable `now`
 * still leaves a requested freeze in place rather than discarding both.
 */
export function parseClockPin(
  now: string | null | undefined,
  freeze: string | null | undefined,
  reference: Date
): ClockPin | null {
  const frozen = freeze === "1";
  const origin = isPresent(now) ? parseInstant(now, reference) : null;

  if (origin) return { origin, frozen, displaced: true };
  return frozen
    ? { origin: new Date(reference.getTime()), frozen: true, displaced: false }
    : null;
}

/**
 * The time source the display reads.
 *
 * An unfrozen pin runs at real speed from its origin, so the tick loop still rebuilds the way it
 * would on the wall — which is the half of #28 worth watching rather than screenshotting.
 */
export function createTimeSource(
  pin: ClockPin | null,
  readRealClock: () => number = () => Date.now()
): TimeSource {
  if (!pin) return () => new Date(readRealClock());

  const origin = pin.origin.getTime();
  if (pin.frozen) return () => new Date(origin);

  const createdAt = readRealClock();
  return () => new Date(origin + (readRealClock() - createdAt));
}

/**
 * The on-screen label. Blunt on purpose, and for the same reason demo mode says so: a display
 * showing a time that is not the time is worse than one showing invented events.
 */
export function describeClockPin(pin: ClockPin, today: Date): string {
  const verb = pin.frozen ? "frozen at" : "pinned to";
  // `?now=` takes a date as well as a time, and a pin four months away announced as "9:05:00 AM"
  // is exactly the display this label exists to prevent being mistaken for a real one. Only shown
  // when the day actually differs, so the common case stays as short as it was.
  const sameDay =
    pin.origin.getFullYear() === today.getFullYear() &&
    pin.origin.getMonth() === today.getMonth() &&
    pin.origin.getDate() === today.getDate();

  const when = sameDay ? pin.origin.toLocaleTimeString() : pin.origin.toLocaleString();
  return `Clock ${verb} ${when} — not the real time`;
}

/**
 * The same fact for the `?check=1` panel, which wants a different thing from the status line.
 *
 * That panel exists to catch a display whose own clock is wrong, so its pin row has to be readable
 * *against* the browser-time row above it — same full-instant format, and the resolved time rather
 * than the authored one. Reusing the status line's wording here named the time twice and ran the
 * row to three lines, which is what looking at it showed.
 */
export function describePinnedInstant(pin: ClockPin, now: Date): string {
  return `${now.toString()} — ${pin.frozen ? "frozen" : "running"}`;
}
