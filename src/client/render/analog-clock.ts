/**
 * The dial: event arcs, floating labels, the clock face, and the tick that drives them.
 * Ported from next-digital-wall-calendar's `analog-clock/analog-clock.tsx`.
 */
import {
  type ClockEventInput,
  assignRingIndices,
  computeArcTitleLayout,
  eventsToClockEvents,
  filterEventsForPeriod,
  getPeriodBounds,
  getPeriodStart,
} from "../../shared/clock";
import { svg } from "../svg";
import { clockFace } from "./clock-face";
import { eventArc } from "./event-arc";
import { floatingLabel } from "./floating-label";

const DEFAULT_SIZE = 600;
const DEFAULT_ARC_THICKNESS = 48;

/** Clearance between the outermost arc and the nominal SVG edge. */
const EDGE_MARGIN = 8;

/**
 * Span below which an arc renders neither emoji nor title. Overflow routing reuses it: a label
 * pointing at something narrower than this would point at a sliver nobody can see.
 */
const EMOJI_MIN_SPAN_DEGREES = 10;

/** Gap between concentric rings, as a fraction of the band, with an absolute floor. */
const RING_GAP_RATIO = 0.06;
const RING_GAP_MIN = 2;

/** Floating labels sit this far beyond the band, as a fraction of it. */
const LABEL_RADIUS_RATIO = 0.6;

export interface AnalogClockParams {
  events: ClockEventInput[];
  size?: number;
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
  arcThickness = DEFAULT_ARC_THICKNESS,
  showSeconds = false,
  time = new Date(),
}: AnalogClockParams): AnalogClockHandle {
  const cx = size / 2;
  const cy = size / 2;
  const outerRadius = size / 2 - EDGE_MARGIN;
  const clockRadius = outerRadius - arcThickness;

  const labelRadius = outerRadius + arcThickness * LABEL_RADIUS_RATIO;
  const clockBox = { top: cy - outerRadius, bottom: cy + outerRadius, height: outerRadius * 2 };

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
  const face = clockFace({ radius: clockRadius, cx, cy, time, showSeconds });

  // Face last, so the hands paint over any label bleeding toward the centre.
  element.append(arcsLayer, labelsLayer, face.element);

  let currentTime = time;
  let currentEvents = events;
  let periodStart = getPeriodStart(time);
  let renderedCount = 0;

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

    const ringIndices = assignRingIndices(resolved);
    const ringCount =
      resolved.reduce((max, event) => Math.max(max, ringIndices.get(event.id) ?? 0), 0) + 1;

    // With one ring the arc fills the whole band, so emoji and title get maximum radial room.
    const ringGap = ringCount > 1 ? Math.max(RING_GAP_MIN, arcThickness * RING_GAP_RATIO) : 0;
    // Nothing caps ringCount, so a deep enough overlap drives this to zero and then negative,
    // which inverts the arcs. Inherited, and the subject of the density work — see #9.
    const ringThickness = (arcThickness - (ringCount - 1) * ringGap) / ringCount;

    const overflowing: { startAngle: number; label: SVGGElement }[] = [];

    for (const event of resolved) {
      const ringIndex = ringIndices.get(event.id) ?? 0;
      const ringOuterRadius = outerRadius - ringIndex * (ringThickness + ringGap);
      const ringInnerRadius = Math.max(ringOuterRadius - ringThickness, clockRadius);
      const arcSpan = event.endAngle - event.startAngle;

      // Computed once and shared with the label below: two independent derivations of
      // didOverflow could disagree and render a title twice, or not at all.
      const layout = computeArcTitleLayout({
        cleanTitle: event.cleanTitle,
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
        })
      );

      if (isOverflow) {
        overflowing.push({
          startAngle: event.startAngle,
          label: floatingLabel({
            id: event.id,
            text: event.cleanTitle,
            anchorAngle: (event.startAngle + event.endAngle) / 2,
            anchorRadius: ringOuterRadius,
            labelRadius,
            color: event.color,
            cx,
            cy,
            clockBox,
            fontSize: layout.titleFontSize,
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

      if (getPeriodStart(next).getTime() !== periodStart.getTime()) {
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
