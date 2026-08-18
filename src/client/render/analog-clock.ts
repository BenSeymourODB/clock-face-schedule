/**
 * The dial: event arcs, floating labels, the clock face, and the tick that drives them.
 * Ported from next-digital-wall-calendar's `analog-clock/analog-clock.tsx`.
 */
import {
  type ClockEventInput,
  assignRings,
  combineTitleWithEmoji,
  computeArcTitleLayout,
  elapsedEventIds,
  eventsToClockEvents,
  filterEventsForPeriod,
  getPeriodBounds,
  getPeriodStart,
  roundCoord,
} from "../../shared/clock";
import { svg } from "../svg";
import { clockFace } from "./clock-face";
import { eventArc } from "./event-arc";
import { floatingLabel } from "./floating-label";

const DEFAULT_SIZE = 600;

/** Clearance between the outermost arc and the nominal SVG edge. */
const EDGE_MARGIN = 8;

/**
 * The radial budget, as fractions of the dial's radius. The face takes whatever is left.
 *
 * The band carries the thing this display exists to show — how much of the period is committed —
 * so it gets a much larger share than the ported design's 16%, which was tuned for a kitchen wall
 * read from a few feet. The face gives up some radius for it and its numerals shrink accordingly,
 * which is the right trade for a dial read across a classroom: the arcs are the content, the face
 * is the reference.
 */
const ARC_BAND_RATIO = 0.26;
const FACE_GAP_RATIO = 0.04;

/**
 * Floor on one ring's thickness, as a fraction of the band.
 *
 * Below this an arc cannot read as anything at all, so the dial stops opening rings rather than
 * drawing slivers. It is also a correctness floor: past roughly eighteen deep the old arithmetic
 * produced *negative* thickness and rendered the arcs inside out.
 *
 * Events past the cap share the innermost ring and overlap each other. Imperfect, but nothing
 * vanishes — losing an event outright is worse on a display whose job is showing what is coming.
 */
const MIN_RING_THICKNESS_RATIO = 0.16;

/**
 * Span below which an arc renders neither emoji nor title. Overflow routing reuses it: a label
 * pointing at something narrower than this would point at a sliver nobody can see.
 */
const EMOJI_MIN_SPAN_DEGREES = 10;

/** Gap between concentric rings, as a fraction of the band, with an absolute floor. */
const RING_GAP_RATIO = 0.06;
const RING_GAP_MIN = 2;

/**
 * Floating labels sit this far beyond the band, as a fraction of the dial's radius.
 *
 * Was 0.6 of the *band*, which put the label ring at 337 units on a dial whose frame is only 300
 * from the centre — so at 3 and 9 o'clock a label's centre was off-screen entirely and the clamp
 * had to drag it back across the dial (#21). A small fraction of the radius keeps every centre
 * inside the frame while still clearing the band.
 */
const LABEL_RADIUS_RATIO = 0.02;

/**
 * Label text size, as a fraction of the dial's radius.
 *
 * Deliberately **not** derived from the arc band the way in-arc titles are. A label sits outside
 * the dial, so band thickness is arbitrary to it — and since thickness divides by overlap depth, a
 * band-derived size meant an event in a three-deep cluster got a label a third the size of its
 * neighbour's for no reason a viewer could see. Slightly smaller than an arc title, which it can
 * afford: the card is a light chip carrying dark text rather than text curved over a colour.
 */
const LABEL_FONT_SIZE_RATIO = 0.06;

export interface AnalogClockParams {
  events: ClockEventInput[];
  size?: number;
  /** Band width in viewBox units. Defaults to `ARC_BAND_RATIO` of the dial's radius. */
  arcThickness?: number;
  showSeconds?: boolean;
  /** Fixed time, for tests. Defaults to now. */
  time?: Date;
}

export interface AnalogClockHandle {
  element: SVGSVGElement;
  /**
   * Advance the clock. Re-points the hands only; the arcs are rebuilt just when the 12-hour
   * period rolls over, since nothing else about them changes with the second.
   */
  setTime(time: Date): void;
  /** Replace the event set and rebuild the arcs. */
  setEvents(events: ClockEventInput[]): void;
}

