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
import { type FitTitleResult, fitTitleToArc } from './fit-title';

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
