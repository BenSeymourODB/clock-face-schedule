/**
 * Geometry and time-window helpers for the analog clock face.
 * Ported from next-digital-wall-calendar's `analog-clock/clock-utils.ts`.
 */
import { leadingEmoji } from './emoji';
import type {
  ArcAngles,
  ClampedArcAngles,
  ClockEvent,
  ClockEventInput,
  ParsedEventTitle
} from './types';

/** Colour-dot emoji a title may be prefixed with, and the hex each selects. */
const COLOR_EMOJI_MAP: Record<string, string> = {
  '\u{1F534}': '#EF4444', // 🔴 red-500
  '\u{1F7E0}': '#F97316', // 🟠 orange-500
  '\u{1F7E1}': '#EAB308', // 🟡 yellow-500
  '\u{1F7E2}': '#22C55E', // 🟢 green-500
  '\u{1F535}': '#3B82F6', // 🔵 blue-500
  '\u{1F7E3}': '#A855F7', // 🟣 purple-500
  '\u26AB': '#1F2937', // ⚫ gray-800
  '\u26AA': '#F3F4F6', // ⚪ gray-100
  '\u{1F7E4}': '#92400E' // 🟤 amber-800
};

/** Floor on arc width, in degrees — ~15 minutes on a 12-hour dial. */
const MIN_ARC_DEGREES = 7.5;

/** Minutes in a 12-hour period. */
const PERIOD_MINUTES = 720;

/**
 * Split an event title into an optional colour-dot prefix, an optional event emoji,
 * and the remaining text.
 *
 * - "🔴 Deadline"             → colour=red, no event emoji
 * - "🟢 🎮 Family Game Night" → colour=green, eventEmoji=🎮
 * - "🏋️ Gym Session"         → fallback colour, eventEmoji=🏋️
 * - "Team Meeting"            → fallback colour, no emoji
 */
export function parseEventTitle(title: string, fallbackColor: string): ParsedEventTitle {
  let remaining = title;
  let colorEmoji: string | undefined;
  let eventEmoji: string | undefined;
  let color = fallbackColor;

  const colorMatch = remaining.match(leadingEmoji());
  if (colorMatch) {
    const candidate = colorMatch[0];
    if (COLOR_EMOJI_MAP[candidate]) {
      colorEmoji = candidate;
      color = COLOR_EMOJI_MAP[candidate];
      remaining = remaining.slice(candidate.length).replace(/^ /, '');
    }
  }

  // A second emoji (or the first, when no colour dot matched) is the event's own.
  const eventMatch = remaining.match(leadingEmoji());
  if (eventMatch) {
    eventEmoji = eventMatch[0];
    remaining = remaining.slice(eventEmoji.length).replace(/^ /, '');
  }

  return { colorEmoji, eventEmoji, cleanTitle: remaining, color };
}

/**
 * The title exactly as it renders: the event's own emoji inline with the text, matching how it
 * was authored, rather than stacked separately as a category glyph beside it.
 */
export function combineTitleWithEmoji(cleanTitle: string, eventEmoji: string | undefined): string {
  if (!eventEmoji) return cleanTitle;
  return cleanTitle ? `${eventEmoji} ${cleanTitle}` : eventEmoji;
}

/**
 * Start of the 12-hour period containing `time`: midnight for 00:00–11:59,
 * noon for 12:00–23:59.
 */
export function getPeriodStart(time: Date): Date {
  const periodStart = new Date(time);
  periodStart.setMinutes(0, 0, 0);
  periodStart.setHours(time.getHours() < 12 ? 0 : 12);
  return periodStart;
}

/** Both ends of the 12-hour period containing `time`. */
export function getPeriodBounds(time: Date): { periodStart: Date; periodEnd: Date } {
  const periodStart = getPeriodStart(time);
  const periodEnd = new Date(periodStart.getTime() + 12 * 60 * 60 * 1000);
  return { periodStart, periodEnd };
}

/** Start of the calendar day containing `time` — midnight, local time. */
export function getDayStart(time: Date): Date {
  const dayStart = new Date(time);
  dayStart.setHours(0, 0, 0, 0);
  return dayStart;
}

/**
 * The window the client should fetch from the server: the whole calendar day, extended to
 * `windowHours` past the current 12-hour period's own start.
 *
 * The end stays anchored to the period rather than the day so a period rollover always finds its
 * next period already cached — `getPeriodStart` is midnight or noon, so ending at
 * `periodStart + windowHours` guarantees at least one full period of look-ahead past whichever
 * rollover is coming next, exactly as a plain `periodStart + windowHours` window always has.
 *
 * The start moves earlier, to the day's own midnight, so an afternoon fetch — where
 * `periodStart` is noon — no longer misses the morning that already happened today. Since
 * `dayStart` is never later than `periodStart`, this can only widen the window, never narrow the
 * look-ahead the old computation relied on.
 */