export function analogClock({
  events,
  size = DEFAULT_SIZE,
  arcThickness: arcThicknessOverride,
  showSeconds = false,
  time = new Date(),
}: AnalogClockParams): AnalogClockHandle {
  const cx = size / 2;
  const cy = size / 2;
  const outerRadius = size / 2 - EDGE_MARGIN;
  const arcThickness = arcThicknessOverride ?? outerRadius * ARC_BAND_RATIO;
  /** Inner edge of the arc band — the floor for the innermost ring. */
  const clockRadius = outerRadius - arcThickness;
  const faceRadius = clockRadius - outerRadius * FACE_GAP_RATIO;

  const ringGap = Math.max(RING_GAP_MIN, arcThickness * RING_GAP_RATIO);
  /** How many rings the band can carry before they stop reading as arcs at all. */
  const maxRings = Math.max(
    1,
    Math.floor((arcThickness + ringGap) / (arcThickness * MIN_RING_THICKNESS_RATIO + ringGap))
  );

  const labelRadius = outerRadius * (1 + LABEL_RADIUS_RATIO);
  const labelFontSize = roundCoord(outerRadius * LABEL_FONT_SIZE_RATIO);
  const clockBox = {
    top: cy - outerRadius,
    bottom: cy + outerRadius,
    left: cx - outerRadius,
    right: cx + outerRadius,
    height: outerRadius * 2,
    width: outerRadius * 2,
  };

  const element = svg("svg", {
    "data-testid": "analog-clock",
    width: size,
    height: size,
    viewBox: `0 0 ${size} ${size}`,
    role: "img",
    // Floating labels sit beyond the nominal box by design.
    overflow: "visible",
  });

  const arcsLayer = svg("g", { "data-testid": "event-arcs-layer" });
  const labelsLayer = svg("g", { "data-testid": "floating-labels-layer" });
  const face = clockFace({ faceRadius, cx, cy, time, showSeconds });

  // Face last, so the hands paint over any label bleeding toward the centre.
  element.append(arcsLayer, labelsLayer, face.element);

  let currentTime = time;
  let currentEvents = events;
  let periodStart = getPeriodStart(time);
  let renderedCount = 0;
  /** Size only — the change detector for arcs whose event has finished since the last tick. */
  let elapsedCount = 0;

  function describe(): void {
    const plural = renderedCount === 1 ? "event" : "events";
    element.setAttribute(
      "aria-label",
      `Analog clock showing ${currentTime.toLocaleTimeString()} with ${renderedCount} ${plural}`
    );
  }

  function renderEvents(): void {
    arcsLayer.textContent = "";
    labelsLayer.textContent = "";

    const bounds = getPeriodBounds(currentTime);
    periodStart = bounds.periodStart;

    // All-day events drop out here — they have no start or end angle and belong beside the dial.
    const resolved = eventsToClockEvents(
      filterEventsForPeriod(currentEvents, bounds.periodStart, bounds.periodEnd),
      bounds.periodStart
    );
    renderedCount = resolved.length;

    const elapsed = elapsedEventIds(currentEvents, currentTime);
    elapsedCount = elapsed.size;

    // True angles, not drawn ones: a five-minute event widened to the 7.5° minimum must not
    // appear to clash with a neighbour six minutes later, or every arc on the dial pays for a
    // phantom that is not there.
    const rings = assignRings(
      resolved.map((event) => ({
        id: event.id,
        startAngle: event.trueStartAngle,
        endAngle: event.trueEndAngle,
      }))
    );

    const overflowing: { startAngle: number; label: SVGGElement }[] = [];

    for (const event of resolved) {
      const assigned = rings.get(event.id) ?? { ringIndex: 0, clusterDepth: 1 };

      // Depth is per overlap cluster, so an event with the band to itself keeps all of it however
      // crowded the rest of the period is. Capped so rings never fall below a readable thickness;
      // anything past the cap shares the innermost ring rather than disappearing.
      const depth = Math.min(assigned.clusterDepth, maxRings);
      const ringIndex = Math.min(assigned.ringIndex, depth - 1);

      // A lone arc fills the band, giving its emoji and title the most radial room available.
      const gap = depth > 1 ? ringGap : 0;
      const ringThickness = (arcThickness - (depth - 1) * gap) / depth;

      const ringOuterRadius = outerRadius - ringIndex * (ringThickness + gap);
      const ringInnerRadius = Math.max(ringOuterRadius - ringThickness, clockRadius);
      const arcSpan = event.endAngle - event.startAngle;

      const displayTitle = combineTitleWithEmoji(event.cleanTitle, event.eventEmoji);

      // Computed once and shared with the label below: two independent derivations of
      // didOverflow could disagree and render a title twice, or not at all.
      const layout = computeArcTitleLayout({
        title: displayTitle,
        arcSpan,
        innerRadius: ringInnerRadius,
        outerRadius: ringOuterRadius,
      });
      const isOverflow = layout.fit.didOverflow && arcSpan >= EMOJI_MIN_SPAN_DEGREES;

      arcsLayer.append(
        eventArc({
          event,
          cx,
          cy,
          innerRadius: ringInnerRadius,
          outerRadius: ringOuterRadius,
          layout,
          forceHideTitle: isOverflow,
          isElapsed: elapsed.has(event.id),
          bandThickness: arcThickness,
        })
      );

      if (isOverflow) {
        overflowing.push({
          startAngle: event.startAngle,
          label: floatingLabel({
            id: event.id,
            text: displayTitle,
            anchorAngle: (event.startAngle + event.endAngle) / 2,
            anchorRadius: ringOuterRadius,
            labelRadius,
            color: event.color,
            cx,
            cy,
            clockBox,
            faceRadius,
            fontSize: labelFontSize,
          }),
        });
      }
    }

    // Clockwise, so labels stack down the page in the order a reader scans the dial.
    overflowing.sort((a, b) => a.startAngle - b.startAngle);
    labelsLayer.append(...overflowing.map(({ label }) => label));
  }

  renderEvents();
  describe();

  return {
    element,

    setTime(next: Date): void {
      currentTime = next;
      face.setTime(next);

      // Arcs used to be rebuilt only on period rollover, since nothing else about them changed
      // with the clock. An elapsed arc is drawn differently, so they now also rebuild the moment
      // an event finishes — a handful of times a day rather than once a second.
      const rolledOver = getPeriodStart(next).getTime() !== periodStart.getTime();
      if (rolledOver || elapsedEventIds(currentEvents, next).size !== elapsedCount) {
        renderEvents();
      }
      describe();
    },

    setEvents(next: ClockEventInput[]): void {
      currentEvents = next;
      renderEvents();
      describe();
    },
  };
}
