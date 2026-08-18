/**
 * The card appearance shared by a floating label and (once #39's panel layout lands) an agenda
 * card — factored out per #38 so the two never restyle independently the way #15's colour
 * decision once got made twice, by eye, in two places.
 *
 * Deliberately style only: geometry (position, wrapping, clamping) and anything layout-specific
 * — a floating label's connector, an agenda card's start/end times — stays with the caller.
 */
import { labelLineOffsets, roundCoord } from "../../shared/clock";
import { svg } from "../svg";

/** Font stack shared by every card — the dial has no per-event font, only per-event colour. */
export const CARD_FONT_STACK = "system-ui, -apple-system, sans-serif";

export const RECT_PADDING_X = 6;
export const RECT_PADDING_Y = 3;
export const RECT_CORNER_RADIUS = 3;
export const RECT_BORDER_OPACITY = 0.4;

/**
 * Opacity of the colour wash laid over the card's field, tying it to its event without
 * recomputing the chip's colour (#29). Composited over `var(--card-foreground)`, not computed to
 * a hex — so it is correct in any theme with no token lookup here.
 *
 * 20% leaves wide headroom rather than sitting on the ceiling: `compositeOver` against every
 * palette colour, including the two that fail #26/#27's contrast check outright, puts the worst
 * case (⚫ `#1F2937`) at 10.9:1 on `var(--card)` text — nowhere near the 4.5:1 floor that would
 * force `readableTextColor` back into play. Measured, not assumed; see contrast.test.ts.
 */
export const WASH_OPACITY = 0.2;

/**
 * Connector and border weight, as a fraction of the card's font size with an absolute floor. A
 * card scales with the band it belongs to, so its linework should too — a fixed 1-unit hairline
 * disappeared as the dial grew.
 */
const STROKE_RATIO = 0.08;
const STROKE_MIN = 1;

/** Border/connector stroke width for a card set in `fontSize`. */
export function cardStrokeWidth(fontSize: number): number {
  return roundCoord(Math.max(STROKE_MIN, fontSize * STROKE_RATIO));
}

export interface EventCardGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EventCardParams extends EventCardGeometry {
  /** Distinguishes callers in rendered test ids, e.g. `"floating-label"`. */
  idPrefix: string;
  /** Stable id, normally the event id. */
  id: string;
  /** Event colour, washed over the card's field and used for the border. */
  color: string;
  /** Wrapped text, one entry per line, outermost first. */
  lines: string[];
  fontSize: number;
}

/** Attributes shared by the card's three stacked rects — same rounded rectangle, different paint. */
function cardRect({ x, y, width, height }: EventCardGeometry) {
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
 * Build a card's base, colour wash, border and text — three stacked rects sharing one geometry,
 * plus one `<text>` per line, matching how the arc renders its curved lines (no `tspan` baseline
 * arithmetic).
 *
 * The card deliberately inverts the face tokens — a light chip carrying dark text. NDWC
 * hard-coded white and `#1f2937` for this; using the tokens gives the same result on this
 * palette while staying tunable, and keeps ADR 0007's set at five.
 *
 * Three rects, not one: a wash tinting the field needs a plain surface under it to blend
 * against, and the border wants to sit above the wash so it reads at full strength rather than
 * through it. Sharing one `geometry` object, rather than recomputing it per rect, is what makes
 * it structurally impossible for the three to drift apart.
 */
export function eventCardNodes({
  idPrefix,
  id,
  x,
  y,
  width,
  height,
  color,
  lines,
  fontSize,
}: EventCardParams): SVGElement[] {
  const geometry = cardRect({ x, y, width, height });
  const centreX = x + width / 2;
  const centreY = y + height / 2;
  const offsets = labelLineOffsets(lines.length, fontSize);

  return [
    svg("rect", {
      "data-testid": `${idPrefix}-rect-${id}`,
      ...geometry,
      fill: "var(--card-foreground)",
    }),
    svg("rect", {
      "data-testid": `${idPrefix}-wash-${id}`,
      ...geometry,
      fill: color,
      "fill-opacity": WASH_OPACITY,
    }),
    svg("rect", {
      "data-testid": `${idPrefix}-border-${id}`,
      ...geometry,
      fill: "none",
      stroke: color,
      "stroke-opacity": RECT_BORDER_OPACITY,
      "stroke-width": cardStrokeWidth(fontSize),
    }),
    ...lines.map((text, index) =>
      svg(
        "text",
        {
          "data-testid": `${idPrefix}-text-${id}-${index}`,
          x: roundCoord(centreX),
          y: roundCoord(centreY + offsets[index]),
          "text-anchor": "middle",
          "dominant-baseline": "central",
          "font-size": fontSize,
          "font-family": CARD_FONT_STACK,
          fill: "var(--card)",
        },
        [text]
      )
    ),
  ];
}
