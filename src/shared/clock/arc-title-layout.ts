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
 * Deliberately uncapped in *absolute* terms. An inherited ceiling of 18 units meant that widening
 * the band — the whole response to "it cannot be read from there" — bought a thicker arc carrying
 * the same small text. The ratio already adapts to however much radial room a ring actually has,
 * including when stacking divides the band, so a ceiling only ever fought the intent.
 *
 * `computeArcTitleLayout` does hold the result to the room the ring's own edge strokes leave (#67),
 * which is a different thing: that limit is derived from the band and grows with it, so widening the
 * band still buys bigger text.
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
 *
 * Measured to the glyph *em box*, as every radial gate on this band is. Real ink reaches past it —
 * 0.54 units per side at a 3.93 font — so a clearance of one unit is nearer half that of actual gap;
 * #78 carries the correction, which touches every one of those gates rather than this constant alone.
 */
export const TITLE_EDGE_CLEARANCE = 1;

/** Slack when comparing a ring's thickness with the band's, since the one is derived from the other. */
const RING_EQUALITY_TOLERANCE = 1e-6;

export interface ArcTitleLayout {
  /** Curved-text baseline radius. */
  titleRadius: number;
  /** Resolved title font size in px. */
  titleFontSize: number;
  /**
   * Half the radial gap between two stacked baselines, in the same units as the radii.
   *
   * Stated here rather than left to the renderer to restate the ratio: the clearance guarantee below
   * is about where these lines land, so one place should decide it. Equal to
   * `titleFontSize × TITLE_LINE_OFFSET_RATIO` by construction.
   */
  lineOffset: number;
  /** Lines the title may occupy on this arc. */
  maxLines: 1 | 2;
  /** Word-pack result — drives both rendering and overflow detection. */
  fit: FitTitleResult;
}

/**
 * How far the outermost line's glyph band reaches from the centre of the stack, per unit of font
 * size. `central` dominant-baseline puts a glyph band at ±fontSize/2 around its own baseline, and a
 * stacked line's baseline sits `TITLE_LINE_OFFSET_RATIO` further out again.
 *
 * Keyed on the lines a title *actually takes*, not on the two the span allows: charging two-line room
 * to a one-line title cost 10% of its size four deep on a 600-unit dial and 33% on a 300-unit one,
 * where a single line had radial room to spare. Small text on a crowded ring is #70's whole subject,
 * so there is nothing to spend there for a line that is not drawn.
 */
function stackReachRatio(lines: number): number {
  return lines >= 2 ? TITLE_LINE_OFFSET_RATIO + 0.5 : 0.5;
}

export function computeArcTitleLayout(params: {
  /** Exactly what renders — the event's emoji already inlined, when it has one. */
  title: string;
  arcSpan: number;
  innerRadius: number;
  outerRadius: number;
  /**
   * Width of the widest stroke the caller draws on this ring's own outline — the elapsed outline,
   * for the dial. Passed whether or not the event has elapsed: text that moved at the moment an
   * event finished would visibly twitch on a wall display. Defaults to none, for a caller drawing
   * nothing there.
   */
  edgeStrokeWidth?: number;
}): ArcTitleLayout {
  const { title, arcSpan, innerRadius, outerRadius, edgeStrokeWidth = 0 } = params;
  const arcHeight = outerRadius - innerRadius;
  const titleRadius = innerRadius + arcHeight * TITLE_RADIUS_RATIO;
  const maxLines: 1 | 2 = arcSpan >= TWO_LINE_MIN_SPAN_DEGREES ? 2 : 1;

  // The room the stack has, measured from the centre of the ring outward: half the ring, less the
  // half-width a stroke straddling the edge reaches back in, less the clearance to it. A stroke
  // straddles its path, so it takes half its width from each edge (#67).
  const usableHalf = Math.max(
    0,
    arcHeight / 2 - (edgeStrokeWidth / 2 + TITLE_EDGE_CLEARANCE)
  );

  // The word-pack runs at the size the *ring* gives, before any of the above. That keeps the
  // character budget — and so `didOverflow`, and so which titles the dial routes to a floating label
  // — exactly what it was: a capped font is a *larger* budget, and letting the cap widen it would
  // quietly move borderline titles off a legible 17.52-unit card onto arc text a quarter that size,
  // which is the trade #70 exists to question rather than one to make in passing. Lines packed for a
  // larger font and drawn at a smaller one can only leave angular slack, never overrun.
  const preferred = roundCoord(arcHeight * TITLE_FONT_SIZE_RATIO);
  const fit = fitTitleToArc(title, arcSpan, titleRadius, preferred, maxLines);

  // Then held to what the ring's own strokes leave. Not the absolute 18-unit ceiling #35's comment
  // records removing: that one meant widening the band bought a thicker arc carrying the same small
  // text, whereas this limit scales with the band exactly as the ratio does. It binds only where the
  // stroke genuinely takes the space — a two-line stack four deep on a 600-unit dial, three deep on a
  // 300-unit one — and truncates to `roundCoord`'s own precision rather than rounding, since rounding
  // a *limit* upward is how a ten-thousandth of an overlap gets back in.
  //
  // `fitDurationLine` can add a second line under a one-line title (#35), which this has not budgeted
  // for. Deliberately: that function applies this same clearance to this same font size and declines
  // where the pair would not fit, so the stack stays bounded whichever line asked for it.
  const ceiling = Math.floor((usableHalf / stackReachRatio(fit.lines.length)) * 1e4) / 1e4;
  const titleFontSize = Math.min(preferred, ceiling);

  const lineOffset = titleFontSize * TITLE_LINE_OFFSET_RATIO;
  return { titleRadius, titleFontSize, lineOffset, maxLines, fit };
}

