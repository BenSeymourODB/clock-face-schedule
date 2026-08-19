/**
 * The dial itself — face, tick marks, numerals, hands, AM/PM.
 * Ported from next-digital-wall-calendar's `analog-clock/clock-face.tsx`.
 *
 * Returns a handle rather than a bare element so the per-second tick can re-point the hands
 * without rebuilding anything, and without the caller having to query the tree for them.
 */
import { type DialScaleId, polarToCartesian, roundCoord } from "../../shared/clock";
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
  // Lengthened from the inherited 0.93. A tick 3% of the radius long is hard to see and harder
  // to count across a room, and counting them is the point of having them.
  minuteTickInner: 0.905,
  numeral: 0.72,
  /**
   * The 1-hour scale's outer ring, pulled in 0.02 from the 12-hour one.
   *
   * Not cosmetic. Every 5-minute value except 0 is **two digits**, and at three and nine o'clock a
   * numeral's width adds straight onto its radius — so the clearance to the hour marker's inner
   * end fell from 13.65 units to 3.75, and the marker read as a dash welded to the number
   * ("—45"). At twelve and six the same extra digit costs almost nothing, because there the width
   * is perpendicular to the radius; this is why the 12-hour dial never showed it, its only
   * two-digit numeral being "12" at the top.
   *
   * 0.70 puts the worst case back at 7.82 units — wider than the 12-hour dial's own tightest
   * numeral, which is that "12" at 6.32.
   */
  numeralOneHour: 0.7,
  periodIndicator: 0.35,
  /**
   * Hand lengths, each reaching the thing it is read against.
   *
   * The inherited 0.55 / 0.75 / 0.8 left both pointers short of their own scale: the hour hand
   * stopped 20.5 units before the numerals it indicates, and the minute hand 31.7 before the
   * minute ticks. Both asked a viewer to extrapolate along a line to a mark it never touches,
   * which is exactly the small act of inference this dial exists to remove.
   *
   * The hour hand now stops just inside the numerals' glyphs, so it points *at* a numeral without
   * covering it; the minute hand lands on the inner end of the tick track. Length is also how the
   * three are told apart, so the second hand had to grow with them to stay the longest — a minute
   * hand outreaching the second hand would swap their identities at a glance.
   */
  hourHand: 0.64,
  /**
   * The 1-hour scale's second numeral ring — the hour numbers, pulled inward and greyed while the
   * outer ring carries 5-minute values (#34).
   *
   * Placed by measuring rather than by eye, at the shipped `faceRadius` of 204.4. Digits have no
   * descenders, so their ink is roughly cap height — about 0.35em either side of the baseline
   * rather than the 0.5em the em box claims (#78): the ring's glyphs occupy 95.0–109.4, leaving
   * 20.6 units to the outer numerals' own ink at 130.0 and 17.1 to the AM/PM indicator's at 78.0.
   */
  hourNumeralInner: 0.5,
  minuteHand: 0.9,
  secondHand: 0.93,
  /** The second hand overhangs the centre by this much, as a counterweight. */
  secondHandTail: 0.12,
  centreDot: 0.035,
} as const;

/**
 * Hour-hand length on the 1-hour scale, as a fraction of the face radius.
 *
 * The issue asked only for the hand to be greyed. Greying alone re-creates the defect `RADIUS`
 * above was written to remove: with the hour numerals pulled inward, a hand still reaching 130.8
 * crosses its own numerals mid-shaft and points past them at nothing, which is exactly the "small
 * act of inference this dial exists to remove". So the hand comes in with them and keeps the
 * relationship it has on the 12-hour dial — a tip stopping just inside the glyph it indicates.
 *
 * 0.43 puts the tip at 87.9, seven units inside the inner ring's ink at 95.0.
 */
const ONE_HOUR_HOUR_HAND_RADIUS = 0.43;

/** Type sizes and hand widths, as fractions of the face radius. */
const SCALE = {
  numeral: 0.14,
  /**
   * The 1-hour scale's inner hour numerals: quieter than the outer ring but deliberately not as
   * quiet as the AM/PM indicator, which #70 measures as the smallest text the dial asks a room to
   * read. This ring is the answer to "which hour is it" — the anchor #34 worried about losing —
   * and it cannot be the thing nobody can read.
   */
  hourNumeralInner: 0.1,
  periodIndicator: 0.09,
  hourHandWidth: 0.045,
  minuteHandWidth: 0.028,
} as const;

