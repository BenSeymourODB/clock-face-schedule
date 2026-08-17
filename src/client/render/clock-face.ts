/**
 * The dial itself — face, tick marks, numerals, hands, AM/PM.
 * Ported from next-digital-wall-calendar's `analog-clock/clock-face.tsx`.
 *
 * Returns a handle rather than a bare element so the per-second tick can re-point the hands
 * without rebuilding anything, and without the caller having to query the tree for them.
 */
import { polarToCartesian, roundCoord } from "../../shared/clock";
import { svg } from "../svg";

const FONT_STACK = "system-ui, -apple-system, sans-serif";

/** Hour positions, 1–12, at 30° intervals. */
const HOURS = Array.from({ length: 12 }, (_, index) => index + 1);

/** Minute ticks, skipping the multiples of five where hour markers already sit. */
const MINUTE_TICKS = Array.from({ length: 60 }, (_, index) => index).filter(
  (minute) => minute % 5 !== 0
);

/** Radii, as fractions of the face radius. */
const RADIUS = {
  markerOuter: 0.96,
  markerInnerQuarter: 0.84,
  markerInner: 0.9,
  minuteTickInner: 0.93,
  numeral: 0.72,
  periodIndicator: 0.35,
  hourHand: 0.55,
  minuteHand: 0.75,
  secondHand: 0.8,
  /** The second hand overhangs the centre by this much, as a counterweight. */
  secondHandTail: 0.12,
  centreDot: 0.035,
} as const;

/** Type sizes and hand widths, as fractions of the face radius. */
const SCALE = {
  numeral: 0.14,
  periodIndicator: 0.09,
  hourHandWidth: 0.045,
  minuteHandWidth: 0.028,
} as const;

/**
 * Stroke widths that do **not** scale with the dial.
 *
 * Inherited as absolute pixels from a design read at desk distance. On a projected dial these
 * are the first things to disappear — a 0.75px minute tick is a hairline at any projection size.
 * Left as-is so the port has a known-good baseline; revisit against a real display rather than
 * by guessing here.
 */
const STROKE = {
  face: 1.5,
  minuteTick: 0.75,
  hourMarker: 1.5,
  quarterMarker: 3,
  secondHand: 1.5,
} as const;

export interface ClockFaceParams {
  /**
   * Radius the face is drawn at — used as given, not scaled down.
   *
   * This used to be a `radius` that was silently multiplied by 0.8 to "leave room for event
   * arcs", room the caller had already subtracted. The result was an empty ring as wide as the
   * arc band itself (#19). Naming it for what it is removes the invitation to reserve twice.
   */
  faceRadius: number;
  cx: number;
  cy: number;
  time: Date;
  showSeconds?: boolean;
}

export interface ClockFaceHandle {
  /** The group to mount. */
  element: SVGGElement;
  /** Re-point the hands and the AM/PM indicator. Mutates transforms; rebuilds nothing. */
  setTime(time: Date): void;
}

function handAngles(time: Date) {
  const minutes = time.getMinutes();
  return {
    // The hour hand advances through the hour rather than jumping at the top of it.
    hour: (time.getHours() % 12) * 30 + minutes * 0.5,
    minute: minutes * 6,
    second: time.getSeconds() * 6,
  };
}

