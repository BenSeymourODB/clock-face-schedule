/**
 * The only code in the project that touches `CalendarApp`.
 *
 * Deliberately thin — everything with a decision in it lives in `map-event.ts`, which is pure
 * and testable. Per ADR 0003 this returns plain event objects and nothing derived: no angles,
 * no ring indices, no markup.
 */
import type { ClockEventInput } from "../shared/clock";
import { type CalendarEventFields, mapEvent } from "./map-event";

/** How long a fetched window stays cached (ADR 0006). */
const CACHE_TTL_SECONDS = 60;

/** CacheService rejects values above 100KB. Skip the cache rather than fail the request. */
const CACHE_MAX_CHARS = 100 * 1024;

/**
 * Apps Script hands back its own `Base.Date`, which is Date-shaped but not a `Date`. Coercing
 * here keeps `map-event.ts` free of host types, so it stays runnable — and testable — in node.
 */
function fieldsOf(event: GoogleAppsScript.Calendar.CalendarEvent): CalendarEventFields {
  return {
    id: event.getId(),
    title: event.getTitle(),
    startTime: new Date(event.getStartTime().getTime()),
    endTime: new Date(event.getEndTime().getTime()),
    isAllDay: event.isAllDayEvent(),
    colorId: event.getColor(),
  };
}

/**
 * Events overlapping `[timeMin, timeMax)`, from the default calendar of whoever is looking.
 *
 * The web app runs as the accessing user, so this is each visitor's own calendar and needs no
 * configuration — nothing to share, nothing to set, and no way for one visitor to read another's.
 *
 * The window is supplied by the client rather than derived here. The browser owns the twelve-hour
 * period (ADR 0005); deriving it server-side would use the script's timezone instead of the
 * display's, and the two disagreeing is a silent failure that looks like missing events.
 */
export function getEvents(timeMinIso: string, timeMaxIso: string): ClockEventInput[] {
  // Per-user because the script executes as the visitor. Were that ever changed to execute as
  // the deployer, this would become one shared cache — but every visitor would then be reading
  // the deployer's single calendar anyway, so it still could not cross-contaminate.
  const cache = CacheService.getUserCache();
  const key = `events:${timeMinIso}:${timeMaxIso}`;

  const cached = cache.get(key);
  if (cached) return JSON.parse(cached) as ClockEventInput[];

  const calendar = CalendarApp.getDefaultCalendar();
  if (!calendar) {
    throw new Error("No default calendar is available for this account.");
  }

  const calendarColor = calendar.getColor();
  const events = calendar
    .getEvents(new Date(timeMinIso), new Date(timeMaxIso))
    .map((event) => mapEvent(fieldsOf(event), calendarColor));

  const payload = JSON.stringify(events);
  if (payload.length <= CACHE_MAX_CHARS) {
    cache.put(key, payload, CACHE_TTL_SECONDS);
  }

  return events;
}
