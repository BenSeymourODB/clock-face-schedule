/**
 * One calendar event as a coloured donut arc on the dial's outer band, carrying its emoji and a
 * curved title.
 * Ported from next-digital-wall-calendar's `analog-clock/event-arc.tsx`.
 *
 * Read-only by design. NDWC's arcs are `role="button"` wired to an event-detail modal with focus
 * restoration; there is no detail surface here, and inventing one is a UX task rather than a port.
 */
import {
  type ArcFeathers,
  type ArcTitleLayout,
  type ClockEvent,
  type FeatherSpan,
  type OccludedSpan,
  adjustForContrast,
  combineTitleWithEmoji,
  compositeOver,
  computeArcFeathers,
  computeArcTitleLayout,
  computeDrainFraction,
  computeDrainMasks,
  computeDrainTextSplit,
  contrastRatio,
  describeArc,
  describeTextArc,
  fitDurationLine,
  formatEventDuration,
  polarToCartesian,
  readableTextColor,
  roundCoord,
  textFlipCoverage,
} from "../../shared/clock";
import { svg } from "../svg";

const FONT_STACK = "system-ui, -apple-system, sans-serif";

/**
 * The dial's own background, as a hex `contrast.ts` can measure against — the value `--card` holds
 * in `Styles.html`, duplicated here because the renderer knows only the token name (ADR 0007).
 * Keep the two in sync; `Styles.html` carries a comment pointing back.
 *
 * Note this is the *face circle's* fill, and the arc band sits outside it, over `--page`. The
 * elapsed outline below is measured against this one anyway, as #26/#27 wrote it: the real ground is
 * darker, so an outline adjusted against `--card` over-clears rather than under-clears. Tracked
 * separately rather than changed here, since correcting it moves every elapsed arc's colour.
 */
const DIAL_BACKGROUND = "#16181d";

/**
 * What is actually behind the arc band: `--page`, not `--card`.
 *
 * The band is drawn outside the face circle (`analog-clock.ts` insets the face by
 * `FACE_GAP_RATIO`), so this is the ground a drained arc exposes and the ground its fill composites
 * over. Sampled off the rendered preview at band radius to confirm it, rather than inferred:
 * `#0c0e12` both where no arc is drawn and inside a draining arc's spent side.
 *
 * The difference is not cosmetic — black text measures 1.09:1 here against 1.18:1 on `--card`, and
 * every drain-seam split lands 0.03–0.10 of the ramp away if the wrong one is used.
 */
const BAND_BACKGROUND = "#0c0e12";

/**
 * The hex behind `var(--card-foreground)`, for the same reason `BAND_BACKGROUND` is spelled out: a
 * title copy has to be *measured* against the ground it lands on, and the token is the only thing
 * the renderer would otherwise know. Keep in sync with `Styles.html`, which pairs it with `--card`.
 *
 * Not pure white, which is why it has to be measured rather than assumed — it is 17.54:1 on the band
 * against `#ffffff`'s 19.32:1, and on a mid-luminance fill that gap is the whole decision.
 */
const BAND_FOREGROUND = "#f2f4f8";

/** The other candidate a title copy can take, and the one `readableTextColor` picks for most fills. */
const BLACK_TEXT = "#000000";

/**
 * Contrast floor for an elapsed outline's own colour, against the dial (#27).
 *
 * Outlined, an event colour is the foreground rather than the fill, so it has to clear a threshold
 * it never had to when filled — and ⚫ (1.21:1) and 🟤 (2.50:1) fail it outright. 4.5:1 is WCAG AA
 * for text rather than the 3:1 graphical-object floor, because this dial is read across a room.
 */
const OUTLINE_MIN_CONTRAST = 4.5;

/** Below this span there is not enough arc to render an emoji legibly. */
const EMOJI_MIN_SPAN_DEGREES = 10;

/** Below this span there is not enough arc for a title. */
const TITLE_MIN_SPAN_DEGREES = 20;

/**
 * Where the emoji sits across the ring, and how big it is, as fractions of the ring's height.
 *
 * Centred, at the same ratio as `TITLE_RADIUS_RATIO`: the glyph only renders standalone, when no
 * title is sharing the ring, so it takes the centre the title would have taken.
 *
 * Uncapped, for the same reason the title's ceiling went: a cap in viewBox units means "never
 * larger than this fraction of the dial", which fights every attempt to make the dial readable
 * from further away.
 */