export function getFetchWindow(
  time: Date,
  windowHours: number
): { windowStart: Date; windowEnd: Date } {
  const windowStart = getDayStart(time);
  const windowEnd = new Date(getPeriodStart(time).getTime() + windowHours * 60 * 60 * 1000);
  return { windowStart, windowEnd };
}

/**
 * Narrow events to those overlapping a 12-hour period. All-day events are dropped —
 * they have no start or end angle, so they belong in a separate list beside the dial.
 *
 * Overlap is exclusive at both ends: an event ending exactly at `periodStart`, or
 * starting exactly at `periodEnd`, is not included.
 */
export function filterEventsForPeriod(
  events: ClockEventInput[],
  periodStart: Date,
  periodEnd: Date
): ClockEventInput[] {
  const startMs = periodStart.getTime();
  const endMs = periodEnd.getTime();
  return events.filter((event) => {
    if (event.isAllDay) return false;
    const eventStart = new Date(event.startDate).getTime();
    const eventEnd = new Date(event.endDate).getTime();
    return eventStart < endMs && eventEnd > startMs;
  });
}

/** Default window end: exactly one 12-hour period after `periodStart`. */
function defaultWindowEnd(periodStart: Date): Date {
  return new Date(periodStart.getTime() + PERIOD_MINUTES * 60 * 1000);
}

/**
 * Resolve events into drawable arcs: parse each title's emoji prefixes and compute
 * arc angles against `periodStart`.
 *
 * `windowStart`/`windowEnd` default to the period itself. A caller drawing a window that is not
 * period-aligned (a rolling look-ahead, a 1-hour scale) passes its own bounds; `periodStart` stays
 * the angle origin regardless, since it is the hour hand's own zero.
 *
 * Does not filter — pass through `filterEventsForPeriod` first for the events in view.
 */
export function eventsToClockEvents(
  events: ClockEventInput[],
  periodStart: Date,
  windowStart: Date = periodStart,
  windowEnd: Date = defaultWindowEnd(periodStart)
): ClockEvent[] {
  return events.map((event) => {
    const parsed = parseEventTitle(event.title, event.fallbackColor);
    const start = new Date(event.startDate);
    const end = new Date(event.endDate);
    const drawn = calculateArcAngles(start, end, periodStart, windowStart, windowEnd);
    const actual = calculateTrueArcAngles(start, end, periodStart, windowStart, windowEnd);

    return {
      id: event.id,
      title: event.title,
      cleanTitle: parsed.cleanTitle,
      startAngle: drawn.startAngle,
      endAngle: drawn.endAngle,
      trueStartAngle: actual.startAngle,
      trueEndAngle: actual.endAngle,
      continuesBefore: actual.continuesBefore,
      continuesAfter: actual.continuesAfter,
      color: parsed.color,
      eventEmoji: parsed.eventEmoji,
      isAllDay: event.isAllDay
    };
  });
}

/**
 * The event's actual extent within a window, in degrees against the fixed `periodStart` origin —
 * clamped to the window but **not** widened to the minimum visible width.
 *
 * `periodStart` is the angle origin (0° = 12 o'clock) and never moves: it is the hour hand's own
 * zero, so an event is always drawn where the hand will point at its time, before and after. The
 * window (`windowStart`/`windowEnd`, defaulting to the period itself) is what the event is clamped
 * to, and the two need not agree — a rolling look-ahead or a 1-hour scale clamps to a window that
 * does not start at 0°. Angles are **not** reduced modulo 360: a window that reaches past
 * `periodStart + 720min`, or starts before `periodStart`, produces angles past 360° or below 0°
 * rather than wrapping, so downstream ordering (`assignRings`) stays meaningful.
 *
 * This is what ring stacking should read. Widened angles describe where the arc is *painted*,
 * which is a drawing concern and not evidence that two events clash.
 *
 * Reports which ends the clamp moved, because an arc drawn to a boundary looks exactly like an
 * arc that ends there, and the two mean very different things to someone asking how long is left.
 */
export function calculateTrueArcAngles(
  eventStart: Date,
  eventEnd: Date,
  periodStart: Date,
  windowStart: Date = periodStart,
  windowEnd: Date = defaultWindowEnd(periodStart)
): ClampedArcAngles {
  const clampedStart = Math.max(eventStart.getTime(), windowStart.getTime());
  const clampedEnd = Math.min(eventEnd.getTime(), windowEnd.getTime());

  const startMinutes = (clampedStart - periodStart.getTime()) / (60 * 1000);
  const endMinutes = (clampedEnd - periodStart.getTime()) / (60 * 1000);

  return {
    startAngle: (startMinutes / PERIOD_MINUTES) * 360,
    endAngle: (endMinutes / PERIOD_MINUTES) * 360,
    continuesBefore: eventStart.getTime() < windowStart.getTime(),
    continuesAfter: eventEnd.getTime() > windowEnd.getTime(),
  };
}

