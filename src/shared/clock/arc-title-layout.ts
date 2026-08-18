/**
 * Title layout for one event arc — radius, font size, line allowance, and the fit result.
 * Ported from next-digital-wall-calendar's `analog-clock/arc-title-layout.ts`.
 *
 * The dial computes this once per event and hands the result to both the arc (which
 * renders the in-arc text) and the floating label (which renders titles that overflowed).
 * If those two surfaces each computed their own, they could disagree on `didOverflow` and
 * an event would show its title twice or not at all.
 */
import { roundCoord } from './clock-utils';
import { formatEventDuration } from './duration';
import { visualWidth } from './emoji';
import { arcCharBudget, type FitTitleResult, fitTitleToArc } from './fit-title';

/** Arc span below which a title stays on one line. */
export const TWO_LINE_MIN_SPAN_DEGREES = 30;

/**
 * Title baseline sits this far across the arc band, measured from the inner radius.
 *
 * Centred: an arc renders a title or a standalone glyph, never both (#23 inlined the emoji into
 * the title), so nothing is left to share the radial space that used to justify offsetting it.
 */
export const TITLE_RADIUS_RATIO = 0.5;

/**
 * Title font size = arc band height × this ratio.
 *
 * Deliberately uncapped. An inherited ceiling of 18 units meant that widening the band — the
 * whole response to "it cannot be read from there" — bought a thicker arc carrying the same small
 * text. The ratio already adapts to however much radial room a ring actually has, including when
 * stacking divides the band, so a ceiling only ever fought the intent.
 */
export const TITLE_FONT_SIZE_RATIO = 0.28;

/**
 * Half the gap between two curved baselines, as a fraction of font size. `central`
 * dominant-baseline puts each glyph band at ±fontSize/2 around its centre, so 2 × 0.55 clears
 * them with a hair to spare.
 */
export const TITLE_LINE_OFFSET_RATIO = 0.55;

/**
 * Clearance a stacked line must keep from whatever is drawn on the ring's edges.
 *
 * One unit, matching the separator's own floor: below that the two are not distinguishable as
 * separate marks anyway, so there is nothing left to protect.
 */
const EDGE_CLEARANCE = 1;

export interface ArcTitleLayout {
  /** Curved-text baseline radius. */
  titleRadius: number;
  /** Resolved title font size in px. */
  titleFontSize: number;
  /** Lines the title may occupy on this arc. */
  maxLines: 1 | 2;
  /** Word-pack result — drives both rendering and overflow detection. */
  fit: FitTitleResult;
}

export function computeArcTitleLayout(params: {
  /** Exactly what renders — the event's emoji already inlined, when it has one. */
  title: string;
  arcSpan: number;
  innerRadius: number;
  outerRadius: number;
}): ArcTitleLayout {
  const { title, arcSpan, innerRadius, outerRadius } = params;
  const arcHeight = outerRadius - innerRadius;
  const titleRadius = innerRadius + arcHeight * TITLE_RADIUS_RATIO;
  const titleFontSize = roundCoord(arcHeight * TITLE_FONT_SIZE_RATIO);
  const maxLines: 1 | 2 = arcSpan >= TWO_LINE_MIN_SPAN_DEGREES ? 2 : 1;
  const fit = fitTitleToArc(title, arcSpan, titleRadius, titleFontSize, maxLines);
  return { titleRadius, titleFontSize, maxLines, fit };
}

/**
 * The duration text for an arc's second line, or `undefined` when the line will not fit there (#35).
 *
 * Two gates, both derived rather than chosen:
 *
 * **Radial.** Adding the line moves the title outward onto the two-line radii, so both lines and
 * whatever is stroked on the ring's edges have to fit inside the ring. They do not always: an
 * elapsed arc's outline is sized from the whole *band* (#26, deliberately, so its weight does not
 * thin with overlap depth) while the text is sized from this arc's *ring*. On the 600-unit dial that
 * leaves 11.08 units of clearance on a lone arc, 2.80 on a two-deep ring, **0.03** on a three-deep
 * one and **−1.35** on a four-deep one — so on a crowded cluster the outward line lands on the
 * outline. `edgeStrokeWidth` is what the caller draws there, since the elapsed treatment is the
 * renderer's business, not this layout's.
 *
 * The gate is checked against that stroke whether or not the event has elapsed yet: a duration that
 * appeared and vanished as an event crossed into elapsed would flicker on the wall.
 *
 * **Angular.** Both strings have to fit the character budget at the *inner* of the two radii. Not
 * the title's own radius: adding this line displaces the title onto the opposite one, and which
 * that is flips with the half of the dial — so on the lower half a title fitted at the centre would
 * be moved inward onto a 4.6% smaller budget and could overrun the arc it was measured against.
 * Taking the tighter radius for both also makes an arc and its mirror image across the dial reach
 * the same decision, rather than one carrying a duration the other cannot.
 *
 * Deliberately no span threshold and no compact fallback. The angular gate is derived from arc
 * length, so it gates itself; and a dial mixing "2 hr 25" on one arc with "2h25" on the next is the
 * second-glance failure the whole premise rules out. An arc too narrow for the one format shows
 * nothing, and its floating label carries the duration instead.
 */
export function fitDurationLine(params: {
  durationMinutes: number;
  arcSpan: number;
  /** The single line of title this would sit under, which it displaces off the centre radius. */
  titleLine: string;
  /** Centre of the two-line stack — the radius that single line would otherwise have taken. */
  titleRadius: number;
  fontSize: number;
  /** This arc's own ring, which both lines have to sit inside. */
  innerRadius: number;
  outerRadius: number;
  /** Width of the widest stroke the caller draws on the ring's own outline. */
  edgeStrokeWidth: number;
}): string | undefined {
  const {
    durationMinutes,
    arcSpan,
    titleLine,
    titleRadius,
    fontSize,
    innerRadius,
    outerRadius,
    edgeStrokeWidth
  } = params;

  const text = formatEventDuration(durationMinutes);
  if (text.length === 0) return undefined;

  // A stroke straddles its path, so it reaches half its width into the ring from either edge.
  const reach = edgeStrokeWidth / 2 + EDGE_CLEARANCE;
  const lineHalfHeight = fontSize * TITLE_LINE_OFFSET_RATIO + fontSize / 2;
  if (titleRadius + lineHalfHeight > outerRadius - reach) return undefined;
  if (titleRadius - lineHalfHeight < innerRadius + reach) return undefined;

  const innerLineRadius = titleRadius - fontSize * TITLE_LINE_OFFSET_RATIO;
  const budget = arcCharBudget(arcSpan, innerLineRadius, fontSize);
  const widest = Math.max(visualWidth(text), visualWidth(titleLine));
  return widest <= budget ? text : undefined;
}
