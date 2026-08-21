/**
 * The dial: event arcs, floating labels, the clock face, and the tick that drives them.
 * Ported from next-digital-wall-calendar's `analog-clock/analog-clock.tsx`.
 */
import {
  type ClockEventInput,
  type DialScaleId,
  angleForTime,
  assignRings,
  calculateTrueArcAngles,
  combineTitleWithEmoji,
  computeArcTitleLayout,
  dialOrigin,
  dialScale,
  dialWindow,
  elapsedEventIds,
  eventsToClockEvents,
  filterEventsForPeriod,
  formatEventDuration,
  hasEventInProgress,
  labelVerticalBand,
  planOptionalLines,
  roundCoord,
} from "../../shared/clock";
import { svg } from "../svg";
import { clockFace } from "./clock-face";
import { arcEdgeStrokeWidth, eventArc } from "./event-arc";
import {
  type FloatingLabelParams,
  floatingLabel,
  floatingLabelGeometry,
} from "./floating-label";
import { windowTrack } from "./window-track";

/**
 * The dial's viewBox extent. Exported because the host has to convert its own pixel measurements
 * into these units to hand a `labelMargin` back (#30 item 1), and a second copy of 600 is how the
 * two would drift.
 */
export const DIAL_VIEWBOX_SIZE = 600;

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
export const ARC_BAND_RATIO = 0.26;
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

/**
 * Gap between concentric rings, as a fraction of the band, with an absolute floor.
 *
 * Exported, with `ARC_BAND_RATIO`, so that `event-arc.test.ts` can model the ring the dial actually
 * divides rather than restating these numbers: an arc's title has to clear what that arc strokes on
 * its own edges (#67), and a suite carrying its own copy of the band would stay green while asserting
 * about a ring the dial no longer draws.
 */
export const RING_GAP_RATIO = 0.06;
export const RING_GAP_MIN = 2;

/**
 * Floating labels sit this far beyond the band, as a fraction of the dial's radius.
 *
 * Was 0.6 of the *band*, which put the label ring at 337 units on a dial whose frame is only 300
 * from the centre — so at 3 and 9 o'clock a label's centre was off-screen entirely and the clamp
 * had to drag it back across the dial (#21). A small fraction of the radius keeps every centre
 * inside the frame while still clearing the band.
 *
 * Exported for the same reason `ARC_BAND_RATIO` is: `dial-frame.test.ts` asks how far a card's
 * *height* would reach at twelve o'clock, and the only honest way to ask that is against the locus a
 * card starts from. Reading it back off a rendered card's radius conflates height with the vertical
 * displacement pass (#134), which moves a centre off this circle and inflates the answer.
 */
export const LABEL_RADIUS_RATIO = 0.02;

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

/** Which calendar minute `time` falls in — the arcs' rebuild granularity now the window rolls. */
function minuteKey(time: Date): number {
  return Math.floor(time.getTime() / 60_000);
}

export interface AnalogClockParams {
  events: ClockEventInput[];
  size?: number;
  /** Band width in viewBox units. Defaults to `ARC_BAND_RATIO` of the dial's radius. */
  arcThickness?: number;
  showSeconds?: boolean;
  /** Fixed time, for tests. Defaults to now. */
  time?: Date;
  /**
   * Which time scale the dial runs at (#34): the inherited 12-hour revolution, or a 60-minute one
   * at twelve times the resolution. Chooses the band's degrees-per-minute, its angle origin, its
   * drawn window, and which of the face's two scales is emphasised.
   */
  scale?: DialScaleId;
  /**
   * How far past the viewBox a floating label's edge may reach, per side, in viewBox units — the
   * board's spare width as ADR 0009 allocates it and the host measures it (#30 item 1).
   *
   * Stated from the *viewBox* because that is what every figure on the subject is in: 50.4 is what
   * the renderer assumed before this existed, 234.5 is what a 16:9 board grants and 172.1 a 16:10
   * one. `ClockBox.labelAllowance` is the same quantity measured from the dial's own box,
   * `EDGE_MARGIN` further out, and the conversion happens here because this is the only place that
   * knows both numbers.
   *
   * Omitted — or `null`, which is what a page with no layout yields — leaves the inherited
   * allowance in place. The geometry never spends less than that either way.
   */
  labelMargin?: number | null;
}

