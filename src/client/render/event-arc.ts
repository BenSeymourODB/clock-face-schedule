/**
 * One calendar event as a coloured donut arc on the dial's outer band, carrying its emoji and a
 * curved title.
 * Ported from next-digital-wall-calendar's `analog-clock/event-arc.tsx`.
 *
 * Read-only by design. NDWC's arcs are `role="button"` wired to an event-detail modal with focus
 * restoration; there is no detail surface here, and inventing one is a UX task rather than a port.
 */
import {
  type ArcFeathers,
  type ArcTitleLayout,
  type ClockEvent,
  type FeatherSpan,
  combineTitleWithEmoji,
  computeArcFeathers,
  computeArcTitleLayout,
  describeArc,
  describeTextArc,
  polarToCartesian,
  readableTextColor,
  roundCoord,
} from "../../shared/clock";
import { svg } from "../svg";

const FONT_STACK = "system-ui, -apple-system, sans-serif";

/** Below this span there is not enough arc to render an emoji legibly. */
const EMOJI_MIN_SPAN_DEGREES = 10;

/** Below this span there is not enough arc for a title. */
const TITLE_MIN_SPAN_DEGREES = 20;

/**
 * Where the emoji sits across the ring, and how big it is, as fractions of the ring's height.
 *
 * The emoji and the title stack radially, and a two-line title is tall: at the inherited ratios
 * they needed 1.03 of the ring between them and overlapped by a measured 8.7 units on a
 * full-width band. Both were reduced to fit, the emoji more than the title — the title is the
 * specific information and the emoji the category cue, so the title wins the argument.
 *
 * Uncapped, for the same reason the title's ceiling went: a cap in viewBox units means "never
 * larger than this fraction of the dial", which fights every attempt to make the dial readable
 * from further away.
 */
const EMOJI_RADIUS_RATIO = 0.17;
const EMOJI_FONT_SIZE_RATIO = 0.3;

/**
 * Half the gap between two curved title baselines, as a fraction of font size. `central`
 * dominant-baseline puts each glyph band at ±fontSize/2 around its centre, so 2 × 0.55 clears
 * them with a hair to spare.
 */
const TITLE_LINE_OFFSET_RATIO = 0.55;

const ARC_FILL_OPACITY = 0.85;

/**
 * Fill left under an elapsed arc.
 *
 * Zero draws the pure outline #26 specifies. A little body might read better at distance, so this
 * is a constant rather than an omission — but note it can only add *weight*, never contrast: 10% of
 * `#1F2937` over `#16181d` is still `#16181d` to the eye. Colour legibility is #27's problem.
 */
const ELAPSED_FILL_OPACITY = 0;

/**
 * Separator between adjacent arcs, as a fraction of the ring's height, with an absolute floor.
 *
 * A fraction so it thickens with the band rather than thinning as the dial grows; a floor because
 * on a deeply stacked ring the fraction alone would vanish and adjacent arcs would merge into one
 * indistinguishable block.
 */
const ARC_SEPARATOR_RATIO = 0.03;
const ARC_SEPARATOR_MIN = 1;

/**
 * An elapsed arc's outline, and the neutral band beneath it, as fractions of **the whole band** —
 * not of this arc's ring.
 *
 * Heavier than the separator because the outline now *is* the arc: with no fill behind it, a
 * hairline is all that stands between the event and not being drawn. Sizing from the ring got that
 * exactly backwards on a stacked cluster, where the ring is a third of the band: rendering showed a
 * 1.56-unit outline against a 2.28-unit *live* separator, so the arcs that had least room also got
 * the faintest outline. The band does not change with overlap depth, so every elapsed arc on the
 * dial now carries the same weight.
 *
 * The neutral band is load-bearing rather than decorative. Outlined, an event's colour becomes the
 * foreground against a background it did not choose, and two of the palette's nine fail there —
 * ⚫ gray-800 measures 1.21:1 on `--card`, which is not a faint edge but no edge. Drawing
 * `var(--border)` (3.7:1) wider and underneath means the shape always reads and the colour carries
 * identity rather than legibility. #27 fixes the colours themselves, and may retire this.
 */