const EMOJI_RADIUS_RATIO = 0.5;
const EMOJI_FONT_SIZE_RATIO = 0.3;

const ARC_FILL_OPACITY = 0.85;

/**
 * Fill left under an elapsed arc.
 *
 * Zero draws the pure outline #26 specifies. A little body might read better at distance, so this
 * is a constant rather than an omission — but note it can only add *weight*, never contrast: 10% of
 * `#1F2937` over `#16181d` is still `#16181d` to the eye. Colour legibility is #27's problem.
 */
const ELAPSED_FILL_OPACITY = 0;

/**
 * Separator between adjacent arcs, as a fraction of the ring's height, with an absolute floor.
 *
 * A fraction so it thickens with the band rather than thinning as the dial grows; a floor because
 * on a deeply stacked ring the fraction alone would vanish and adjacent arcs would merge into one
 * indistinguishable block.
 */
const ARC_SEPARATOR_RATIO = 0.03;
const ARC_SEPARATOR_MIN = 1;

/**
 * An elapsed arc's outline, as a fraction of **the whole band** — not of this arc's ring.
 *
 * Heavier than the separator because the outline now *is* the arc: with no fill behind it, a
 * hairline is all that stands between the event and not being drawn. Sizing from the ring got that
 * exactly backwards on a stacked cluster, where the ring is a third of the band: rendering showed a
 * 1.56-unit outline against a 2.28-unit *live* separator, so the arcs that had least room also got
 * the faintest outline. The band does not change with overlap depth, so every elapsed arc on the
 * dial now carries the same weight.
 *
 * #26 drew this as a 0.07 coloured line inside a 0.12 neutral `var(--border)` band, because an
 * event's colour could not be trusted to contrast — ⚫ gray-800 measures 1.21:1 on `--card`, which
 * is not a faint edge but no edge. Now that #27 resolves the colour itself to 4.5:1 the neutral band
 * has nothing left to carry and is gone, leaving one coloured outline that reads on its own.
 *
 * The ratio stays at 0.07 rather than growing into the width the neutral band used to occupy.
 * Widening it to 0.12 was tried and reverted: `ELAPSED_STROKE_MAX_RATIO` then clamps it on a
 * three-deep ring (8.91 against the 9.11 a lone arc gets) and a four-deep one (6.23), so the arcs
 * with least room would again carry the thinnest outline — the exact inversion this constant's
 * band-sizing exists to prevent. 0.082 is the widest that stays uniform at the four-ring cap, so
 * there is no room worth taking.
 */
const ELAPSED_BORDER_RATIO = 0.07;

/**
 * Ceiling on either stroke, as a fraction of the ring it is drawn on.
 *
 * A stroke straddles its path, so one wider than the ring closes the hollow interior back up and
 * the arc reads as filled again — which is the one thing an elapsed arc must not do.
 */
const ELAPSED_STROKE_MAX_RATIO = 0.4;

/**
 * The elapsed outline's width for one ring — sized from the band, capped by the ring: uniform weight
 * wherever there is room for it, and narrower only where the ring genuinely cannot carry it.
 *
 * Exported because it is also the widest stroke drawn on an arc's own outline, so it is what the
 * title layout has to keep its lines clear of (#67) — and the dial computes that layout before it
 * renders the arc. A second derivation of this number in the caller is exactly how the text and the
 * stroke came to be sized from different quantities with nothing comparing them.
 */
export function arcEdgeStrokeWidth(ringThickness: number, bandThickness: number): number {
  return roundCoord(
    Math.max(
      ARC_SEPARATOR_MIN,
      Math.min(bandThickness * ELAPSED_BORDER_RATIO, ringThickness * ELAPSED_STROKE_MAX_RATIO)
    )
  );
}

interface FadeMaskGeometry {
  cx: number;
  cy: number;
  innerRadius: number;
  outerRadius: number;
  separatorWidth: number;
}

interface NamedSpan {
  key: string;
  span: FeatherSpan;
}

