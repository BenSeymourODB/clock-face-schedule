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
  roundCoord,
} from "../../shared/clock";
import { svg } from "../svg";

const FONT_STACK = "system-ui, -apple-system, sans-serif";

/** Below this span there is not enough arc to render an emoji legibly. */
const EMOJI_MIN_SPAN_DEGREES = 10;

/** Below this span there is not enough arc for a title. */
const TITLE_MIN_SPAN_DEGREES = 20;

/** Emoji sits this far across the band from its inner edge, so it stacks under the title. */
const EMOJI_RADIUS_RATIO = 0.28;
const EMOJI_FONT_SIZE_RATIO = 0.4;
const EMOJI_FONT_SIZE_MAX = 26;

/**
 * Half the gap between two curved title baselines, as a fraction of font size. `central`
 * dominant-baseline puts each glyph band at ±fontSize/2 around its centre, so 2 × 0.55 clears
 * them with a hair to spare.
 */
const TITLE_LINE_OFFSET_RATIO = 0.55;

const ARC_FILL_OPACITY = 0.85;
const ARC_SEPARATOR_WIDTH = 1.5;

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
      "stroke-width": ARC_SEPARATOR_WIDTH,
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
          "font-size": roundCoord(
            Math.min(arcHeight * EMOJI_FONT_SIZE_RATIO, EMOJI_FONT_SIZE_MAX)
          ),
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
    const radii =
      fit.lines.length === 2
        ? [titleRadius + lineOffset, titleRadius - lineOffset]
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
            // Inherited literal — titles sit on the event colour, which no token describes.
            // NDWC claimed white holds WCAG AA against any of them; it does not, and fails
            // badly on yellow. Left as the port's baseline, measured in #15.
            fill: "white",
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