/**
 * Stroke widths, as fractions of the face radius.
 *
 * These were inherited as absolute pixels from a design read at desk distance, which inverted the
 * one thing the dial needs: everything else scales with the face, so enlarging the dial made the
 * linework proportionally *thinner*. Expressed as ratios they grow with it instead. The values are
 * also roughly double their inherited equivalents — a 0.75px minute tick was a hairline at any
 * projection size.
 */
const STROKE = {
  face: 0.01,
  minuteTick: 0.01,
  hourMarker: 0.015,
  quarterMarker: 0.028,
  secondHand: 0.01,
} as const;

/**
 * Halo added to each side of a hand's own stroke, as a fraction of the face radius.
 *
 * Sized to match the thinnest hairlines already on the face (`STROKE.face` / `minuteTick` /
 * `secondHand`) rather than to stand out — the halo is currently invisible in normal use, since
 * hands never cross anything but `--card`, and it should stay that way until something is drawn
 * under them.
 */
const HAND_HALO_RATIO = 0.01;

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
  /**
   * Which scale the dial is currently *about* (#34). Both scales stay drawn either way — the face
   * never withholds the time — so this only moves the emphasis: which numerals sit on the outer
   * ring, and which hand is the quiet one.
   */
  scale?: DialScaleId;
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
  scale = "12h",
}: ClockFaceParams): ClockFaceHandle {
  const rotateAbout = (angle: number) => `rotate(${roundCoord(angle)}, ${cx}, ${cy})`;
  const stroke = (ratio: number) => roundCoord(faceRadius * ratio);

  /**
   * On the 1-hour scale the band runs at 6° per minute, so the outer numerals become the minute
   * values the band is actually divided by and the hour numbers move to a ring of their own. The
   * 60 minute ticks come out right without touching them: 6° is one minute at this scale, so the
   * tick track *is* a minute scale, and the hour markers at 30° fall on the five-minute values.
   */
  const isMinuteScale = scale === "1h";

  const element = svg("g", { "data-testid": "clock-face" });

  element.append(
    svg("circle", {
      "data-testid": "clock-face-bg",
      cx,
      cy,
      r: roundCoord(faceRadius),
      fill: "var(--card)",
      stroke: "var(--border)",
      "stroke-width": stroke(STROKE.face),
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
        "stroke-width": stroke(STROKE.minuteTick),
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
    const numeral = polarToCartesian(
      cx,
      cy,
      faceRadius * (isMinuteScale ? RADIUS.numeralOneHour : RADIUS.numeral),
      angle
    );

    element.append(
      svg("line", {
        "data-testid": `hour-marker-${hour}`,
        x1: outer.x,
        y1: outer.y,
        x2: inner.x,
        y2: inner.y,
        stroke: "var(--card-foreground)",
        "stroke-width": stroke(isQuarter ? STROKE.quarterMarker : STROKE.hourMarker),
        "stroke-linecap": "round",
      }),
      svg(
        "text",
        {
          // Named for the *position*, not for what it says: the twelve positions are fixed and
          // only the value on them changes with the scale.
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
        // 0, 5, 10 … 55 — the twelve position carries 0 rather than 60, so the minute hand reads
        // against the same zero it starts each hour from.
        [String(isMinuteScale ? (hour % 12) * 5 : hour)]
      )
    );

    if (isMinuteScale) {
      const inner = polarToCartesian(cx, cy, faceRadius * RADIUS.hourNumeralInner, angle);

      element.append(
        svg(
          "text",
          {
            "data-testid": `hour-number-inner-${hour}`,
            x: inner.x,
            y: inner.y,
            "text-anchor": "middle",
            "dominant-baseline": "central",
            "font-size": roundCoord(faceRadius * SCALE.hourNumeralInner),
            "font-weight": isQuarter ? 700 : 500,
            // The same grey as the hour hand, which is the point: sharing one colour is what says
            // the hand and these numbers are one scale, and the outer ring and minute hand another.
            fill: "var(--muted-foreground)",
            "font-family": FONT_STACK,
          },
          [String(hour)]
        )
      );
    }
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

  /**
   * A hand drawn twice — once wider, in `var(--card)`, beneath the coloured line — so it stays
   * legible over anything drawn on the face rather than just the flat background it has today.
   * Returns the halo first so the caller can mount it underneath.
   */
  function handWithHalo(
    testId: string,
    y1: number,
    y2: number,
    width: number,
    color: string,
    angle: number
  ) {
    const transform = rotateAbout(angle);
    const halo = svg("line", {
      "data-testid": `${testId}-halo`,
      x1: cx,
      y1,
      x2: cx,
      y2,
      stroke: "var(--card)",
      "stroke-width": roundCoord(width + 2 * faceRadius * HAND_HALO_RATIO),
      "stroke-linecap": "round",
      transform,
    });
    const line = svg("line", {
      "data-testid": testId,
      x1: cx,
      y1,
      x2: cx,
      y2,
      stroke: color,
      "stroke-width": roundCoord(width),
      "stroke-linecap": "round",
      transform,
    });
    return [halo, line] as const;
  }

  /**
   * Exactly one hand is the quiet one, and it is the hand belonging to the scale the band is not
   * currently drawn at (#34). Both stay drawn and both keep their true angle — the dial never
   * lies about the time, it only says which scale it is about — so a viewer is never left to work
   * out which one they are looking at, which is constraint 5 of the two-time-scales brainstorm.
   *
   * On the 12-hour dial that is the minute hand: the band runs at 0.5° per minute there, so a
   * minute hand sweeping twelve times faster than the arcs is the one pointer a viewer cannot
   * usefully read the band against.
   */
  const emphasis = {
    hour: isMinuteScale ? "var(--muted-foreground)" : "var(--card-foreground)",
    minute: isMinuteScale ? "var(--card-foreground)" : "var(--muted-foreground)",
  };

  const [hourHalo, hourHand] = handWithHalo(
    "hour-hand",
    cy,
    roundCoord(
      cy - faceRadius * (isMinuteScale ? ONE_HOUR_HOUR_HAND_RADIUS : RADIUS.hourHand)
    ),
    faceRadius * SCALE.hourHandWidth,
    emphasis.hour,
    angles.hour
  );

  const [minuteHalo, minuteHand] = handWithHalo(
    "minute-hand",
    cy,
    roundCoord(cy - faceRadius * RADIUS.minuteHand),
    faceRadius * SCALE.minuteHandWidth,
    emphasis.minute,
    angles.minute
  );

  // Accent-coloured so it stays distinct from the hands against any face/foreground pairing.
  const [secondHalo, secondHand] = showSeconds
    ? handWithHalo(
        "second-hand",
        roundCoord(cy + faceRadius * RADIUS.secondHandTail),
        roundCoord(cy - faceRadius * RADIUS.secondHand),
        faceRadius * STROKE.secondHand,
        "var(--destructive)",
        angles.second
      )
    : [undefined, undefined];

  // Halos all mount before any hand's own line: the hour and minute hands are collinear at the
  // top of every hour, and a per-hand pairing would let the minute halo — wider than the hour
  // hand's own line — paint over and thin it. Painting every halo first keeps each hand's colour
  // on top regardless of which other hand shares its angle.
  element.append(periodIndicator, hourHalo, minuteHalo);
  if (secondHalo) element.append(secondHalo);
  element.append(hourHand, minuteHand);
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
      hourHalo.setAttribute("transform", rotateAbout(updated.hour));
      hourHand.setAttribute("transform", rotateAbout(updated.hour));
      minuteHalo.setAttribute("transform", rotateAbout(updated.minute));
      minuteHand.setAttribute("transform", rotateAbout(updated.minute));
      secondHalo?.setAttribute("transform", rotateAbout(updated.second));
      secondHand?.setAttribute("transform", rotateAbout(updated.second));
      periodIndicator.textContent = next.getHours() >= 12 ? "PM" : "AM";
    },
  };
}