/** The window-edge feathers, as the flat span list `buildFadeMask` takes. */
function feathersToSpans(feathers: ArcFeathers): NamedSpan[] {
  return [
    { key: "start", span: feathers.start },
    { key: "end", span: feathers.end },
  ].filter((entry): entry is NamedSpan => entry.span !== undefined);
}

/**
 * A luminance mask that fades the arc out across whichever spans it is given — a window edge
 * (#22), a drain boundary (#28), or both at once — and hides outright whichever regions it is told
 * to occlude.
 *
 * Masks the whole path rather than tinting its fill, because the separator stroke traces the arc's
 * closed outline — leave it alone and a crisp line still caps the boundary, which is the very
 * thing the fade exists to deny.
 *
 * A white ground makes everything opaque; each fade lays a black gradient over it, running from
 * opaque black at the boundary to zero alpha where the arc resumes full strength. That is the whole
 * model a window feather needs, where the arc genuinely continues past the edge — but it can only
 * soften an edge, never hide a side, and a drain boundary needs one side gone (#71). So an
 * occluded region is painted solid black on the same ground, stopping *at* the boundary: the ramp
 * already pads past it to swallow the stroke, and a solid overrunning the boundary would blacken
 * the first fraction of a degree the ramp is supposed to own.
 *
 * Every region is painted onto a wedge rather than the whole box, so that neither `pad` spread nor
 * a rect can reach the far side of an arc that curves back around past 180°.
 */
function buildFadeMask(
  maskId: string,
  spans: NamedSpan[],
  { cx, cy, innerRadius, outerRadius, separatorWidth }: FadeMaskGeometry,
  occlusions: OccludedSpan[] = []
): SVGMaskElement | undefined {
  if (spans.length === 0 && occlusions.length === 0) return undefined;

  // The wedge has to swallow the stroke, which straddles the path by half its width in every
  // direction — including angularly, past the boundary.
  const padDegrees = (separatorWidth / outerRadius) * (180 / Math.PI);
  const box = {
    x: roundCoord(cx - outerRadius - separatorWidth),
    y: roundCoord(cy - outerRadius - separatorWidth),
    size: roundCoord((outerRadius + separatorWidth) * 2),
  };
  // A linear gradient runs along a straight axis, and over ten degrees the chord it follows is
  // indistinguishable from the arc: a radial offset is perpendicular to that axis, so it projects
  // onto it only to second order.
  const midRadius = (innerRadius + outerRadius) / 2;

  const mask = svg("mask", {
    id: maskId,
    maskUnits: "userSpaceOnUse",
    x: box.x,
    y: box.y,
    width: box.size,
    height: box.size,
  });

  mask.append(
    svg("rect", {
      x: box.x,
      y: box.y,
      width: box.size,
      height: box.size,
      fill: "#ffffff",
      "data-mask-part": "ground",
    })
  );

  /** The padded wedge every region is painted onto, between two angles in any order. */
  const wedge = (fromAngle: number, toAngle: number): string =>
    describeArc(
      cx,
      cy,
      outerRadius + separatorWidth,
      Math.max(0, innerRadius - separatorWidth),
      Math.min(fromAngle, toAngle),
      Math.max(fromAngle, toAngle)
    );

  for (const span of occlusions) {
    // Padded away from the boundary, so the stroke straddling the arc's far end is swallowed too.
    const away = Math.sign(span.toAngle - span.fromAngle);

    mask.append(
      svg("path", {
        "data-mask-part": "occlusion",
        d: wedge(span.fromAngle, span.toAngle + away * padDegrees),
        fill: "#000000",
      })
    );
  }

  for (const { key, span } of spans) {
    const gradientId = `${maskId}-${key}`;
    const boundary = polarToCartesian(cx, cy, midRadius, span.fromAngle);
    const resumes = polarToCartesian(cx, cy, midRadius, span.toAngle);

    const towardArc = Math.sign(span.toAngle - span.fromAngle);
    const wedgeEdge = span.fromAngle - towardArc * padDegrees;

    mask.append(
      svg(
        "linearGradient",
        {
          id: gradientId,
          gradientUnits: "userSpaceOnUse",
          x1: boundary.x,
          y1: boundary.y,
          x2: resumes.x,
          y2: resumes.y,
        },
        [
          svg("stop", { offset: "0", "stop-color": "#000000", "stop-opacity": 1 }),
          svg("stop", { offset: "1", "stop-color": "#000000", "stop-opacity": 0 }),
        ]
      ),
      svg("path", {
        "data-mask-part": "ramp",
        d: wedge(wedgeEdge, span.toAngle),
        fill: `url(#${gradientId})`,
      })
    );
  }

  return mask;
}

