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

/** An event resolved to everything the dial needs to draw it. */
export interface ClockEvent {
  id: string;
  title: string;
  cleanTitle: string;
  startAngle: number;
  endAngle: number;
  color: string;
  eventEmoji?: string;
  isAllDay: boolean;
}
