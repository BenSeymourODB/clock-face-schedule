/**
 * Shapes for the analog clock face — a dial whose outer band carries one arc per
 * calendar event in the current 12-hour period.
 *
 * Ported from next-digital-wall-calendar. `ClockEventInput` is deliberately structural
 * rather than tied to any calendar API, so the geometry can be tested without a payload
 * and the mapping onto it lives in the server's calendar adapter.
 */

/** The event fields the clock geometry actually reads. */
export interface ClockEventInput {
  id: string;
  title: string;
  /** Anything `new Date()` accepts; in practice an ISO-8601 timestamp. */
  startDate: string;
  endDate: string;
  isAllDay: boolean;
  /** Hex colour used when the title carries no colour-emoji prefix. */
  fallbackColor: string;
}

/** Result of splitting an event title into its emoji prefixes and remaining text. */
export interface ParsedEventTitle {
  /** Colour-dot emoji prefix (e.g. "🔴") if present. */
  colorEmoji?: string;
  /** Event-specific emoji (e.g. "🎮") if present. */
  eventEmoji?: string;
  /** Title with both emoji prefixes removed. */
  cleanTitle: string;
  /** Resolved hex colour — from `colorEmoji` if it mapped, else the caller's fallback. */
  color: string;
}

/** Arc bounds in degrees, where 0 = 12 o'clock and angles increase clockwise. */
export interface ArcAngles {
  startAngle: number;
  endAngle: number;
}

/** Arc bounds plus which ends the period cut off. */
export interface ClampedArcAngles extends ArcAngles {
  /** The event was already running when the period began. */
  continuesBefore: boolean;
  /** The event runs on past the period's end. */
  continuesAfter: boolean;
}

/** An event resolved to everything the dial needs to draw it. */
export interface ClockEvent {
  id: string;
  title: string;
  cleanTitle: string;
  /** Angles the arc is drawn at, widened to the minimum visible width if the event is short. */
  startAngle: number;
  endAngle: number;
  /**
   * Angles before that widening.
   *
   * Ring stacking reads these, so a five-minute event held open to 7.5° does not appear to clash
   * with a neighbour starting six minutes later. Using the drawn angles there manufactures
   * overlaps that do not exist, and each phantom costs every arc on the dial some thickness.
   */
  trueStartAngle: number;
  trueEndAngle: number;
  /**
   * Whether the period cut the event short at either end.
   *
   * An arc is drawn to the period boundary whatever the event's real extent, so without these the
   * dial asserts that an 11:30–12:30 event finishes at noon. The renderer fades the affected end
   * out rather than capping it.
   */
  continuesBefore: boolean;
  continuesAfter: boolean;
  /**
   * The event's own length in minutes — from its real start and end, not from the extent the window
   * left visible.
   *
   * Deliberately not derivable from the angles above. `startAngle`/`endAngle` are widened by
   * `MIN_ARC_DEGREES`, and even the true pair is clamped to the window, so both under-report a
   * 70-minute event that the window catches 20 minutes of. Duration is the one thing the geometry
   * structurally cannot carry, which is the whole reason #35 states it as text.
   */
  durationMinutes: number;
  color: string;
  eventEmoji?: string;
  isAllDay: boolean;
}
