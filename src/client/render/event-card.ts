/**
 * The card appearance shared by a floating label and (once #39's panel layout lands) an agenda
 * card — factored out per #38 so the two never restyle independently the way #15's colour
 * decision once got made twice, by eye, in two places.
 *
 * Deliberately style only: geometry (position, wrapping, clamping) and anything layout-specific
 * — a floating label's connector, an agenda card's start/end times — stays with the caller.
 */
import { cardSwatchLayout, labelLineOffsets, roundCoord } from "../../shared/clock";
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

/** Corner softening on the swatch — the card's own radius would round an 8-unit patch away. */
const SWATCH_CORNER_RADIUS = 2;

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
 * Build a card's base, colour wash, border, colour swatch and text — three stacked rects sharing one
 * geometry, plus one `<text>` per line, matching how the arc renders its curved lines (no `tspan`
 * baseline arithmetic).
 *
 * The card deliberately inverts the face tokens — a light chip carrying dark text. NDWC
 * hard-coded white and `#1f2937` for this; using the tokens gives the same result on this
 * palette while staying tunable, and keeps ADR 0007's set at five.
 *
 * Three rects, not one: a wash tinting the field needs a plain surface under it to blend
 * against, and the border wants to sit above the wash so it reads at full strength rather than
 * through it. Sharing one `geometry` object, rather than recomputing it per rect, is what makes
 * it structurally impossible for the three to drift apart.
 *
 * The swatch is the card's identity channel (#118), and the caller must take `SWATCH_RESERVE` out of
 * the width it passes — `floatingLabel` does, before it wraps. A card sized to its text alone has no
 * room for the patch to be in: its first line's ink lands 2 units over the patch and hard against the
 * far border, measured at the dial's own font. That is the caller's arithmetic and not something this
 * function can centre its way out of, so it is a contract rather than a defence, and
 * `event-card.test.ts` asserts both halves of it.
 *
 * **Its outline carries the contrast, not its fill.** Full-opacity paint on the card's own washed
 * field measures 1.001:1 for ⚪, misses WCAG 1.4.11's 3:1 for a graphical object on **18 of the 21**
 * colours the dial can be handed, and is under 1.5:1 on six of them (⚪ 1.001, Graphite 1.148, Banana
 * 1.207, Sage 1.270, Tangerine 1.412, Peacock 1.445) — so a bare patch reproduces the defect it was
 * chosen to fix rather than merely under-reading. `var(--card)` — the card's own
 * text token — is 10.93:1 or better against every one of those fields, and outlining rather than
 * flooring keeps the authored hue, which is what #118 rejected flooring the border to protect. On a
 * dark fill the outline vanishes into it (⚫ measures 1.21:1 inside) and the patch reads as one
 * block, which is the intended result rather than a residue of the defect.
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
  const { swatch, textCentreX } = cardSwatchLayout(
    { x, y, width, height },
    { x: RECT_PADDING_X, y: RECT_PADDING_Y }
  );
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
    svg("rect", {
      "data-testid": `${idPrefix}-swatch-${id}`,
      x: roundCoord(swatch.x),
      y: roundCoord(swatch.y),
      width: roundCoord(swatch.width),
      height: roundCoord(swatch.height),
      rx: SWATCH_CORNER_RADIUS,
      ry: SWATCH_CORNER_RADIUS,
      fill: color,
      stroke: "var(--card)",
      "stroke-width": cardStrokeWidth(fontSize),
    }),
    ...lines.map((text, index) =>
      svg(
        "text",
        {
          "data-testid": `${idPrefix}-text-${id}-${index}`,
          x: roundCoord(textCentreX),
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