/**
 * Map an event's times onto drawable arc angles, widening anything under MIN_ARC_DEGREES so short
 * events stay visible. See `calculateTrueArcAngles` for the window/origin split.
 */
export function calculateArcAngles(
  eventStart: Date,
  eventEnd: Date,
  periodStart: Date,
  windowStart: Date = periodStart,
  windowEnd: Date = defaultWindowEnd(periodStart)
): ArcAngles {
  let { startAngle, endAngle } = calculateTrueArcAngles(
    eventStart,
    eventEnd,
    periodStart,
    windowStart,
    windowEnd
  );

  if (endAngle - startAngle < MIN_ARC_DEGREES) {
    const windowStartAngle =
      ((windowStart.getTime() - periodStart.getTime()) / (60 * 1000) / PERIOD_MINUTES) * 360;
    const windowEndAngle =
      ((windowEnd.getTime() - periodStart.getTime()) / (60 * 1000) / PERIOD_MINUTES) * 360;

    endAngle = startAngle + MIN_ARC_DEGREES;
    // Widening past the window's own end would wrap the arc, so pull the start back instead.
    if (endAngle > windowEndAngle) {
      endAngle = windowEndAngle;
      startAngle = Math.max(windowStartAngle, endAngle - MIN_ARC_DEGREES);
    }
  }

  return { startAngle, endAngle };
}

/**
 * Ids of the events that have finished by `now`.
 *
 * A set rather than a flag on `ClockEvent`, because the resolved shape carries angles and not
 * times — and because its size doubles as the dial's change detector: elapsed state is the one
 * thing about an arc that changes between period rollovers.
 */
export function elapsedEventIds(events: ClockEventInput[], now: Date): Set<string> {
  const nowMs = now.getTime();
  return new Set(
    events.filter((event) => new Date(event.endDate).getTime() <= nowMs).map((event) => event.id)
  );
}

/**
 * Whether any event straddles `now` — started but not finished.
 *
 * Drives the dial's rebuild cadence (#28): the drain boundary moves every second while this is
 * true, so `analogClock.setTime` rebuilds every tick rather than only at rollover or an elapsed
 * crossing. A boolean rather than a set, since nothing downstream needs *which* event — only
 * whether the band currently has anything to keep moving.
 */
export function hasEventInProgress(events: ClockEventInput[], now: Date): boolean {
  const nowMs = now.getTime();
  return events.some((event) => {
    if (event.isAllDay) return false;
    const start = new Date(event.startDate).getTime();
    const end = new Date(event.endDate).getTime();
    return start <= nowMs && nowMs < end;
  });
}

/**
 * Round a computed coordinate to a stable precision.
 *
 * Inherited to guard against two runtimes disagreeing at the least-significant bit; this
 * project renders only in the browser, so that particular hazard does not arise. Kept
 * because trigonometry otherwise yields 15-significant-digit path strings, and because
 * geometry tests can assert exact values rather than approximations. Four decimals is far
 * below sub-pixel precision at any dial size.
 */
export function roundCoord(n: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}

/**
 * Polar (degrees, radius) → cartesian (x, y), with 0° at 12 o'clock, clockwise.
 * Output is rounded via `roundCoord` for render stability.
 */
export function polarToCartesian(
  cx: number,
  cy: number,
  radius: number,
  angleDegrees: number
): { x: number; y: number } {
  // -90° so that 0° lands at 12 o'clock rather than 3 o'clock.
  const angleRad = ((angleDegrees - 90) * Math.PI) / 180;
  return {
    x: roundCoord(cx + radius * Math.cos(angleRad)),
    y: roundCoord(cy + radius * Math.sin(angleRad))
  };
}

/** SVG path for a donut-arc (annular sector) between two radii and two angles. */
export function describeArc(
  cx: number,
  cy: number,
  outerRadius: number,
  innerRadius: number,
  startAngle: number,
  endAngle: number
): string {
  const outerStart = polarToCartesian(cx, cy, outerRadius, startAngle);
  const outerEnd = polarToCartesian(cx, cy, outerRadius, endAngle);
  const innerStart = polarToCartesian(cx, cy, innerRadius, startAngle);
  const innerEnd = polarToCartesian(cx, cy, innerRadius, endAngle);

  const arcSpan = endAngle - startAngle;
  const largeArcFlag = arcSpan > 180 ? 1 : 0;

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${innerStart.x} ${innerStart.y}`,
    'Z'
  ].join(' ');
}
