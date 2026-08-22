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
  type Rect,
  SWATCH_RESERVE,
  adjustCompositeForContrast,
  clampLabelPosition,
  faceClearanceLimit,
  fitLabelToClearedWidth,
  labelCardHeight,
  labelWidthLimit,
  polarToCartesian,
  rectEdgeIntersection,
  roundCoord,
} from "../../shared/clock";
import { BAND_BACKGROUND } from "./event-arc";
import { cardStrokeWidth, eventCardNodes, RECT_PADDING_X, RECT_PADDING_Y } from "./event-card";
import { svg } from "../svg";

const ID_PREFIX = "floating-label";

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

const CONNECTOR_OPACITY = 0.6;

/**
 * Contrast floor for the connector's own stroke, against the page (#93).
 *
 * WCAG 1.4.11's floor for a non-text object, the same number and the same reasoning as #66's
 * `FILL_MIN_CONTRAST`: this is a line, not text. #27's 4.5:1 would move eight of the nine
 * colour-dots instead of five and turn every connector but ⚪ into a pastel of itself — and matching
 * its arc's colour is half of how a viewer pairs a card with the arc it came from, so a floor that
 * launders the hue costs the element one job to buy it the other.
 */
const CONNECTOR_MIN_CONTRAST = 3;

const DEFAULT_FONT_SIZE = 14;

/**
 * The colour the connector is actually stroked in — the authored colour, floored so the line exists
 * (#93).
 *
 * Composited at `CONNECTOR_OPACITY` over the page, ⚫ gray-800 measured **1.15:1** and 🟤 amber-800
 * 1.68:1: not faint lines but no line, on the one element that says which arc a card belongs to.
 * 🔴, 🔵 and 🟣 also fell short, at 2.48, 2.60 and 2.46.
 *
 * Its own call at its own alpha rather than reuse of #66's `arcFillColor`: 0.6 mixes back more
 * ground than the arcs' 0.85 does, so a colour floored for the fill still under-reads as a stroke.
 *
 * `BAND_BACKGROUND` is `--page`'s hex and the only place it is spelled — the connector runs from the
 * band's outer edge out across the page, so the name is about where that constant was first needed
 * rather than a mismatch here.
 *
 * Exported so a spec can ask what is painted instead of keeping its own copy of the floor and the
 * opacity; the premise is the part these measurements keep getting wrong (#74).
 */
export function connectorColor(color: string): string {
  return adjustCompositeForContrast(
    color,
    BAND_BACKGROUND,
    CONNECTOR_OPACITY,
    CONNECTOR_MIN_CONTRAST
  );
}

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
  /**
   * Event colour, washed over the card and used for the border, and — floored by `connectorColor`
   * — for the connector. The card's two uses keep the authored value: they sit on the light
   * `--card-foreground` field rather than on the page, so the floor the page needs does not apply.
   */
  color: string;
  cx: number;
  cy: number;
  /** Vertical extents of the dial, defining the clamp band. */
  clockBox: ClockBox;
  /** Radius of the clock face, which the card must not reach. */
  faceRadius: number;
  fontSize?: number;
  /**
   * The event's duration as text (#35), placed on a line of its own below the title.
   *
   * This card is where the redundant channel earns most: a label exists because the arc was too
   * narrow for its title, and a narrow arc is exactly where `MIN_ARC_DEGREES` has already flattened
   * ten minutes and fifteen into the same 7.5°.
   */
  duration?: string;
  /**
   * How far to move the card vertically after clamping, so it clears another card (#30).
   *
   * Applied *after* `clampLabelPosition` because the displacement pass measures the clamped rects:
   * nudging first would hand the clamp a position it might move again, and the pass's arithmetic
   * would be about numbers the renderer never draws. The pass owns staying inside the clamp band.
   */
  verticalNudge?: number;
}

/** Everything about where a card lands, without building any of it. */
export interface FloatingLabelGeometry {
  /** The card's own box, for a caller comparing it with another card's (#35, via `rectsOverlap`). */
  rect: Rect;
  /** Wrapped text plus any trailing duration line, outermost first. */
  lines: string[];
  /**
   * What bounded the card's width, so a spec can ask *why* a title was cut (#183).
   *
   * An ellipsis is honest only when the card has spent the limits it owns. `clearedLines` is the
   * one this issue buys and the only one that is the card's own: at the fixed point it equals
   * `lines.length`, and a card cleared against more lines than it draws was charged for room it
   * never used. `frame` and `face` are recorded beside it so the remaining cuts can be attributed
   * rather than merely counted — the frame allowance is the board's grant and lever 2's to spend
   * (#177 / #138), not this card's.
   */
  limits: {
    /** Lines the width was cleared against. */
    clearedLines: number;
    /** The frame allowance at this position, which no line count moves. */
    frame: number;
    /** The face clearance at the height the card actually draws. */
    face: number;
  };
}

