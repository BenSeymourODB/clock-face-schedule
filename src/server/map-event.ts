/**
 * Calendar events → the structural shape the dial's geometry reads.
 *
 * Pure and framework-free on purpose: `CalendarApp` cannot be exercised outside Apps Script, so
 * everything worth testing lives here and `calendar.ts` stays a thin extraction layer over it.
 */
import { type ClockEventInput, relativeLuminance } from "../shared/clock";

/**
 * Google's event colour palette, keyed by the ordinal `CalendarEvent.getColor()` returns.
 *
 * Hard-coded because `CalendarApp` exposes the ordinal but not the hex. The Advanced Calendar
 * Service's `Colors.get()` is the authoritative source if these ever drift.
 */
const EVENT_COLORS: Record<string, string> = {
  "1": "#a4bdfc", // Lavender
  "2": "#7ae7bf", // Sage
  "3": "#dbadff", // Grape
  "4": "#ff887c", // Flamingo
  "5": "#fbd75b", // Banana
  "6": "#ffb878", // Tangerine
  "7": "#46d6db", // Peacock
  "8": "#e1e1e1", // Graphite
  "9": "#5484ed", // Blueberry
  "10": "#51b749", // Basil
  "11": "#dc2127", // Tomato
};

/** Used when an event has no colour of its own and the calendar's is missing or unreadable. */
const DEFAULT_COLOR = "#3b82f6";

/** The fields read off a calendar event. Structural, so the mapper is testable without one. */
export interface CalendarEventFields {
  /** iCalUID. Shared by every occurrence of a recurring event — see `mapEvent`. */
  id: string;
  title: string;
  startTime: Date;
  endTime: Date;
  isAllDay: boolean;
  /** A `CalendarApp.EventColor` ordinal, or `""` when the event inherits the calendar's colour. */
  colorId: string;
}

/**
 * Event colour, then the calendar's own, then a default.
 *
 * Only the *fallback* — a colour-dot emoji prefix on the title still wins, and that parsing
 * happens later in `parseEventTitle`.
 */
export function resolveEventColor(colorId: string, calendarColor?: string): string {
  const fromEvent = EVENT_COLORS[colorId.trim()];
  if (fromEvent) return fromEvent;

  // `relativeLuminance` returns null for anything the dial could not render as a colour, which
  // makes it a parseability check as well as a luminance one.
  if (calendarColor && relativeLuminance(calendarColor) !== null) return calendarColor;

  return DEFAULT_COLOR;
}

/**
 * Every occurrence of a recurring event carries the *same* iCalUID, so the raw id is not unique
 * within a window. Ids reach the DOM as element ids and `textPath` fragment references, where a
 * collision makes one arc's title follow another arc's curve.
 *
 * Suffixing the start instant makes them unique, and stable across refetches — the same
 * occurrence keeps the same id, so nothing churns between polls.
 */
function occurrenceId(event: CalendarEventFields): string {
  return `${event.id}-${event.startTime.getTime()}`;
}

export function mapEvent(
  event: CalendarEventFields,
  calendarColor?: string
): ClockEventInput {
  return {
    id: occurrenceId(event),
    title: event.title,
    // UTC with a `Z` offset. ADR 0005 only requires the offset be explicit; the client parses
    // to an absolute instant and does every period calculation in browser-local time.
    startDate: event.startTime.toISOString(),
    endDate: event.endTime.toISOString(),
    isAllDay: event.isAllDay,
    fallbackColor: resolveEventColor(event.colorId, calendarColor),
  };
}
