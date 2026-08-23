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
 * Radial extent of one line of band text, as a multiple of font size (#78).
 *
 * `dominant-baseline: central` centres the *em box* on the baseline point, and every radial
 * clearance here used to be derived from that box — `±fontSize / 2`. Ink reaches further, because a
 * face's ascent plus descent exceeds its em, and the shortfall scales with font size so it bites
 * hardest where the band has least room to give.
 *
 * Measured in the preview's own Chromium at `font-size: 1000`, over printable ASCII, the accented
 * Latin forms a calendar title plausibly carries, and the emoji the dial inlines into titles (#23).
 * Reach either side of the anchor, in ems:
 *
 * | resolved face | em box | above | below |
 * | --- | --- | --- | --- |
 * | `system-ui` → DejaVu Sans | 1.164 | 0.591 | 0.596 |
 * | Liberation Sans | 1.117 | 0.591 | 0.597 |
 *
 * A bound over the faces a container can install, not a fact about the smart board's — `system-ui`
 * resolves differently there. What makes a static number defensible anyway is that **the emoji is
 * what binds**: colour emoji come from the fallback face rather than the text face, so ±0.59 em is
 * carried whatever `system-ui` turns out to be. Note also that the em box is not a conservative
 * approximation of ink but a smaller one — accented capitals overshoot the ascent on every face
 * measured.
 */
export const INK_HEIGHT_RATIO = 1.2;

/** Ink left between two stacked lines — the "hair to spare" `TITLE_LINE_OFFSET_RATIO` is chosen for. */
const TITLE_LINE_GAP_RATIO = 0.1;

/**
 * Half the gap between two curved baselines, as a fraction of font size.
 *
 * Derived rather than chosen, so the separation claim is arithmetic the code performs instead of
 * prose it contradicts: the previous 0.55 was picked against the em box and put the baselines
 * 1.10 em apart while the ink covered 1.19, so every two-line stack on the dial overlapped itself by
 * 0.09 em — 1.96 units at a lone arc's 21.26 font size.
 */
export const TITLE_LINE_OFFSET_RATIO = (INK_HEIGHT_RATIO + TITLE_LINE_GAP_RATIO) / 2;

/**
 * Clearance a stacked line must keep from whatever is drawn on the ring's edges.
 *
 * One unit, matching the separator's own floor: below that the two are not distinguishable as
 * separate marks anyway, so there is nothing left to protect.
 *
 * Measured to real ink. Every radial gate on this band used to measure to the glyph *em box*, which
 * understates the text by `INK_HEIGHT_RATIO - 1` per em and so delivered a fraction of this unit
 * wherever room was scarce. #89 corrected two of the three gates and #90 the third, so one unit here
 * is now one unit of actual gap rather than nearer half of one.
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
 * How far the outermost line's ink reaches from the centre of the stack, per unit of font size. A
 * line's ink covers `INK_HEIGHT_RATIO` centred on the point `central` dominant-baseline anchors to,
 * and a stacked line's anchor sits `TITLE_LINE_OFFSET_RATIO` further out again.
 *
 * Ink and not the em box (#78): the box is `±fontSize/2`, which is what this used to charge, and it
 * left 0.41 to 0.87 units of the promised `TITLE_EDGE_CLEARANCE` wherever the cap bound — worst on a
 * 900-unit dial four deep, where the band-sized outline is widest against the ring. The em box is not
 * even a conservative approximation of ink, so the shortfall was not a margin being spent, it was one
 * that was never there.
 *
 * Keyed on the lines a title *actually takes*, not on the two the span allows: charging two-line room
 * to a one-line title costs 24% of its size four deep on a 600-unit dial and 44% on a 300-unit one,
 * where a single line has radial room to spare. (Those read 10% and 33% when #67 chose the rule, at
 * the 0.55 line offset of the time; both grew as #89 and #90 corrected the model.) Small text on a crowded ring is #70's whole subject,
 * so there is nothing to spend there for a line that is not drawn.
 */
function stackReachRatio(lines: number): number {
  return lines >= 2
    ? TITLE_LINE_OFFSET_RATIO + INK_HEIGHT_RATIO / 2
    : INK_HEIGHT_RATIO / 2;
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
  // stroke genuinely takes the space — a two-line stack three or four deep on a 600-unit dial, three or
  // four deep on a 300-unit one, four deep on a 900-unit one; never a one-line title at any of them —
  // and truncates to `roundCoord`'s own precision rather than rounding, since rounding
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
 * for text it means a room to read: on the 600-unit dial a lone arc's title is 21.2576 units against
 * the floating label's deliberately-chosen 17.52, but two deep it is 9.99 and three deep 6.24. The
 * title is drawn at that size regardless, because a name is worth having small — a *redundant*
 * channel is not, and rendering the fixture's three-deep cluster showed 6.24-unit text to be a
 * smear along the band rather than words. Stacked-ring titles are #70's subject.
 *
 * **Radial.** Adding the line moves the title outward onto the two-line radii, so both lines and
 * whatever is stroked on the ring's edges have to fit inside the ring. They do not always: an
 * elapsed arc's outline is sized from the whole *band* (#26, deliberately, so its weight does not
 * thin with overlap depth) while the text is sized from this arc's *ring*. On the 600-unit dial,
 * measured the way the gate below decides — `TITLE_EDGE_CLEARANCE` included, so a negative figure is
 * a refusal — the em box left 11.98 units on a lone arc, 3.69 two deep, 0.93 three deep and −0.45
 * four deep. Against real ink (#78) those become **7.73**, **1.70**, **−0.32** and **−1.32**: the
 * two deepest rings cannot carry a stack, where the em-box model admitted three of the four. #67
 * holds the title's own stack to the same clearance from the other side, and its cap leaves those
 * four figures unchanged. The legibility gate happens to cover every one of those cases today, but
 * this is the check that is actually about not drawing text on a stroke, and the two move
 * independently: before #27 retired the neutral halo the same stroke was 0.12 of the band rather
 * than 0.07, and three deep measured **−2.11** — the halo *as drawn*, since `stroke()` capped it
 * at 0.4 of the ring, giving 8.91 rather than the 9.11 the ratio asks for. `edgeStrokeWidth` is what
 * the caller draws there, since the elapsed treatment is the renderer's business, not this layout's.
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
  const lineHalfHeight = fontSize * TITLE_LINE_OFFSET_RATIO + (fontSize * INK_HEIGHT_RATIO) / 2;
  if (titleRadius + lineHalfHeight > outerRadius - reach) return undefined;
  if (titleRadius - lineHalfHeight < innerRadius + reach) return undefined;

  const innerLineRadius = titleRadius - fontSize * TITLE_LINE_OFFSET_RATIO;
  const budget = arcCharBudget(arcSpan, innerLineRadius, fontSize);
  const widest = Math.max(visualWidth(text), visualWidth(titleLine));
  return widest <= budget ? text : undefined;
}
