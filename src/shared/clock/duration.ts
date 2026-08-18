/**
 * An event's duration as text — the second channel #35 gives duration, so it is readable rather
 * than only comparable.
 *
 * Angular extent is the only channel today and it is the saturated one: thickness means overlap
 * depth, colour means identity. Worse, `MIN_ARC_DEGREES` draws everything under 15 minutes at the
 * same 7.5°, so the shortest events carry no duration signal at all.
 */

/** Minutes in an hour, named because the unit switch below is the whole decision. */
const MINUTES_PER_HOUR = 60;

/**
 * Format a duration in minutes.
 *
 * The unit switch mirrors the dial's own: a clock face reads minutes below an hour and hours above,
 * which is what the two hands are, so the text splits where the face splits rather than at a
 * threshold invented for it.
 *
 * The trailing minutes are unlabelled on purpose. Spelling "2 hr 25 min" costs four more characters,
 * and at an arc title's font size that is the difference between needing roughly 20° of arc and
 * needing 32° — which decides whether a half-hour event carries a duration at all. "hr" is already
 * stated, so the second number has only one thing it can be.
 *
 * `2:25` is not used: on a clock face that reads as a time of day.
 *
 * Returns an empty string for anything that does not round to at least a minute, so callers can
 * treat "no duration worth stating" and "no room to state it" the same way.
 */
export function formatEventDuration(minutes: number): string {
  if (!Number.isFinite(minutes)) return '';
  const whole = Math.round(minutes);
  if (whole < 1) return '';
  if (whole < MINUTES_PER_HOUR) return `${whole} min`;

  const hours = Math.floor(whole / MINUTES_PER_HOUR);
  const remainder = whole % MINUTES_PER_HOUR;
  return remainder === 0 ? `${hours} hr` : `${hours} hr ${remainder}`;
}