/**
 * Lay a card out without rendering it, so the dial can compare two candidate cards before choosing
 * one. `floatingLabel` is this plus the drawing.
 */
export function floatingLabelGeometry({
  text,
  anchorAngle,
  labelRadius,
  cx,
  cy,
  clockBox,
  faceRadius,
  fontSize = DEFAULT_FONT_SIZE,
  duration,
  verticalNudge = 0,
}: FloatingLabelParams): FloatingLabelGeometry {
  // Where the label wants to be, before any clamping — and therefore how much width is available
  // there. Sizing the card to that room is what keeps the clamp from having to pull a too-wide
  // card inward across the numerals (#21); the clamp below is left in place as a backstop and,
  // for any card this function produces, does nothing horizontally.
  const natural = polarToCartesian(cx, cy, labelRadius, anchorAngle);
  const frameLimit = labelWidthLimit(natural.x, clockBox);
  const faceLimitFor = (lineCount: number): number =>
    faceClearanceLimit(
      natural,
      cx,
      cy,
      faceRadius,
      labelCardHeight(lineCount, fontSize, RECT_PADDING_Y)
    );

  // The swatch's room comes out of the text budget and goes back into the card's width, so the
  // card's *total* width is bounded by the same number as before (#118) for every card that carries
  // text. Widening the card instead would move the bound every guard here is written against — the
  // face clearance, the horizontal clamp, and #98's coverage of the band — for a change that is
  // about the card's contents.
  //
  // The exception is the empty chip `clamp-label.ts` already documents: where the budget floors to
  // zero characters the card is its padding alone, which the reserve makes 24 units rather than 12,
  // both past a `maxWidth` of 12 or less. Only reachable at dial sizes and allowances no board has.
  //
  // A taller card passes closer to the face from the side, so the clearance has to be taken against
  // a height the card will not exceed. Taking it against the tallest the card *may* become is the
  // cheap way to do that and is what shipped — but a card that merely offers a duration line was
  // then charged for a fourth line whether or not it ever drew one, and wrapped its title into the
  // narrower budget that bought (#183). `fitLabelToClearedWidth` scans that starting height down to
  // the smallest the card does not outgrow — not to the count it draws, which is the walk that
  // docstring rejects; it carries the termination and safety argument.
  const { lines, width, height, clearedLines } = fitLabelToClearedWidth(
    text,
    fontSize,
    MAX_LINES,
    { x: RECT_PADDING_X, y: RECT_PADDING_Y },
    (lineCount) => Math.max(0, Math.min(frameLimit, faceLimitFor(lineCount)) - SWATCH_RESERVE),
    duration
  );
  const cardWidth = width + SWATCH_RESERVE;

  const centre = clampLabelPosition(natural, clockBox, cardWidth / 2);

  return {
    rect: {
      x: centre.x - cardWidth / 2,
      y: centre.y + verticalNudge - height / 2,
      width: cardWidth,
      height,
    },
    lines,
    limits: { clearedLines, frame: frameLimit, face: faceLimitFor(clearedLines) },
  };
}

export function floatingLabel(params: FloatingLabelParams): SVGGElement {
  const {
    id,
    anchorAngle,
    anchorRadius,
    color,
    cx,
    cy,
    fontSize = DEFAULT_FONT_SIZE,
  } = params;
  const anchor = polarToCartesian(cx, cy, anchorRadius, anchorAngle);
  const {
    rect: { x: left, y: top, width, height },
    lines,
  } = floatingLabelGeometry(params);
  const centre = { x: left + width / 2, y: top + height / 2 };

  // Stop the connector at the card's edge rather than letting it run underneath the fill.
  const connectorEnd = rectEdgeIntersection(centre, width, height, anchor);

  const group = svg("g", { "data-testid": `floating-label-${id}` });

  group.append(
    svg("line", {
      "data-testid": `floating-label-connector-${id}`,
      x1: roundCoord(anchor.x),
      y1: roundCoord(anchor.y),
      x2: roundCoord(connectorEnd.x),
      y2: roundCoord(connectorEnd.y),
      stroke: connectorColor(color),
      "stroke-opacity": CONNECTOR_OPACITY,
      "stroke-width": cardStrokeWidth(fontSize),
    }),
    ...eventCardNodes({
      idPrefix: ID_PREFIX,
      id,
      x: left,
      y: top,
      width,
      height,
      color,
      lines,
      fontSize,
    })
  );

  return group;
}