const ELAPSED_BORDER_RATIO = 0.07;
const ELAPSED_HALO_RATIO = 0.12;

/**
 * Ceiling on either stroke, as a fraction of the ring it is drawn on.
 *
 * A stroke straddles its path, so one wider than the ring closes the hollow interior back up and
 * the arc reads as filled again — which is the one thing an elapsed arc must not do.
 */
const ELAPSED_STROKE_MAX_RATIO = 0.4;

interface FeatherMaskParams {
  id: string;
  feathers: ArcFeathers;
  cx: number;
  cy: number;
  innerRadius: number;
  outerRadius: number;
  separatorWidth: number;
}

/**
 * A luminance mask that fades the arc out where the period, not the event, ended it.
 *
 * Masks the whole path rather than tinting its fill, because the separator stroke traces the arc's
 * closed outline — leave it alone and a crisp line still caps the boundary, which is the very
 * thing the fade exists to deny.
 *
 * A white ground makes everything opaque; each fade lays a black gradient over it, running from
 * opaque black at the boundary to zero alpha where the arc resumes full strength. The gradient is
 * painted onto a wedge rather than the whole box so that `pad` spread cannot reach the far side of
 * an arc that curves back around past 180°.
 */
function featherMask({
  id,
  feathers,
  cx,
  cy,
  innerRadius,
  outerRadius,
  separatorWidth,
}: FeatherMaskParams): SVGMaskElement | undefined {
  const spans = [
    { key: "start", span: feathers.start },
    { key: "end", span: feathers.end },
  ].filter((entry): entry is { key: string; span: FeatherSpan } => entry.span !== undefined);

  if (spans.length === 0) return undefined;

  // The wedge has to swallow the stroke, which straddles the path by half its width in every
  // direction — including angularly, past the boundary.
  const padDegrees = (separatorWidth / outerRadius) * (180 / Math.PI);
  const box = {
    x: roundCoord(cx - outerRadius - separatorWidth),
    y: roundCoord(cy - outerRadius - separatorWidth),
    size: roundCoord((outerRadius + separatorWidth) * 2),
  };
  // A linear gradient runs along a straight axis, and over ten degrees the chord it follows is
  // indistinguishable from the arc: a radial offset is perpendicular to that axis, so it projects
  // onto it only to second order.
  const midRadius = (innerRadius + outerRadius) / 2;

  const mask = svg("mask", {
    id: `arc-fade-${id}`,
    maskUnits: "userSpaceOnUse",
    x: box.x,
    y: box.y,
    width: box.size,
    height: box.size,
  });

  mask.append(
    svg("rect", { x: box.x, y: box.y, width: box.size, height: box.size, fill: "#ffffff" })
  );

  for (const { key, span } of spans) {
    const gradientId = `arc-fade-${id}-${key}`;
    const boundary = polarToCartesian(cx, cy, midRadius, span.fromAngle);
    const resumes = polarToCartesian(cx, cy, midRadius, span.toAngle);

    const towardArc = Math.sign(span.toAngle - span.fromAngle);
    const wedgeEdge = span.fromAngle - towardArc * padDegrees;

    mask.append(
      svg(
        "linearGradient",
        {
          id: gradientId,
          gradientUnits: "userSpaceOnUse",
          x1: boundary.x,
          y1: boundary.y,
          x2: resumes.x,
          y2: resumes.y,
        },
        [
          svg("stop", { offset: "0", "stop-color": "#000000", "stop-opacity": 1 }),
          svg("stop", { offset: "1", "stop-color": "#000000", "stop-opacity": 0 }),
        ]
      ),
      svg("path", {
        d: describeArc(
          cx,
          cy,
          outerRadius + separatorWidth,
          Math.max(0, innerRadius - separatorWidth),
          Math.min(wedgeEdge, span.toAngle),
          Math.max(wedgeEdge, span.toAngle)
        ),
        fill: `url(#${gradientId})`,
      })
    );
  }

  return mask;
}

