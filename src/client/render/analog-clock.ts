/**
 * The dial: event arcs, floating labels, the clock face, and the tick that drives them.
 * Ported from next-digital-wall-calendar's `analog-clock/analog-clock.tsx`.
 */
import {
  type ClockBox,
  type ClockEventInput,
  type DialScaleId,
  adrBandClearingCircle,
  angleForTime,
  angularHeight,
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
  labelsDischargedByPanel,
  panelNamedKey,
  planOptionalLines,
  roundCoord,
  sectorTarget,
  sideCardAngles,
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

/**
 * Clearance between the outermost arc and the nominal SVG edge.
 *
 * Exported for the same reason `ARC_BAND_RATIO` is, and for one more caller (#174): the agenda
 * panel's body size *is* a lone arc's title size, so `agenda-panel.test.ts` has to build the ring
 * this dial actually draws to check that. A suite carrying its own copy of the band would stay green
 * while the panel drifted above the arc titles it exists to serve.
 */
export const EDGE_MARGIN = 8;

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
  /**
   * The instant the first frame is drawn at.
   *
   * Required, and not because a default would be hard to write. It read `new Date()` until #152,
   * which is a clock read outside #72's `?now` / `?freeze` seam — and #152 was the *host* reading
   * that seam twice on the way up, so the dial and the demo fixture's anchor disagreed by however
   * long the load took. Making the caller name the instant is what keeps one load frame to one
   * clock read; a default is the same silent-omission hazard the build footer is generated to
   * avoid (ADR 0002).
   */
  time: Date;
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
  /**
   * Whether any surface on the dial states how long an event is (#178) — the teacher's
   * `showEventDurations`, resolved once by the host and handed down.
   *
   * It reaches two surfaces from here: the arc's own second line and the floating card's trailing
   * one. Off does not merely remove text from either. The arc gets back the line #35 takes under a
   * one-line title, and every card is cleared against one line fewer — `fitLabelToClearedWidth`
   * starts at `MAX_LINES + 1` whenever a trailing line is *offered*, so a card that offers a
   * duration is charged for it whether or not it ever draws one (#183).
   */
  showDurations?: boolean;
  /**
   * The event ids some other surface is already naming — in practice the agenda panel's column
   * (#172). Read at render time rather than captured, because the panel's card set changes on its
   * own schedule.
   *
   * A floating label whose event is in here **and** whose card is in collision is dropped: the name
   * is on the panel at 21.2576 units on a plain ground, where the card would have carried it at
   * 17.52 on the band. Omitted, or returning an empty set, suppresses nothing — which is what a
   * board too narrow for the panel (#171) and a page without one must both get, since there the card
   * is the only thing naming that arc.
   */
  namedElsewhere?: () => ReadonlySet<string>;
  /**
   * Where a floating label's card is allowed to sit — the shipped ring, or #138's two side sectors.
   *
   * **A spike, and off unless a URL asks for it.** #138 proposes confining cards to the sides and
   * the owner's call is that it is settled by looking rather than by argument, so this exists to put
   * the two side by side on a board. `"ring"` is the shipped behaviour and every default path takes
   * it; nothing here is stored, because a preference is a decision and this is a question.
   */
  labelPlacement?: LabelPlacement;
  /**
   * The radius a card's centre sits on, overriding `LABEL_RADIUS_RATIO` (#138).
   *
   * A number in viewBox units, or `"wide"` for ADR 0009's circle derived from whatever margin the
   * board granted — the *widest* candidate, not a clearing one. Rendered on the sides it measures
   * **246.8 against the band's 292 at 16:9**, so a card is 45.2 units inside the band; the ADR solves
   * three o'clock only and `adrBandClearingCircle` says so. Also a spike, and useful on the ring as
   * well as the sides: the three
   * radii the fork trades between are 297.84 (the only one that keeps a card above `#status`), about
   * 380 (the width optimum on 16:9) and about 452 (the only one that clears the band), and a
   * maintainer standing at a board can walk them without a rebuild.
   */
  labelLocus?: LabelLocus;
}

/** #138's fork, as something a render can be asked for. */
export type LabelPlacement = "ring" | "sides";

