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
  polarToCartesian,
  rectEdgeIntersection,
  roundCoord,
} from "../../shared/clock";
import { svg } from "../svg";

const FONT_STACK = "system-ui, -apple-system, sans-serif";

/** Rough advance width per character, as a fraction of font size. */
const CHAR_WIDTH_RATIO = 0.6;
const LINE_HEIGHT_RATIO = 1.4;

const RECT_PADDING_X = 6;
const RECT_PADDING_Y = 3;
const RECT_CORNER_RADIUS = 3;
const RECT_BORDER_OPACITY = 0.4;
const CONNECTOR_OPACITY = 0.6;

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
  fontSize = DEFAULT_FONT_SIZE,
}: FloatingLabelParams): SVGGElement {
  const anchor = polarToCartesian(cx, cy, anchorRadius, anchorAngle);

  const width = text.length * fontSize * CHAR_WIDTH_RATIO + RECT_PADDING_X * 2;
  const height = fontSize * LINE_HEIGHT_RATIO + RECT_PADDING_Y * 2;

  // Width is computed first because the horizontal clamp needs it: unlike the vertical one, it
  // holds the card's edges inside the box rather than just its centre.
  const centre = clampLabelPosition(
    polarToCartesian(cx, cy, labelRadius, anchorAngle),
    clockBox,
    width / 2
  );

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
    svg("rect", {
      "data-testid": `floating-label-rect-${id}`,
      x: roundCoord(centre.x - width / 2),
      y: roundCoord(centre.y - height / 2),
      width: roundCoord(width),
      height: roundCoord(height),
      rx: RECT_CORNER_RADIUS,
      ry: RECT_CORNER_RADIUS,
      fill: "var(--card-foreground)",
      stroke: color,
      "stroke-opacity": RECT_BORDER_OPACITY,
      "stroke-width": strokeWidth,
    }),
    svg(
      "text",
      {
        "data-testid": `floating-label-text-${id}`,
        x: roundCoord(centre.x),
        y: roundCoord(centre.y),
        "text-anchor": "middle",
        "dominant-baseline": "central",
        "font-size": fontSize,
        "font-family": FONT_STACK,
        fill: "var(--card)",
      },
      [text]
    )
  );

  return group;
}
