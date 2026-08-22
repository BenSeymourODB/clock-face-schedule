/**
 * What a card's duration line costs its title, and when that price is refused (#141).
 *
 * `floatingLabelGeometry` sizes a card's width against the tallest it may become, so asking for a
 * duration narrows the card before a character is placed and `fitLabelToWidth` then wraps the title
 * into a tighter budget. The duration is not paid for out of empty space; it is paid for out of the
 * title — and past the wrap budget it is paid for with an ellipsis, which is a *silent* loss. A
 * viewer reading `Swimming Group B Kit Check and...` is not told what was dropped, and the card
 * exists in the first place because the arc could not carry the name.
 *
 * So the rule is that a card never trades a name for a number: the duration is offered only where
 * the title still shows every character it showed without one. A re-wrap is free by that measure
 * and is allowed — the same words across different lines cost a reader nothing — which is what
 * separates this from the stricter "decline any change to the rendered lines".
 *
 * The other direction is already covered elsewhere and is not this module's business: whether the
 * *taller* card collides with anything is `planOptionalLines`' question, and it asks it after this
 * one has priced the text.
 */

/** Both ellipsis markers `packLines` truncates with, longest first so the ASCII one wins. */
const ELLIPSIS_MARKERS = ['...', '…'];

/**
 * The characters of the event's name a card actually shows.
 *
 * Whitespace is dropped rather than normalised, and the lines are compared as one string, because
 * the line *breaks* are exactly what this is indifferent to. Dropping it also makes the comparison
 * immune to where a run of emoji is split: `packLines` may break `🧸 🪀🎈` between glyphs that had no
 * space between them, and re-joining the lines would otherwise invent one and read as a change.
 *
 * A truncation only ever removes characters from the end, so a shorter result is always a real loss
 * and never an artefact of the collapsing.
 */
export function shownName(titleLines: string[]): string {
  const joined = titleLines.join('');
  const marker = ELLIPSIS_MARKERS.find((candidate) => joined.endsWith(candidate));
  const withoutMarker = marker === undefined ? joined : joined.slice(0, -marker.length);
  return withoutMarker.replace(/\s+/g, '');
}

/**
 * Whether a card carrying `duration` still shows the whole of the name it showed without one.
 *
 * `withDuration` is the grown card's lines as `fitLabelToWidth` returned them, duration line
 * included. That line is checked for rather than assumed: `fitLabelToWidth` *drops* a trailing line
 * it cannot fit instead of widening the card, and a grown card that lost its duration on the way
 * has paid the narrower width for nothing at all — the one case where accepting is worse than
 * declining even though the title is untouched.
 */
export function keepsItsName(
  titleOnly: string[],
  withDuration: string[],
  duration: string
): boolean {
  if (withDuration.length === 0) return false;
  if (withDuration[withDuration.length - 1] !== duration) return false;
  return shownName(withDuration.slice(0, -1)) === shownName(titleOnly);
}