/** A locus radius in viewBox units, or ADR 0009's circle read off the granted margin. */
export type LabelLocus = number | "wide" | null;

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
   * Redraw the dial at the other time scale (#85's switch, over #34's geometry).
   *
   * A redraw and not a transition: the two scales share no drawn element — different outer
   * numerals, a second numeral ring, different hand lengths, and an arc set taken from a different
   * window at a different degrees-per-minute — so there is nothing to tween. The host is expected
   * to hide the change behind a fade; this call is the instant it happens.
   *
   * The `<svg>` element itself survives, which is what lets the host fade **one** node rather than
   * cross-dissolving two dials that would each cost a full layout. A no-op when the scale is
   * already the one showing.
   */
  setScale(scale: DialScaleId): void;
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
  time,
  scale: scaleId = "12h",
  labelMargin = null,
  showDurations = true,
  namedElsewhere,
  labelPlacement = "ring",
  labelLocus = null,
}: AnalogClockParams): AnalogClockHandle {
  /**
   * Both re-bound by `setScale`, so the parameter is the dial's opening scale rather than its
   * only one. Every read of either is inside `renderEvents`, which runs again on the way out.
   */
  let scale = dialScale(scaleId);
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

  /**
   * The locus a card's centre sits on this render (#138's spike).
   *
   * A function rather than a constant because `"wide"` is derived from the granted margin, which
   * `setLabelMargin` re-hands on every resize — the same reason `layoutBox` is rebuilt per render.
   * `"wide"` without a grant falls back to the ring: ADR 0009's circle is the *board's* edge and a
   * page that could not measure one has no board to put a card against.
   */
  function currentLocus(): number {
    if (typeof labelLocus === "number") return labelLocus;
    if (labelLocus === "wide" && grantedMargin !== null) {
      return adrBandClearingCircle(outerRadius, size / 2 + grantedMargin);
    }
    return labelRadius;
  }

  /** Units past the viewBox a card may reach; re-granted on resize, so read at render time. */
  let grantedMargin = labelMargin;

  /**
   * Rebuilt per render rather than captured, so `setLabelMargin` has one thing to change and the
   * geometry is never handed a box that disagrees with the allowance it was measured for.
   */
  function layoutBox(): ClockBox {
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
  let face = clockFace({ faceRadius, cx, cy, time, showSeconds, scale: scaleId });

  // Face last, so the hands paint over any label bleeding toward the centre.
  element.append(arcsLayer, labelsLayer, face.element);

  let currentTime = time;
  let currentEvents = events;
  let renderedCount = 0;
  /** Size only — the change detector for arcs whose event has finished since the last tick. */
  let elapsedCount = 0;
  /** The rolling window moves continuously, so the change detector is the calendar minute. */
  let renderedMinute = minuteKey(time);
  /**
   * The panel's card set as of the last render, and the dial's fourth rebuild trigger (#172).
   *
   * The panel rebuilds when its column changes, which is a trigger none of the dial's three cover:
   * the column holds only what fits, so an event entering the top of it can push the last one out
   * with nothing on the band changing at all. Without this, a label suppressed because the panel
   * named its event would stay suppressed after the panel dropped the row — and the event would be
   * named **nowhere**, which is #146's defect arriving as a race rather than as a policy.
   */
  let renderedNamesKey = "";
  /** Read once per render, so the suppression pass and the rebuild key cannot disagree (#152). */
  let renderedNames: ReadonlySet<string> = new Set<string>();

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

    // One read per render, feeding both the suppression pass and the rebuild key. Two reads is
    // #152's bug in a new place: the panel could change between them, and the dial would then
    // suppress against one set while recording that it had rendered another — leaving it convinced
    // it was up to date.
    renderedNames = namedElsewhere?.() ?? new Set<string>();
    renderedNamesKey = panelNamedKey(renderedNames);

    const clockBox = layoutBox();
    const locus = currentLocus();

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
          showDuration: showDurations,
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
            labelRadius: locus,
            color: event.color,
            cx,
            cy,
            clockBox,
            faceRadius,
            fontSize: labelFontSize,
            // Empty for anything under a minute, which `fitLabelToWidth` then treats as a line
            // whose width is zero — so pass undefined instead and leave the card at its title. The
            // same path the whole dial takes with durations switched off (#178).
            duration: showDurations
              ? formatEventDuration(event.durationMinutes) || undefined
              : undefined,
          },
        });
      }
    }

    // Clockwise, so labels stack down the page in the order a reader scans the dial.
    overflowing.sort((a, b) => a.startAngle - b.startAngle);

    // #138's spike. Top and bottom stop being label positions: every card is pulled into one of two
    // side sectors and its connector is left pointing back at the arc. Applied here, before any of
    // the three passes below, because all of them measure rects — a card moved afterwards would be
    // suppressed, sized and displaced against a position it is not drawn at, which is #134's
    // ordering bug in a new place.
    //
    // The angular room each card needs comes from the card laid out at its *own* bearing, one pass.
    // Height depends on bearing depends on height, and the spread is a separation rule rather than a
    // proof of non-overlap (`side-placement.ts` says so, and the nudge pass below still runs), so iterating
    // it would buy precision the rule does not have. The height is taken with the duration line
    // offered, which the planner below may then decline — so the demand is over-stated rather than
    // under-stated, which is the safe direction for a separation.
    if (labelPlacement === "sides") {
      const cardAngles = sideCardAngles(
        overflowing.map(({ params }) => ({
          anchorAngle: params.anchorAngle,
          angularHeight: angularHeight(
            floatingLabelGeometry({ ...params, cardAngle: sectorTarget(params.anchorAngle) }).rect
              .height,
            locus
          ),
        }))
      );
      overflowing.forEach((entry, index) => {
        entry.params.cardAngle = cardAngles[index];
      });
    }

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
    const baseRects = titleOnly.map((params) => floatingLabelGeometry(params).rect);

    // #172, and it runs *before* the resolver below rather than after it. Measured after the
    // resolver only 2 of 251 cards still overlap, because it has already paid for the rest in
    // declined duration lines and displacement — so suppressing first is what makes this relief free
    // instead of retrospective. Every card the panel has already named and that is landing on
    // another card goes, and the ones sitting clear keep their position, which is the only channel
    // saying *which arc* the name belongs to.
    const dropped = labelsDischargedByPanel(
      overflowing.map(({ params }, index) => ({ id: params.id, rect: baseRects[index] })),
      renderedNames
    );
    const kept = overflowing
      .map((_entry, index) => index)
      .filter((index) => !dropped.has(index));

    const { accepted, nudges } = planOptionalLines(
      kept.map((index) => ({
        base: baseRects[index],
        grown:
          overflowing[index].params.duration === undefined
            ? null
            : floatingLabelGeometry(overflowing[index].params).rect,
      })),
      cy,
      labelVerticalBand(clockBox)
    );

    labelsLayer.append(
      ...kept.map((index, position) => {
        const chosen = accepted[position] ? overflowing[index].params : titleOnly[index];
        return floatingLabel(
          nudges[position] === 0 ? chosen : { ...chosen, verticalNudge: nudges[position] }
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
      // A fourth trigger since #172: the panel's column changes on its own schedule, and a label
      // suppressed because the panel named its event has to come back the moment it stops.
      const minuteChanged = minuteKey(next) !== renderedMinute;
      const elapsedChanged = elapsedEventIds(currentEvents, next).size !== elapsedCount;
      const namesChanged = panelNamedKey(namedElsewhere?.() ?? new Set<string>()) !== renderedNamesKey;
      if (
        minuteChanged ||
        elapsedChanged ||
        namesChanged ||
        hasEventInProgress(currentEvents, next)
      ) {
        renderEvents();
      }
      describe();
    },

    setEvents(next: ClockEventInput[]): void {
      currentEvents = next;
      renderEvents();
      describe();
    },

    setScale(next: DialScaleId): void {
      if (next === scaleId) return;
      scaleId = next;
      scale = dialScale(next);

      // `clockFace` resolves its numerals, its two rings and both hand lengths at construction, so
      // the face is rebuilt rather than re-pointed — and built at `currentTime`, not at the `time`
      // this dial opened on, or the hands would jump back to the load frame.
      const replacement = clockFace({
        faceRadius,
        cx,
        cy,
        time: currentTime,
        showSeconds,
        scale: scaleId,
      });
      element.replaceChild(replacement.element, face.element);
      face = replacement;

      // `replaceChild` keeps the face last, which is the order that matters: the hands paint over
      // any label bleeding toward the centre.
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
