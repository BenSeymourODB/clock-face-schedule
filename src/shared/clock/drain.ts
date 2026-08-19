/**
 * How far a still-running event has drained by `now`, and the fades that mark the boundary.
 *
 * Extends #26's binary elapsed/live split to a continuous one: a fifty-five-minute mark in a
 * one-hour event now reads as almost-spent rather than looking identical to one that has not
 * started. #22's feather is the same shape retargeted — a short gradient anchored at a boundary,
 * fading inward — pointed at `now` instead of a window edge.
 */
import { FEATHER_DEGREES, FEATHER_MAX_SPAN_RATIO, type FeatherSpan } from './feather';

/**
 * A region hidden outright rather than faded, anchored at a boundary the way `FeatherSpan` is:
 * `fromAngle` is the boundary, `toAngle` the far end of the region beyond it.
 *
 * Distinct from `FeatherSpan` because a drain boundary asks for something a window edge never
 * does. #22's mask model — an opaque ground with one gradient wedge laid over it — can only
 * *soften* an edge, since everything the wedge does not reach stays opaque. A drain boundary needs
 * one side gone, and a ramp alone left 65–83% of it untouched (#71).
 */
export interface OccludedSpan {
  fromAngle: number;
  toAngle: number;
}

export interface DrainMasks {
  /** Where the boundary falls in the arc's own *drawn* coordinate space. */
  boundaryAngle: number;
  /** Reveals the fill moving away from the boundary toward what's left. */
  fillSpan: FeatherSpan;
  /** The mirror image: reveals the elapsed outline moving toward what's spent. */
  spentSpan: FeatherSpan;
  /** The spent side, which the fill and the live separator must not paint at all. */
  fillOccluded: OccludedSpan;
  /** The remaining side, which the elapsed outline must not paint at all. */
  spentOccluded: OccludedSpan;
}

/**
 * How far into its true span `now` falls, as a fraction, or `undefined` when `now` is outside the
 * event's true bounds.
 *
 * Those outside cases are #26's existing binary states — not yet started, or already finished —
 * and carry no partial position. Computed from *true* (window-clamped) angles rather than the
 * *drawn* ones, so `MIN_ARC_DEGREES` widening a short event never distorts how far "into it" the
 * boundary reads; callers map the fraction onto drawn geometry afterward.
 */
export function computeDrainFraction(
  trueStartAngle: number,
  trueEndAngle: number,
  nowAngle: number
): number | undefined {
  if (trueEndAngle <= trueStartAngle) return undefined;
  if (nowAngle <= trueStartAngle || nowAngle >= trueEndAngle) return undefined;
  return (nowAngle - trueStartAngle) / (trueEndAngle - trueStartAngle);
}

/**
 * Where the drawn arc carries the drain boundary, the two fades that meet there, and the side each
 * mask has to hide outright.
 *
 * Both fades share one depth, capped by whichever side of the boundary is shorter, so the ramp
 * never eats more of either side than #22 already allows an arc to lose at one end.
 *
 * **Each ramp straddles the boundary rather than starting at it.** Anchored at the boundary — as
 * this was until the masks began hiding anything — the fill reached full strength `depth` degrees
 * *after* `now` and the outline `depth` before it, so at `now` itself neither was at any strength:
 * measured on a `FEATHER_DEGREES`-capped ramp, 50% fill landed 5.0° past the boundary and full fill
 * 10°, which on a 12-hour dial reads **10 and 20 minutes late**, inside a dead band where the arc
 * states neither "spent" nor "left". Centred, the two cross at half strength exactly on `now`, and
 * the perceived seam is where the time is. It cost nothing: the ramp is the same width, moved.
 *
 * The occlusions therefore run from each ramp's own opaque end out to the arc's end, not from the
 * boundary — a solid region reaching to the boundary would paint over half of its own ramp.
 */
export function computeDrainMasks(
  startAngle: number,
  endAngle: number,
  fraction: number
): DrainMasks {
  const boundaryAngle = startAngle + fraction * (endAngle - startAngle);
  const remaining = endAngle - boundaryAngle;
  const spent = boundaryAngle - startAngle;
  const depth = Math.min(FEATHER_DEGREES, Math.min(remaining, spent) * FEATHER_MAX_SPAN_RATIO);
  const half = depth / 2;

  return {
    boundaryAngle,
    fillSpan: { fromAngle: boundaryAngle - half, toAngle: boundaryAngle + half },
    spentSpan: { fromAngle: boundaryAngle + half, toAngle: boundaryAngle - half },
    fillOccluded: { fromAngle: boundaryAngle - half, toAngle: startAngle },
    spentOccluded: { fromAngle: boundaryAngle + half, toAngle: endAngle }
  };
}

/**
 * Where a title crossing the seam should change colour, as the region each copy must not paint.
 *
 * Not at the boundary, and not at the ramp's midpoint: the fill arrives gradually, so the place the
 * two candidate colours change places is wherever the blend makes them equally legible. `coverage`
 * is that fraction of the ramp — see `textFlipCoverage` — and splitting there maximises the worst
 * contrast anywhere across the seam.
 *
 * Measured along the ramp itself, so it tracks whatever the ramp does: coverage 0 is the ramp's
 * opaque end, where no fill has arrived, and 1 its far end, where the fill is at full strength.
 *
 * Hard-edged on purpose. Ramping the two copies against each other instead makes both partly
 * transparent through the middle of the seam, and they blend toward a mid-grey that measured 1.4:1
 * against its own ground.
 */
export function computeDrainTextSplit(
  { fillSpan, fillOccluded, spentOccluded }: DrainMasks,
  coverage: number
): { live: OccludedSpan; spent: OccludedSpan } {
  const splitAngle = fillSpan.fromAngle + coverage * (fillSpan.toAngle - fillSpan.fromAngle);

  return {
    live: { fromAngle: splitAngle, toAngle: fillOccluded.toAngle },
    spent: { fromAngle: splitAngle, toAngle: spentOccluded.toAngle }
  };
}
