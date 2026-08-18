/**
 * How far a still-running event has drained by `now`, and the fades that mark the boundary.
 *
 * Extends #26's binary elapsed/live split to a continuous one: a fifty-five-minute mark in a
 * one-hour event now reads as almost-spent rather than looking identical to one that has not
 * started. #22's feather is the same shape retargeted — a short gradient anchored at a boundary,
 * fading inward — pointed at `now` instead of a window edge.
 */
import { FEATHER_DEGREES, FEATHER_MAX_SPAN_RATIO, type FeatherSpan } from './feather';

export interface DrainMasks {
  /** Where the boundary falls in the arc's own *drawn* coordinate space. */
  boundaryAngle: number;
  /** Reveals the fill moving away from the boundary toward what's left. */
  fillSpan: FeatherSpan;
  /** The mirror image: reveals the elapsed halo and outline moving toward what's spent. */
  spentSpan: FeatherSpan;
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
 * Where the drawn arc carries the drain boundary, and the two fades that meet there.
 *
 * Both fades share one depth, capped by whichever side of the boundary is shorter, so the ramp
 * never eats more of either side than #22 already allows an arc to lose at one end.
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

  return {
    boundaryAngle,
    fillSpan: { fromAngle: boundaryAngle, toAngle: boundaryAngle + depth },
    spentSpan: { fromAngle: boundaryAngle, toAngle: boundaryAngle - depth }
  };
}