export interface AnalogClockHandle {
  element: SVGSVGElement;
  /**
   * Advance the clock. Re-points the hands every call; the arcs are rebuilt once a calendar
   * minute, since the rolling window (#25) moves continuously but a tick runs every second.
   */
  setTime(time: Date): void;
  /** Replace the event set and rebuild the arcs. */
  setEvents(events: ClockEventInput[]): void;
  /**
   * Re-grant the labels' margin after the page has been re-laid-out (#30 item 1).
   *
   * A no-op when the value has not changed, so a host may call it on every `resize` without
   * rebuilding the arcs for a resize that did not move the board's edges.
   */
  setLabelMargin(margin: number | null): void;
}

export function analogClock({
  events,
  size = DIAL_VIEWBOX_SIZE,
  arcThickness: arcThicknessOverride,
  showSeconds = false,
  time = new Date(),
  scale: scaleId = "12h",
  labelMargin = null,
}: AnalogClockParams): AnalogClockHandle {
  const scale = dialScale(scaleId);
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

  /** Units past the viewBox a card may reach; re-granted on resize, so read at render time. */
  let grantedMargin = labelMargin;

  /**
   * Rebuilt per render rather than captured, so `setLabelMargin` has one thing to change and the
   * geometry is never handed a box that disagrees with the allowance it was measured for.
   */
  function layoutBox() {
    return {
      top: cy - outerRadius,
      bottom: cy + outerRadius,
      left: cx - outerRadius,
      right: cx + outerRadius,
      height: outerRadius * 2,
      width: outerRadius * 2,
      // The margin is stated from the viewBox and the box's own edge is `EDGE_MARGIN` inside it.
      labelAllowance: grantedMargin === null ? undefined : grantedMargin + EDGE_MARGIN,
    };
  }

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
  const face = clockFace({ faceRadius, cx, cy, time, showSeconds, scale: scaleId });

  // Face last, so the hands paint over any label bleeding toward the centre.
  element.append(arcsLayer, labelsLayer, face.element);

  let currentTime = time;
  let currentEvents = events;
  let renderedCount = 0;
  /** Size only — the change detector for arcs whose event has finished since the last tick. */
  let elapsedCount = 0;
  /** The rolling window moves continuously, so the change detector is the calendar minute. */
  let renderedMinute = minuteKey(time);

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

    const clockBox = layoutBox();

    // The origin is the angle origin only — it never moves the window, which rolls continuously
    // with the time (#25) rather than jumping at a period boundary. Both come from the scale
    // (#34): a 12-hour dial takes the AM/PM boundary and #25's 3h-behind/8h-ahead range, a 1-hour
    // dial the top of the containing hour and 5 minutes behind / 50 ahead.
    const periodStart = dialOrigin(currentTime, scale);
    const { windowStart, windowEnd } = dialWindow(currentTime, scale);

    arcsLayer.append(
      windowTrack({
        cx,
        cy,
        outerRadius,
        windowStartAngle: angleForTime(windowStart, periodStart, scale.periodMinutes),
        windowEndAngle: angleForTime(windowEnd, periodStart, scale.periodMinutes),
      })
    );

    // All-day events drop out here — they have no start or end angle and belong beside the dial.
    const resolved = eventsToClockEvents(
      filterEventsForPeriod(currentEvents, windowStart, windowEnd),
      periodStart,
      windowStart,
      windowEnd,
      scale.periodMinutes
    );
    renderedCount = resolved.length;

    const elapsed = elapsedEventIds(currentEvents, currentTime);
    elapsedCount = elapsed.size;

    // Same angle space as every event's own start/end: a zero-width "event" sitting at `now`.
    // On the 1-hour scale that lands exactly where the minute hand points, so the drain boundary
    // (#28) becomes the minute hand's own edge without anything here having to say so.
    const nowAngle = calculateTrueArcAngles(
      currentTime,
      currentTime,
      periodStart,
      windowStart,
      windowEnd,
      scale.periodMinutes
    ).startAngle;

    // True angles, not drawn ones: a five-minute event widened to the 7.5° minimum must not
    // appear to clash with a neighbour six minutes later, or every arc on the dial pays for a
    // phantom that is not there.
    const rings = assignRings(
      resolved.map((event) => ({
        id: event.id,
        startAngle: event.trueStartAngle,
        endAngle: event.trueEndAngle,
      })),
      // `assignRings` rebases onto this before sorting, and its default of 0 is only a no-op for a
      // window that stays inside `[0, 360)` — which stopped being true when the window started
      // rolling (#25) and is never true on the 1-hour scale, where 10:45 gives 240°–570°. Rebased
      // onto 0, an event at 380° sorts *before* one at 30°, and interval partitioning walked in
      // the wrong order silently stacks two overlapping events onto the same ring: the later one
      // is drawn at identical radii, entirely hidden beneath the earlier.
      angleForTime(windowStart, periodStart, scale.periodMinutes)
    );

    const overflowing: { startAngle: number; params: FloatingLabelParams }[] = [];

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
      //
      // The stroke is the elapsed outline the arc will draw on this ring's own edges — the thing a
      // two-line title has to stay clear of (#67). Derived from the thickness the arc is *drawn*
      // with rather than the nominal one, since the innermost ring can be clipped by the band's own
      // inner edge, and passed whether or not the event has elapsed: text that shifted at the moment
      // an event finished would twitch on the wall.
      const layout = computeArcTitleLayout({
        title: displayTitle,
        arcSpan,
        innerRadius: ringInnerRadius,
        outerRadius: ringOuterRadius,
        edgeStrokeWidth: arcEdgeStrokeWidth(ringOuterRadius - ringInnerRadius, arcThickness),
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
          nowAngle,
        })
      );

      if (isOverflow) {
        overflowing.push({
          startAngle: event.startAngle,
          params: {
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
            // Empty for anything under a minute, which `fitLabelToWidth` then treats as a line
            // whose width is zero — so pass undefined instead and leave the card at its title.
            duration: formatEventDuration(event.durationMinutes) || undefined,
          },
        });
      }
    }

    // Clockwise, so labels stack down the page in the order a reader scans the dial.
    overflowing.sort((a, b) => a.startAngle - b.startAngle);

    // #35's duration line makes a card 40% taller, and two cards that land on each other hide a
    // title that is on a card *because* it did not fit its arc. So the duration is treated as what
    // it is — optional — and the two things that decide a card's shape and its place are settled
    // together (#136): a line is offered, the whole dial is re-displaced (#30 item 2), and the
    // offer stands only if it left no pair of cards burying more of each other, and no card
    // further outside the clamp band, than before it was made.
    //
    // Deciding them in sequence was what #136 measured: the duration pass compared against
    // *un-displaced* rects, so three of five cards at `?now=11:00&freeze=1` gave up their line to
    // avoid a collision displacement then resolved anyway — the dial spending event information for
    // nothing. `planOptionalLines` owns the loop; the two sizes it chooses between are laid out here
    // because only this function knows the text.
    const titleOnly: FloatingLabelParams[] = overflowing.map(({ params }) => ({
      ...params,
      duration: undefined,
    }));

    const { accepted, nudges } = planOptionalLines(
      overflowing.map(({ params }, index) => ({
        base: floatingLabelGeometry(titleOnly[index]).rect,
        grown:
          params.duration === undefined ? null : floatingLabelGeometry(params).rect,
      })),
      cy,
      labelVerticalBand(clockBox)
    );

    labelsLayer.append(
      ...overflowing.map(({ params }, index) => {
        const chosen = accepted[index] ? params : titleOnly[index];
        return floatingLabel(
          nudges[index] === 0 ? chosen : { ...chosen, verticalNudge: nudges[index] }
        );
      })
    );

    renderedMinute = minuteKey(currentTime);
  }

  renderEvents();
  describe();

  return {
    element,

    setTime(next: Date): void {
      currentTime = next;
      face.setTime(next);

      // Arcs used to be rebuilt only on period rollover, since nothing else about them changed
      // between rollovers. The window now moves continuously (#25), so that trigger is replaced
      // by a calendar-minute check instead — the finest grain that still keeps the tick's
      // per-second DOM work at zero the rest of the time, and a period rollover is always also a
      // minute change, so nothing is lost by dropping the old rollover check specifically. Two
      // triggers still need finer-than-a-minute granularity: an elapsed arc is drawn differently
      // (#26), so an event finishing has to rebuild immediately rather than waiting up to a
      // minute; and a still-running event drains continuously (#28), so rebuild every tick for as
      // long as anything is actually in progress.
      const minuteChanged = minuteKey(next) !== renderedMinute;
      const elapsedChanged = elapsedEventIds(currentEvents, next).size !== elapsedCount;
      if (minuteChanged || elapsedChanged || hasEventInProgress(currentEvents, next)) {
        renderEvents();
      }
      describe();
    },

    setEvents(next: ClockEventInput[]): void {
      currentEvents = next;
      renderEvents();
      describe();
    },

    setLabelMargin(margin: number | null): void {
      if (margin === grantedMargin) return;
      grantedMargin = margin;
      renderEvents();
      describe();
    },
  };
}
