/**
 * Where an arc should fade out because the period, not the event, ended it.
 *
 * An arc is clamped to the 12-hour window and then simply stops, so an event running 11:30–12:30
 * is drawn ending exactly at noon and the dial states a finish time that is not true. Fading the
 * clamped end says "continues past here" without needing a second glance to interpret.
 */
import type { ClampedArcAngles } from './types';

/**
 * How far the fade reaches into the arc, in degrees.
 *
 * Wider than the 6° between two minute ticks, so it reads as a ramp rather than a soft edge, and
 * narrow enough on any arc long enough to cross a boundary that the event still has a solid body.
 */
export const FEATHER_DEGREES = 10;

/**
 * Ceiling on the fade as a fraction of the arc, per end.
 *
 * A short event sitting on the boundary would otherwise be almost entirely transparent — the arc
 * that most needs to be seen is the one about to happen. Both ends can feather, so an arc keeps at
 * least 30% of itself at full strength.
 */
export const FEATHER_MAX_SPAN_RATIO = 0.35;

/**
 * One fade, running from full transparency at `fromAngle` to full opacity at `toAngle`.
 *
 * `fromAngle` is the period boundary, so on a trailing fade it is the *larger* angle and the span
 * runs anticlockwise. Callers drawing a wedge need to order the two.
 */
export interface FeatherSpan {
  fromAngle: number;
  toAngle: number;
}

export interface ArcFeathers {
  start?: FeatherSpan;
  end?: FeatherSpan;
}

/** The fades an arc needs, given which of its ends the period cut off. */
export function computeArcFeathers({
  startAngle,
  endAngle,
  continuesBefore,
  continuesAfter
}: ClampedArcAngles): ArcFeathers {
  const arcSpan = endAngle - startAngle;
  if (arcSpan <= 0) return {};

  const depth = Math.min(FEATHER_DEGREES, arcSpan * FEATHER_MAX_SPAN_RATIO);

  return {
    start: continuesBefore ? { fromAngle: startAngle, toAngle: startAngle + depth } : undefined,
    end: continuesAfter ? { fromAngle: endAngle, toAngle: endAngle - depth } : undefined
  };
}