export interface EventArcParams {
  event: ClockEvent;
  cx: number;
  cy: number;
  innerRadius: number;
  outerRadius: number;
  /**
   * Computed once by the dial and passed down, so this arc and its floating label cannot
   * disagree about whether the title overflowed — a disagreement shows the title twice or not
   * at all. Recomputed here only when an arc is rendered standalone.
   */
  layout?: ArcTitleLayout;
  /** The title is rendering as a floating label instead, so suppress the in-arc copy. */
  forceHideTitle?: boolean;
  /** The event has finished: draw it hollow, as an outline rather than a filled block. */
  isElapsed?: boolean;
  /**
   * Width of the whole arc band, which an elapsed outline is sized from so that its weight does
   * not shrink with overlap depth. Defaults to this arc's own ring, for standalone rendering.
   */
  bandThickness?: number;
  /**
   * The current time, in the same angle space as the event's own angles. Ignored once `isElapsed`
   * is true — a finished event has nothing left to drain. Otherwise, when this falls strictly
   * inside the event's true span, the arc splits at the boundary (#28): the elapsed portion reads
   * as #26's hollow outline, the rest keeps its fill, and a short gradient marks the seam.
   */
  nowAngle?: number;
}

export function eventArc({
  event,
  cx,
  cy,
  innerRadius,
  outerRadius,
  layout,
  forceHideTitle = false,
  isElapsed = false,
  bandThickness,
  nowAngle,
}: EventArcParams): SVGGElement {
  const { id, cleanTitle, color, eventEmoji, startAngle, endAngle } = event;
  const displayTitle = combineTitleWithEmoji(cleanTitle, eventEmoji);

  const arcSpan = endAngle - startAngle;
  const midAngle = (startAngle + endAngle) / 2;
  const arcHeight = outerRadius - innerRadius;

  // Announced whatever the radial budget allows, unlike the drawn line below: a listener has no
  // angular extent to read duration off in the first place, so this is the only channel they have.
  const spokenDuration = formatEventDuration(event.durationMinutes);

  const group = svg("g", {
    "data-testid": `event-arc-group-${id}`,
    role: "img",
    "aria-label": spokenDuration
      ? `Event: ${displayTitle}, ${spokenDuration}`
      : `Event: ${displayTitle}`,
  });

  const defs = svg("defs");
  group.append(defs);

  const separatorWidth = roundCoord(
    Math.max(ARC_SEPARATOR_MIN, arcHeight * ARC_SEPARATOR_RATIO)
  );
  const geometry: FadeMaskGeometry = { cx, cy, innerRadius, outerRadius, separatorWidth };
  const featherSpans = feathersToSpans(computeArcFeathers(event));

  // A still-running event drains continuously (#28) rather than flipping straight from live to
  // elapsed. Computed from the *true* angles so MIN_ARC_DEGREES widening a short event never
  // distorts how far "into it" the boundary reads; `computeDrainMasks` below maps the resulting
  // fraction back onto the drawn geometry this arc actually paints.
  const drainFraction =
    !isElapsed && nowAngle !== undefined
      ? computeDrainFraction(event.trueStartAngle, event.trueEndAngle, nowAngle)
      : undefined;
  const isDraining = drainFraction !== undefined;

  // Not draining: fill and every border layer share one mask, exactly as before #28. Draining:
  // the fill needs to fade toward what's left while the halo/outline fade the opposite way toward
  // what's spent, so they need two masks meeting at the same boundary.
  const drain = isDraining
    ? computeDrainMasks(startAngle, endAngle, drainFraction)
    : undefined;

  let fillMask: SVGMaskElement | undefined;
  let spentMask: SVGMaskElement | undefined;
  if (drain) {
    const { fillSpan, spentSpan, fillOccluded, spentOccluded } = drain;
    // Each mask hides the side it does not own outright and ramps only across the seam. The
    // feathers ride along on both: a draining arc can be window-clamped as well, and the clamp
    // still shapes whichever side of the boundary reaches the window edge.
    fillMask = buildFadeMask(
      `arc-fade-${id}`,
      [...featherSpans, { key: "drain", span: fillSpan }],
      geometry,
      [fillOccluded]
    );
    spentMask = buildFadeMask(
      `arc-drain-${id}`,
      [...featherSpans, { key: "drain", span: spentSpan }],
      geometry,
      [spentOccluded]
    );
  } else {
    fillMask = buildFadeMask(`arc-fade-${id}`, featherSpans, geometry);
    spentMask = fillMask;
  }
  if (fillMask) defs.append(fillMask);
  if (spentMask && spentMask !== fillMask) defs.append(spentMask);

  const fillFade = fillMask && `url(#${fillMask.id})`;
  const spentFade = spentMask && `url(#${spentMask.id})`;

  // Fill and outline are separate paths because an elapsed arc needs them treated differently —
  // the fill goes and the outline stays. Sharing one path, as this did, forces the two to move
  // together.
  const d = describeArc(cx, cy, outerRadius, innerRadius, startAngle, endAngle);
  const band = bandThickness ?? arcHeight;
  const edgeStrokeWidth = arcEdgeStrokeWidth(arcHeight, band);

  group.append(
    svg("path", {
      "data-testid": `event-arc-${id}`,
      // Which layer of the arc this is. `data-testid` says which event; this says which part,
      // so a caller can find the fill alone.
      "data-arc-part": "fill",
      d,
      fill: color,
      "fill-opacity": isElapsed ? ELAPSED_FILL_OPACITY : ARC_FILL_OPACITY,
      stroke: "none",
      mask: fillFade,
    })
  );

  // The live separator between adjacent arcs: present whenever any part of this arc is still
  // live — the pure-live case, or a draining event's not-yet-spent remainder.
  if (!isElapsed) {
    group.append(
      svg("path", {
        "data-testid": `event-arc-border-${id}`,
        "data-arc-part": "separator",
        d,
        fill: "none",
        stroke: "var(--card)",
        "stroke-width": separatorWidth,
        mask: fillFade,
      })
    );
  }

  // The elapsed treatment — a single coloured outline (#26, #27) — whenever any part of this arc
  // has already happened: the pure-elapsed case, or a draining event's spent portion.
  if (isElapsed || isDraining) {
    group.append(
      svg("path", {
        "data-testid": `event-arc-outline-${id}`,
        "data-arc-part": "outline",
        d,
        fill: "none",
        // The outline carries both the event's identity and its legibility, with no neutral band
        // beneath it, so the colour has to clear contrast against the dial on its own (#27).
        // Preserves hue, so a ⚫ or 🟤 event stays recognisably itself while becoming visible.
        stroke: adjustForContrast(color, DIAL_BACKGROUND, OUTLINE_MIN_CONTRAST),
        "stroke-width": edgeStrokeWidth,
        mask: spentFade,
      })
    );
  }

  const resolved =
    layout ??
    computeArcTitleLayout({
      title: displayTitle,
      arcSpan,
      innerRadius,
      outerRadius,
      // Standalone rendering: the dial passes a layout that already accounts for this.
      edgeStrokeWidth,
    });
  const showTitle = !forceHideTitle && arcSpan >= TITLE_MIN_SPAN_DEGREES;
  const titleRendersOnArc = showTitle && resolved.fit.lines.length > 0;

  // The emoji is inline with the title wherever the title renders — on the arc, or on the floating
  // label that took it over. This glyph is the fallback for the one case neither covers: an arc too
  // narrow to carry a title at all, where nothing else would say what the event is.
  //
  // Drawing it alongside a floating label instead collides with it. Measured on the fixture's
  // conference event, the glyph landed at x∈[91,122] y∈[166,188] against a card whose last line
  // spanned x∈[-1,99] y∈[156,173] — overlapping text, for a cue the label already carries inline.
  const showStandaloneGlyph = !forceHideTitle && !titleRendersOnArc;

  if (eventEmoji && showStandaloneGlyph && arcSpan >= EMOJI_MIN_SPAN_DEGREES) {
    const position = polarToCartesian(
      cx,
      cy,
      innerRadius + arcHeight * EMOJI_RADIUS_RATIO,
      midAngle
    );
    // Counter-rotate on the bottom half so the glyph stays upright.
    const rotation = midAngle > 90 && midAngle < 270 ? midAngle + 180 : midAngle;

    group.append(
      svg(
        "text",
        {
          "data-testid": `event-emoji-${id}`,
          x: position.x,
          y: position.y,
          "text-anchor": "middle",
          "dominant-baseline": "central",
          "font-size": roundCoord(arcHeight * EMOJI_FONT_SIZE_RATIO),
          transform: `rotate(${roundCoord(rotation)}, ${position.x}, ${position.y})`,
        },
        [eventEmoji]
      )
    );
  }

  if (titleRendersOnArc) {
    const { titleRadius, titleFontSize, lineOffset, fit } = resolved;

    /**
     * The copies of each title line, and what each is coloured for.
     *
     * One, normally: the title sits on the event's own colour, which no token describes and which
     * the calendar may supply, so `readableTextColor` picks against it (NDWC used a fixed white,
     * which measures 1.9:1 on the palette's yellow, #15). Once the arc is elapsed the fill is gone
     * and the text sits on the dial instead, where the theme already guarantees a pairing —
     * `--card-foreground` is 16:1 on `--card`. Computing a ratio there would need the token's hex,
     * which this does not have; the event colour would reintroduce the very failures #27 is about.
     *
     * A draining arc can have *both* grounds under one title, and mostly no single copy serves them:
     * black measures 1.09:1 on the bare band a drained side exposes, and `--card-foreground` measures
     * 2.35:1 on a filled 🟡. So each ground gets its own copy, masked to itself — the same glyphs at
     * the same coordinates, so a letter on the split changes colour rather than doubling.
     *
     * Which colour each copy takes is *measured against the ground that copy lands on*, from the two
     * the theme offers. Deriving it from the authored hex instead — as the live case must, having no
     * composite to measure — picks black for seven of the nine palette colours, and for two of those
     * black is the worse choice once composited over the band:
     *
     * | on its own fill | black | `--card-foreground` |
     * | --- | --- | --- |
     * | 🟡 🟢 🟠 ⚪ 🔵 | 8.11, 6.93, 5.66, 13.85, 4.46 | 2.35, 2.75, 3.37, 1.38, 4.28 |
     * | 🔴 🟣 | 4.31, 4.14 | **4.43, 4.60** |
     * | ⚫ 🟤 | 1.36, 2.48 | **14.04, 7.69** |
     *
     * So 🔴 and 🟣 join ⚫ and 🟤 in needing no split at all: one unmasked copy in the colour that
     * reads on both grounds. Their titles do change colour at the moment the event starts draining —
     * from the live case's black to the light token — which is the same colour they will keep once
     * elapsed, and worth 0.12 and 0.46 of a contrast ratio on the half that is still filled.
     *
     * The two masks are the drain split *without* the seam ramp and *without* the window feathers:
     *
     * - **No ramp.** Inside the ramp both copies paint at partial alpha and blend toward mid-grey;
     *   measured on the fixture, a glyph there fell to 1.4:1 against its own ground. Hard-edged,
     *   each half is painted at full strength for the ground it lands on.
     * - **Split where the colours cross, not at the seam's midpoint.** `computeDrainTextSplit` puts
     *   it at `textFlipCoverage`: 4.37:1 at worst across the whole ramp, against 2.35:1 for either
     *   colour used alone. That is the max-min, not a pass — a seam cannot clear AA with this pair,
     *   and the pair is the theme's (ADR 0007).
     * - **No feathers.** A title at a window edge is deliberately left unmasked (#22) so the name
     *   stays readable where the band does not; a draining arc must not quietly reverse that.
     */
    const drainedFill = compositeOver(BAND_BACKGROUND, color, ARC_FILL_OPACITY);
    const onFill = (text: string) => contrastRatio(text, drainedFill ?? color) ?? 0;
    const splitCoverage =
      drain && onFill(BLACK_TEXT) > onFill(BAND_FOREGROUND)
        ? textFlipCoverage(BAND_BACKGROUND, color, ARC_FILL_OPACITY, BAND_FOREGROUND, BLACK_TEXT)
        : 1;
    const textSplit =
      drain && splitCoverage < 1 ? computeDrainTextSplit(drain, splitCoverage) : undefined;

    const titleLayers = textSplit
      ? [
          {
            name: "live",
            fill: BLACK_TEXT,
            mask: buildFadeMask(`arc-title-live-${id}`, [], geometry, [textSplit.live]),
          },
          {
            name: "spent",
            fill: "var(--card-foreground)",
            mask: buildFadeMask(`arc-title-spent-${id}`, [], geometry, [textSplit.spent]),
          },
        ]
      : [
          {
            name: isElapsed || drain ? "spent" : "live",
            fill: isElapsed || drain ? "var(--card-foreground)" : readableTextColor(color),
            mask: undefined,
          },
        ];

    for (const layer of titleLayers) {
      if (layer.mask) defs.append(layer.mask);
    }

    // The first line has to appear *above* the second on screen, and which radius that is flips
    // with the half of the dial: further out is higher at the top and lower at the bottom. Always
    // putting line one on the outer radius made lower-half titles read bottom-up.
    const isBottomHalf = midAngle > 90 && midAngle < 270;

    // #35's second duration channel takes the line a one-line title left free, at the radius a
    // two-line title's second line already occupies — so it adds no new radial arithmetic. A title
    // already on two lines has spent the arc's text budget: a three-line stack measures 34.01 of a
    // lone arc's 37.96 half-band, and overruns every stacked ring.
    //
    // `fitDurationLine` owns the rest of the gating, including re-checking the *title* against the
    // radius this line displaces it onto. The stroke width it is handed is the elapsed outline's,
    // the widest thing drawn on this arc's own outline — and it is passed whether or not this arc
    // has elapsed, because a duration line appearing at the moment an event finished would flicker
    // on the wall.
    const durationLine =
      fit.lines.length === 1
        ? fitDurationLine({
            durationMinutes: event.durationMinutes,
            arcSpan,
            titleLine: fit.lines[0],
            titleRadius,
            fontSize: titleFontSize,
            innerRadius,
            outerRadius,
            bandThickness: band,
            edgeStrokeWidth,
          })
        : undefined;

    const lines = durationLine === undefined ? fit.lines : [fit.lines[0], durationLine];

    const radii =
      lines.length === 2
        ? isBottomHalf
          ? [titleRadius - lineOffset, titleRadius + lineOffset]
          : [titleRadius + lineOffset, titleRadius - lineOffset]
        : [titleRadius];

    const titleGroup = svg("g", { "data-testid": `event-title-${id}` });

    radii.forEach((radius, index) => {
      const isDurationLine = durationLine !== undefined && index === 1;
      const pathId = `text-path-${id}-${index}`;

      defs.append(
        svg("path", {
          id: pathId,
          d: describeTextArc(cx, cy, radius, startAngle, endAngle),
          fill: "none",
        })
      );

      // One <text> per line rather than one <text> with two <textPath> children, so each line
      // has its own typographic context and there is no SVG 2 path-sequencing question. A draining
      // arc adds a second copy per line — see `titleLayers`.
      for (const layer of titleLayers) {
        titleGroup.append(
          svg(
            "text",
            {
              "data-testid": isDurationLine ? `event-duration-${id}` : undefined,
              "data-title-layer": layer.name,
              "font-size": titleFontSize,
              // The duration sits a weight below the name rather than a size below it. The
              // brainstorm is explicit that duration "is the content" here, not a caption — and
              // shrinking the text is the one de-emphasis that costs legibility, which on a stacked
              // ring is already the scarce thing. Opacity was the other option and was rejected: it
              // trades contrast away, and #15/#27 are both about not doing that.
              "font-weight": isDurationLine ? 400 : 500,
              fill: layer.fill,
              mask: layer.mask && `url(#${layer.mask.id})`,
              "font-family": FONT_STACK,
            },
            [
              svg(
                "textPath",
                {
                  href: `#${pathId}`,
                  startOffset: "50%",
                  "text-anchor": "middle",
                  "dominant-baseline": "central",
                },
                [lines[index]]
              ),
            ]
          )
        );
      }
    });

    group.append(titleGroup);
  }

  return group;
}
