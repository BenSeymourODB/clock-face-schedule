/**
 * A title too long for its arc, rendered outside the dial with a thin connector back to it.
 * Ported from next-digital-wall-calendar's `analog-clock/floating-label.tsx`.
 *
 * Pure positioning — no state. The vertical clamp is delegated to `clampLabelPosition` so the
 * dial's layout height stays fixed no matter how many titles overflow; without it a label near
 * 12 or 6 o'clock would push everything below it down the page.
 *
 * Carries no role or aria-label: the arc it points at already announces the same title, and a
 * second announcement of the same event is noise.
 */
import {
  type ClockBox,
  clampLabelPosition,
  faceClearanceLimit,
  fitLabelToWidth,
  labelCardHeight,
  labelLineOffsets,
  labelWidthLimit,
  polarToCartesian,
  rectEdgeIntersection,
  roundCoord,
} from "../../shared/clock";
import { svg } from "../svg";

const FONT_STACK = "system-ui, -apple-system, sans-serif";

/**
 * Lines a card may grow to before its text is cut instead.
 *
 * Three is a compromise the geometry forces rather than a preference. The frame's inscribed circle
 * leaves roughly 105 units of width at 3 and 9 o'clock, so lines are short and a long title needs
 * many of them — but a card tall enough to hold five reaches the face from the side, which is the
 * defect being fixed. Beyond three lines the title is ellipsized and the arc still carries the
 * event's colour and emoji.
 */
const MAX_LINES = 3;

const RECT_PADDING_X = 6;
const RECT_PADDING_Y = 3;
const RECT_CORNER_RADIUS = 3;
const RECT_BORDER_OPACITY = 0.4;
const CONNECTOR_OPACITY = 0.6;

/**
 * Opacity of the colour wash laid over the card's field, tying it to its arc without recomputing
 * the chip's colour (#29). Composited over `var(--card-foreground)`, not computed to a hex — so it
 * is correct in any theme with no token lookup here.
 *
 * 20% leaves wide headroom rather than sitting on the ceiling: `compositeOver` against every
 * palette colour, including the two that fail #26/#27's contrast check outright, puts the worst
 * case (⚫ `#1F2937`) at 10.9:1 on `var(--card)` text — nowhere near the 4.5:1 floor that would force
 * `readableTextColor` back into play. Measured, not assumed; see contrast.test.ts.
 */
const WASH_OPACITY = 0.2;

/** Attributes shared by the card's three stacked rects — same rounded rectangle, different paint. */
function cardRect(x: number, y: number, width: number, height: number) {
  return {
    x: roundCoord(x),
    y: roundCoord(y),
    width: roundCoord(width),
    height: roundCoord(height),
    rx: RECT_CORNER_RADIUS,
    ry: RECT_CORNER_RADIUS,
  };
}

/**
 * Connector and card border, as a fraction of the label's font size with an absolute floor. The
 * label already scales with the band it belongs to, so its linework should too — a fixed 1-unit
 * hairline disappeared as the dial grew.
 */
const STROKE_RATIO = 0.08;
const STROKE_MIN = 1;

const DEFAULT_FONT_SIZE = 14;

export interface FloatingLabelParams {
  /** Stable id, normally the event id — used for test ids. */
  id: string;
  /** The text to render, normally `cleanTitle`. */
  text: string;
  /** Arc midpoint angle in degrees, 0° = 12 o'clock, clockwise. */
  anchorAngle: number;
  /** Outer radius of the arc — where the connector starts. */
  anchorRadius: number;
  /** Radius of the circle the label centre sits on, before the vertical clamp. */
  labelRadius: number;
  /** Event colour, used for the connector and the card border. */
  color: string;
  cx: number;
  cy: number;
  /** Vertical extents of the dial, defining the clamp band. */
  clockBox: ClockBox;
  /** Radius of the clock face, which the card must not reach. */
  faceRadius: number;
  fontSize?: number;
}

