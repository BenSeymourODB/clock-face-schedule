/**
 * A faint ring at the outer rim of the arc band, present across the rolling window (#25) and
 * absent across its 30° gap — so an empty stretch of the window ("nothing scheduled here") reads
 * differently from the gap ("this isn't part of what's shown").
 *
 * Drawn first, beneath the event arcs: wherever an event's own arc reaches the outer rim it paints
 * over this hairline with no visible change, and wherever the band is otherwise empty within the
 * window, the track alone is what shows. The gap itself needs no separate path — the track simply
 * stops at the window's own edges, and the absence of a path *is* the gap.
 */
import { describeArc } from "../../shared/clock";
import { svg } from "../svg";

/** Track thickness, as a fraction of the outer radius. A hairline, not a band. */
const TRACK_THICKNESS_RATIO = 0.008;

const TRACK_OPACITY = 0.5;

export interface WindowTrackParams {
  cx: number;
  cy: number;
  outerRadius: number;
  windowStartAngle: number;
  windowEndAngle: number;
}

export function windowTrack({
  cx,
  cy,
  outerRadius,
  windowStartAngle,
  windowEndAngle,
}: WindowTrackParams): SVGPathElement {
  const thickness = outerRadius * TRACK_THICKNESS_RATIO;

  return svg("path", {
    "data-testid": "window-track",
    d: describeArc(cx, cy, outerRadius, outerRadius - thickness, windowStartAngle, windowEndAngle),
    fill: "var(--border)",
    "fill-opacity": TRACK_OPACITY,
    stroke: "none",
  });
}