export interface EventArcParams {
  event: ClockEvent;
  cx: number;
  cy: number;
  innerRadius: number;
  outerRadius: number;
  /**
   * Computed once by the dial and passed down, so this arc and its floating label cannot
   * disagree about whether the title overflowed — a disagreement shows the title twice or not
   * at all. Recomputed here only when an arc is rendered standalone.
   */
  layout?: ArcTitleLayout;
  /** The title is rendering as a floating label instead, so suppress the in-arc copy. */
  forceHideTitle?: boolean;
  /** The event has finished: draw it hollow, as an outline rather than a filled block. */
  isElapsed?: boolean;
  /**
   * Width of the whole arc band, which an elapsed outline is sized from so that its weight does
   * not shrink with overlap depth. Defaults to this arc's own ring, for standalone rendering.
   */
  bandThickness?: number;
}

export function eventArc({
  event,
  cx,
  cy,
  innerRadius,
  outerRadius,
  layout,
  forceHideTitle = false,
  isElapsed = false,
  bandThickness,
}: EventArcParams): SVGGElement {
  const { id, cleanTitle, color, eventEmoji, startAngle, endAngle } = event;
  const displayTitle = combineTitleWithEmoji(cleanTitle, eventEmoji);

  const arcSpan = endAngle - startAngle;
  const midAngle = (startAngle + endAngle) / 2;
  const arcHeight = outerRadius - innerRadius;

  const group = svg("g", {
    "data-testid": `event-arc-group-${id}`,
    role: "img",
    "aria-label": `Event: ${displayTitle}`,
  });

  const defs = svg("defs");
  group.append(defs);

  const separatorWidth = roundCoord(
    Math.max(ARC_SEPARATOR_MIN, arcHeight * ARC_SEPARATOR_RATIO)
  );
  const mask = featherMask({
    id,
    feathers: computeArcFeathers(event),
    cx,
    cy,
    innerRadius,
    outerRadius,
    separatorWidth,
  });
  if (mask) defs.append(mask);

  // Fill and outline are separate paths because an elapsed arc needs them treated differently —
  // the fill goes and the outline stays. Sharing one path, as this did, forces the two to move
  // together. Both carry the fade mask, so a clamped arc still fades whole.
  const d = describeArc(cx, cy, outerRadius, innerRadius, startAngle, endAngle);
  const fade = mask ? `url(#arc-fade-${id})` : undefined;
  // Sized from the band, capped by the ring: uniform weight wherever there is room for it, and
  // narrower only where the ring genuinely cannot carry it.
  const band = bandThickness ?? arcHeight;
  const stroke = (ratio: number) =>
    roundCoord(
      Math.max(
        ARC_SEPARATOR_MIN,
        Math.min(band * ratio, arcHeight * ELAPSED_STROKE_MAX_RATIO)
      )
    );

  group.append(
    svg("path", {
      "data-testid": `event-arc-${id}`,
      // Which layer of the arc this is. `data-testid` says which event; this says which part,
      // so a caller can find the fill alone — which is what a drain mask (#28) needs.
      "data-arc-part": "fill",
      d,
      fill: color,
      "fill-opacity": isElapsed ? ELAPSED_FILL_OPACITY : ARC_FILL_OPACITY,
      stroke: "none",
      mask: fade,
    }),
    svg("path", {
      "data-testid": `event-arc-border-${id}`,
      "data-arc-part": "separator",
      d,
      fill: "none",
      // Live, this is the separator between adjacent arcs and between the arcs and the face, so it
      // tracks whatever sits behind them. Elapsed, it is the guaranteed-visible band that keeps a
      // low-contrast event from disappearing along with its fill.
      stroke: isElapsed ? "var(--border)" : "var(--card)",
      "stroke-width": isElapsed ? stroke(ELAPSED_HALO_RATIO) : separatorWidth,
      mask: fade,
    })
  );

  if (isElapsed) {
    group.append(
      svg("path", {
        "data-testid": `event-arc-outline-${id}`,
        "data-arc-part": "outline",
        d,
        fill: "none",
        stroke: color,
        "stroke-width": stroke(ELAPSED_BORDER_RATIO),
        mask: fade,
      })
    );
  }

  const resolved =
    layout ?? computeArcTitleLayout({ title: displayTitle, arcSpan, innerRadius, outerRadius });
  const showTitle = !forceHideTitle && arcSpan >= TITLE_MIN_SPAN_DEGREES;
  const titleRendersOnArc = showTitle && resolved.fit.lines.length > 0;

  // The emoji is inline with the title wherever the title renders — on the arc, or on the floating
  // label that took it over. This glyph is the fallback for the one case neither covers: an arc too
  // narrow to carry a title at all, where nothing else would say what the event is.
  //
  // Drawing it alongside a floating label instead collides with it. Measured on the fixture's
  // conference event, the glyph landed at x∈[91,122] y∈[166,188] against a card whose last line
  // spanned x∈[-1,99] y∈[156,173] — overlapping text, for a cue the label already carries inline.
  const showStandaloneGlyph = !forceHideTitle && !titleRendersOnArc;

  if (eventEmoji && showStandaloneGlyph && arcSpan >= EMOJI_MIN_SPAN_DEGREES) {
    const position = polarToCartesian(
      cx,
      cy,
      innerRadius + arcHeight * EMOJI_RADIUS_RATIO,
      midAngle
    );
    // Counter-rotate on the bottom half so the glyph stays upright.
    const rotation = midAngle > 90 && midAngle < 270 ? midAngle + 180 : midAngle;

    group.append(
      svg(
        "text",
        {
          "data-testid": `event-emoji-${id}`,
          x: position.x,
          y: position.y,
          "text-anchor": "middle",
          "dominant-baseline": "central",
          "font-size": roundCoord(arcHeight * EMOJI_FONT_SIZE_RATIO),
          transform: `rotate(${roundCoord(rotation)}, ${position.x}, ${position.y})`,
        },
        [eventEmoji]
      )
    );
  }

  if (titleRendersOnArc) {
    const { titleRadius, titleFontSize, fit } = resolved;
    const lineOffset = titleFontSize * TITLE_LINE_OFFSET_RATIO;

    // The first line has to appear *above* the second on screen, and which radius that is flips
    // with the half of the dial: further out is higher at the top and lower at the bottom. Always
    // putting line one on the outer radius made lower-half titles read bottom-up.
    const isBottomHalf = midAngle > 90 && midAngle < 270;
    const radii =
      fit.lines.length === 2
        ? isBottomHalf
          ? [titleRadius - lineOffset, titleRadius + lineOffset]
          : [titleRadius + lineOffset, titleRadius - lineOffset]
        : [titleRadius];

    const titleGroup = svg("g", { "data-testid": `event-title-${id}` });

    radii.forEach((radius, index) => {
      const pathId = `text-path-${id}-${index}`;

      defs.append(
        svg("path", {
          id: pathId,
          d: describeTextArc(cx, cy, radius, startAngle, endAngle),
          fill: "none",
        })
      );

      // One <text> per line rather than one <text> with two <textPath> children, so each line
      // has its own typographic context and there is no SVG 2 path-sequencing question.
      titleGroup.append(
        svg(
          "text",
          {
            "font-size": titleFontSize,
            "font-weight": 500,
            // Chosen per arc: the title sits on the event's own colour, which no token
            // describes and which the calendar may supply. NDWC used a fixed white, which
            // measures 1.9:1 on the palette's yellow (#15).
            //
            // Once the fill is gone the text sits on the dial's own background instead, and the
            // theme already guarantees a pairing for that — `--card-foreground` is 16:1 on
            // `--card`. Computing a ratio there would need the token's hex, which this does not
            // have; the event colour would reintroduce the very failures #27 is about.
            fill: isElapsed ? "var(--card-foreground)" : readableTextColor(color),
            "font-family": FONT_STACK,
          },
          [
            svg(
              "textPath",
              {
                href: `#${pathId}`,
                startOffset: "50%",
                "text-anchor": "middle",
                "dominant-baseline": "central",
              },
              [fit.lines[index]]
            ),
          ]
        )
      );
    });

    group.append(titleGroup);
  }

  return group;
}