export function floatingLabel({
  id,
  text,
  anchorAngle,
  anchorRadius,
  labelRadius,
  color,
  cx,
  cy,
  clockBox,
  faceRadius,
  fontSize = DEFAULT_FONT_SIZE,
}: FloatingLabelParams): SVGGElement {
  const anchor = polarToCartesian(cx, cy, anchorRadius, anchorAngle);

  // Where the label wants to be, before any clamping — and therefore how much width is available
  // there. Sizing the card to that room is what keeps the clamp from having to pull a too-wide
  // card inward across the numerals (#21); the clamp below is left in place as a backstop and,
  // for any card this function produces, does nothing horizontally.
  const natural = polarToCartesian(cx, cy, labelRadius, anchorAngle);
  const maxWidth = Math.min(
    labelWidthLimit(natural.x, clockBox),
    faceClearanceLimit(
      natural,
      cx,
      cy,
      faceRadius,
      labelCardHeight(MAX_LINES, fontSize, RECT_PADDING_Y)
    )
  );
  const { lines, width, height } = fitLabelToWidth(text, maxWidth, fontSize, MAX_LINES, {
    x: RECT_PADDING_X,
    y: RECT_PADDING_Y,
  });

  const centre = clampLabelPosition(natural, clockBox, width / 2);

  // Stop the connector at the card's edge rather than letting it run underneath the fill.
  const connectorEnd = rectEdgeIntersection(centre, width, height, anchor);
  const strokeWidth = roundCoord(Math.max(STROKE_MIN, fontSize * STROKE_RATIO));

  const group = svg("g", { "data-testid": `floating-label-${id}` });

  group.append(
    svg("line", {
      "data-testid": `floating-label-connector-${id}`,
      x1: roundCoord(anchor.x),
      y1: roundCoord(anchor.y),
      x2: roundCoord(connectorEnd.x),
      y2: roundCoord(connectorEnd.y),
      stroke: color,
      "stroke-opacity": CONNECTOR_OPACITY,
      "stroke-width": strokeWidth,
    }),
    // The card deliberately inverts the face tokens — a light chip carrying dark text, sitting
    // off the dial. NDWC hard-coded white and #1f2937 for this; using the tokens gives the same
    // result on this palette while staying tunable, and keeps ADR 0007's set at five.
    //
    // Three stacked rects, not one: a wash tinting the field needs a plain surface under it to
    // blend against, and the border wants to sit above the wash so it reads at full strength
    // rather than through it. Splitting fill from stroke is what makes that order possible.
    svg("rect", {
      "data-testid": `floating-label-rect-${id}`,
      ...cardRect(centre.x - width / 2, centre.y - height / 2, width, height),
      fill: "var(--card-foreground)",
    }),
    svg("rect", {
      "data-testid": `floating-label-wash-${id}`,
      ...cardRect(centre.x - width / 2, centre.y - height / 2, width, height),
      fill: color,
      "fill-opacity": WASH_OPACITY,
    }),
    svg("rect", {
      "data-testid": `floating-label-border-${id}`,
      ...cardRect(centre.x - width / 2, centre.y - height / 2, width, height),
      fill: "none",
      stroke: color,
      "stroke-opacity": RECT_BORDER_OPACITY,
      "stroke-width": strokeWidth,
    }),
    // One <text> per line, as the arc does for its curved lines — no tspan baseline arithmetic.
    ...labelLineOffsets(lines.length, fontSize).map((offset, index) =>
      svg(
        "text",
        {
          "data-testid": `floating-label-text-${id}-${index}`,
          x: roundCoord(centre.x),
          y: roundCoord(centre.y + offset),
          "text-anchor": "middle",
          "dominant-baseline": "central",
          "font-size": fontSize,
          "font-family": FONT_STACK,
          fill: "var(--card)",
        },
        [lines[index]]
      )
    )
  );

  return group;
}