export function clockFace({
  faceRadius,
  cx,
  cy,
  time,
  showSeconds = false,
}: ClockFaceParams): ClockFaceHandle {
  const rotateAbout = (angle: number) => `rotate(${roundCoord(angle)}, ${cx}, ${cy})`;

  const element = svg("g", { "data-testid": "clock-face" });

  element.append(
    svg("circle", {
      "data-testid": "clock-face-bg",
      cx,
      cy,
      r: roundCoord(faceRadius),
      fill: "var(--card)",
      stroke: "var(--border)",
      "stroke-width": STROKE.face,
    })
  );

  for (const minute of MINUTE_TICKS) {
    const angle = minute * 6;
    const outer = polarToCartesian(cx, cy, faceRadius * RADIUS.markerOuter, angle);
    const inner = polarToCartesian(cx, cy, faceRadius * RADIUS.minuteTickInner, angle);

    element.append(
      svg("line", {
        x1: outer.x,
        y1: outer.y,
        x2: inner.x,
        y2: inner.y,
        stroke: "var(--border)",
        "stroke-width": STROKE.minuteTick,
      })
    );
  }

  for (const hour of HOURS) {
    const angle = hour * 30;
    const isQuarter = hour % 3 === 0;
    const outer = polarToCartesian(cx, cy, faceRadius * RADIUS.markerOuter, angle);
    const inner = polarToCartesian(
      cx,
      cy,
      faceRadius * (isQuarter ? RADIUS.markerInnerQuarter : RADIUS.markerInner),
      angle
    );
    const numeral = polarToCartesian(cx, cy, faceRadius * RADIUS.numeral, angle);

    element.append(
      svg("line", {
        "data-testid": `hour-marker-${hour}`,
        x1: outer.x,
        y1: outer.y,
        x2: inner.x,
        y2: inner.y,
        stroke: "var(--card-foreground)",
        "stroke-width": isQuarter ? STROKE.quarterMarker : STROKE.hourMarker,
        "stroke-linecap": "round",
      }),
      svg(
        "text",
        {
          "data-testid": `hour-number-${hour}`,
          x: numeral.x,
          y: numeral.y,
          "text-anchor": "middle",
          "dominant-baseline": "central",
          "font-size": roundCoord(faceRadius * SCALE.numeral),
          "font-weight": isQuarter ? 700 : 500,
          fill: "var(--card-foreground)",
          "font-family": FONT_STACK,
        },
        [String(hour)]
      )
    );
  }

  const periodIndicator = svg(
    "text",
    {
      "data-testid": "period-indicator",
      x: cx,
      y: roundCoord(cy + faceRadius * RADIUS.periodIndicator),
      "text-anchor": "middle",
      "dominant-baseline": "central",
      "font-size": roundCoord(faceRadius * SCALE.periodIndicator),
      "font-weight": 600,
      fill: "var(--muted-foreground)",
      "font-family": FONT_STACK,
    },
    [time.getHours() >= 12 ? "PM" : "AM"]
  );

  const angles = handAngles(time);

  const hourHand = svg("line", {
    "data-testid": "hour-hand",
    x1: cx,
    y1: cy,
    x2: cx,
    y2: roundCoord(cy - faceRadius * RADIUS.hourHand),
    stroke: "var(--card-foreground)",
    "stroke-width": roundCoord(faceRadius * SCALE.hourHandWidth),
    "stroke-linecap": "round",
    transform: rotateAbout(angles.hour),
  });

  const minuteHand = svg("line", {
    "data-testid": "minute-hand",
    x1: cx,
    y1: cy,
    x2: cx,
    y2: roundCoord(cy - faceRadius * RADIUS.minuteHand),
    stroke: "var(--card-foreground)",
    "stroke-width": roundCoord(faceRadius * SCALE.minuteHandWidth),
    "stroke-linecap": "round",
    transform: rotateAbout(angles.minute),
  });

  // Accent-coloured so it stays distinct from the hands against any face/foreground pairing.
  const secondHand = showSeconds
    ? svg("line", {
        "data-testid": "second-hand",
        x1: cx,
        y1: roundCoord(cy + faceRadius * RADIUS.secondHandTail),
        x2: cx,
        y2: roundCoord(cy - faceRadius * RADIUS.secondHand),
        stroke: "var(--destructive)",
        "stroke-width": STROKE.secondHand,
        "stroke-linecap": "round",
        transform: rotateAbout(angles.second),
      })
    : undefined;

  element.append(periodIndicator, hourHand, minuteHand);
  if (secondHand) element.append(secondHand);

  element.append(
    svg("circle", {
      "data-testid": "clock-center-dot",
      cx,
      cy,
      r: roundCoord(faceRadius * RADIUS.centreDot),
      fill: "var(--card-foreground)",
    })
  );

  return {
    element,
    setTime(next: Date): void {
      const updated = handAngles(next);
      hourHand.setAttribute("transform", rotateAbout(updated.hour));
      minuteHand.setAttribute("transform", rotateAbout(updated.minute));
      secondHand?.setAttribute("transform", rotateAbout(updated.second));
      periodIndicator.textContent = next.getHours() >= 12 ? "PM" : "AM";
    },
  };
}