/**
 * The duration text for an arc's second line, or `undefined` when the line does not belong there
 * (#35).
 *
 * Three gates, all derived rather than chosen:
 *
 * **Legibility.** The arc must have the whole band to itself. Title text is `TITLE_FONT_SIZE_RATIO`
 * of the *ring*, so any division of the band by overlap depth takes it below the size the dial uses
 * for text it means a room to read: on the 600-unit dial a lone arc's title is 21.26 units against
 * the floating label's deliberately-chosen 17.52, but two deep it is 9.99 and three deep 6.24. The
 * title is drawn at that size regardless, because a name is worth having small — a *redundant*
 * channel is not, and rendering the fixture's three-deep cluster showed 6.24-unit text to be a
 * smear along the band rather than words. Stacked-ring titles are #70's subject.
 *
 * **Radial.** Adding the line moves the title outward onto the two-line radii, so both lines and
 * whatever is stroked on the ring's edges have to fit inside the ring. They do not always: an
 * elapsed arc's outline is sized from the whole *band* (#26, deliberately, so its weight does not
 * thin with overlap depth) while the text is sized from this arc's *ring*. On the 600-unit dial that
 * leaves 12.98 units of clearance on a lone arc, 4.69 two deep, **1.93** three deep and **0.55**
 * four deep — and #67 now holds the title's own stack to the same clearance, from the other side. The
 * legibility gate happens to cover every one of those cases today, but this is the check that is
 * actually about not drawing text on a stroke, and the two move independently: before #27 retired the
 * neutral halo the same stroke was 0.12 of the band rather than 0.07, which left **0.13** three deep
 * and **0.09** four deep. Those are the halo *as drawn* — `stroke()` capped it at 0.4 of the ring, so
 * 8.91 and 6.23 rather than the 9.11 the ratio asks for; an earlier revision of this comment quoted
 * 0.03 from the uncapped figure. `edgeStrokeWidth` is what the caller draws there, since the elapsed
 * treatment is the renderer's business, not this layout's.
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
  /** The whole arc band. A ring narrower than it means this arc is sharing with an overlap. */
  bandThickness: number;
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
    bandThickness,
    edgeStrokeWidth
  } = params;

  const text = formatEventDuration(durationMinutes);
  if (text.length === 0) return undefined;

  // Tolerance rather than equality: a ring is derived by dividing the band, so a lone arc's own
  // thickness comes back through floating-point arithmetic rather than as the band verbatim.
  if (outerRadius - innerRadius < bandThickness - RING_EQUALITY_TOLERANCE) return undefined;

  // A stroke straddles its path, so it reaches half its width into the ring from either edge. The
  // offset re-derived below is `ArcTitleLayout.lineOffset` by construction — the layout applies
  // `TITLE_LINE_OFFSET_RATIO` to whatever font size it resolved, capped or not.
  const reach = edgeStrokeWidth / 2 + TITLE_EDGE_CLEARANCE;
  const lineHalfHeight = fontSize * TITLE_LINE_OFFSET_RATIO + fontSize / 2;
  if (titleRadius + lineHalfHeight > outerRadius - reach) return undefined;
  if (titleRadius - lineHalfHeight < innerRadius + reach) return undefined;

  const innerLineRadius = titleRadius - fontSize * TITLE_LINE_OFFSET_RATIO;
  const budget = arcCharBudget(arcSpan, innerLineRadius, fontSize);
  const widest = Math.max(visualWidth(text), visualWidth(titleLine));
  return widest <= budget ? text : undefined;
}
