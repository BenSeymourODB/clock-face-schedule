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

/** Hours the rolling window looks behind the current time (#25). */
export const ROLLING_WINDOW_LOOKBEHIND_HOURS = 3;

/** Hours the rolling window looks ahead of the current time (#25). */
export const ROLLING_WINDOW_LOOKAHEAD_HOURS = 8;

/**
 * The dial's drawn window: `lookbehindHours` behind `time`, `lookaheadHours` ahead of it.
 *
 * Replaces the fixed 12-hour period as what the dial actually shows (#25) — `periodStart` stays
 * the angle origin (see `calculateTrueArcAngles`), but the window this clamps and filters events
 * against now moves continuously with `time` rather than jumping twice a day.
 */
export function getRollingWindow(
  time: Date,
  lookbehindHours: number = ROLLING_WINDOW_LOOKBEHIND_HOURS,
  lookaheadHours: number = ROLLING_WINDOW_LOOKAHEAD_HOURS
): { windowStart: Date; windowEnd: Date } {
  return {
    windowStart: new Date(time.getTime() - lookbehindHours * 60 * 60 * 1000),
    windowEnd: new Date(time.getTime() + lookaheadHours * 60 * 60 * 1000)
  };
}

/**
 * The window the client should fetch from the server: wide enough for the dial's own rolling
 * window (#25) *and* the whole calendar day (#37), widened by `marginHours` at each end still in
 * play.
 *
 * Two independent callers need coverage here, and neither one's need replaces the other's:
 * - The dial only ever draws `getRollingWindow(time)` — `marginHours` covers the gap between
 *   polls, since the window keeps moving continuously and `main.ts` only refetches every 5
 *   minutes.
 * - `getDayStart(time)` anchors the window's start no later than today's midnight regardless of
 *   the rolling window's own start, because #36 (the agenda panel epic)'s first sub-issue is
 *   fetching the *whole day* — including the morning a rolling 3-hour lookbehind would miss —
 *   and there is no dial-only reason to narrow back to less than #37 already guaranteed.
 */
export function getFetchWindow(
  time: Date,
  marginHours: number
): { windowStart: Date; windowEnd: Date } {
  const { windowStart: rollingStart, windowEnd: rollingEnd } = getRollingWindow(time);
  const marginMs = marginHours * 60 * 60 * 1000;
  // The margin only buffers the rolling bound against poll drift — the day-start floor is a fixed
  // boundary that does not move between polls, so it takes no margin of its own.
  return {
    windowStart: new Date(Math.min(getDayStart(time).getTime(), rollingStart.getTime() - marginMs)),
    windowEnd: new Date(rollingEnd.getTime() + marginMs)
  };
}

/**
 * Narrow events to those overlapping `[windowStart, windowEnd)` — a plain time range, not
 * necessarily a 12-hour period; the dial's rolling window (#25) is the main caller today. All-day
 * events are dropped — they have no start or end angle, so they belong in a separate list beside
 * the dial.
 *
 * Overlap is exclusive at both ends: an event ending exactly at `windowStart`, or
 * starting exactly at `windowEnd`, is not included.
 */
export function filterEventsForPeriod(
  events: ClockEventInput[],
  windowStart: Date,
  windowEnd: Date
): ClockEventInput[] {
  const startMs = windowStart.getTime();
  const endMs = windowEnd.getTime();
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
 * A timestamp's angle against the fixed `periodStart` origin (0° = 12 o'clock), **not** reduced
 * modulo 360 — a time before `periodStart` or past `periodStart + 720min` yields a negative angle
 * or one past 360° rather than wrapping. Shared by every window boundary this module computes
 * (event clamping, the window-gap track) so they all stay in the same unwrapped angle space that
 * `describeArc`/`polarToCartesian` already handle via ordinary trigonometry.
 */
export function angleForTime(time: Date, periodStart: Date): number {
  const minutes = (time.getTime() - periodStart.getTime()) / (60 * 1000);
  return (minutes / PERIOD_MINUTES) * 360;
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
  const clampedStart = new Date(Math.max(eventStart.getTime(), windowStart.getTime()));
  const clampedEnd = new Date(Math.min(eventEnd.getTime(), windowEnd.getTime()));

  return {
    startAngle: angleForTime(clampedStart, periodStart),
    endAngle: angleForTime(clampedEnd, periodStart),
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
    const windowStartAngle = angleForTime(windowStart, periodStart);
    const windowEndAngle = angleForTime(windowEnd, periodStart);

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
