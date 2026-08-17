/**
 * One calendar event as a coloured donut arc on the dial's outer band, carrying its emoji and a
 * curved title.
 * Ported from next-digital-wall-calendar's `analog-clock/event-arc.tsx`.
 *
 * Read-only by design. NDWC's arcs are `role="button"` wired to an event-detail modal with focus
 * restoration; there is no detail surface here, and inventing one is a UX task rather than a port.
 */
import {
  type ArcTitleLayout,
  type ClockEvent,
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
 * Separator between adjacent arcs, as a fraction of the ring's height, with an absolute floor.
 *
 * A fraction so it thickens with the band rather than thinning as the dial grows; a floor because
 * on a deeply stacked ring the fraction alone would vanish and adjacent arcs would merge into one
 * indistinguishable block.
 */
const ARC_SEPARATOR_RATIO = 0.03;
const ARC_SEPARATOR_MIN = 1;

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
}

export function eventArc({
  event,
  cx,
  cy,
  innerRadius,
  outerRadius,
  layout,
  forceHideTitle = false,
}: EventArcParams): SVGGElement {
  const { id, cleanTitle, color, eventEmoji, startAngle, endAngle } = event;

  const arcSpan = endAngle - startAngle;
  const midAngle = (startAngle + endAngle) / 2;
  const arcHeight = outerRadius - innerRadius;

  const group = svg("g", {
    "data-testid": `event-arc-group-${id}`,
    role: "img",
    // No trailing comma when there is no emoji — a screen reader vocalises it.
    "aria-label": eventEmoji ? `Event: ${cleanTitle}, ${eventEmoji}` : `Event: ${cleanTitle}`,
  });

  group.append(
    svg("path", {
      "data-testid": `event-arc-${id}`,
      d: describeArc(cx, cy, outerRadius, innerRadius, startAngle, endAngle),
      fill: color,
      "fill-opacity": ARC_FILL_OPACITY,
      // A token, not a literal: this is the separator between adjacent arcs and between the
      // arcs and the face, so it has to track whichever background sits behind them.
      stroke: "var(--card)",
      "stroke-width": roundCoord(
        Math.max(ARC_SEPARATOR_MIN, arcHeight * ARC_SEPARATOR_RATIO)
      ),
    })
  );

  if (eventEmoji && arcSpan >= EMOJI_MIN_SPAN_DEGREES) {
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

  const resolved =
    layout ?? computeArcTitleLayout({ cleanTitle, arcSpan, innerRadius, outerRadius });
  const showTitle = !forceHideTitle && arcSpan >= TITLE_MIN_SPAN_DEGREES;

  if (showTitle && resolved.fit.lines.length > 0) {
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

    const defs = svg("defs");
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
            fill: readableTextColor(color),
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

    group.append(defs, titleGroup);
  }

  return group;
}
