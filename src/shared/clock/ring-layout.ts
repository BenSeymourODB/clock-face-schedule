/**
 * Stacking order and depth for overlapping event arcs.
 * Extracted from next-digital-wall-calendar's `analog-clock.tsx`, where it was a
 * module-private function and only covered indirectly through component tests.
 */

/** The fields ring assignment reads. Structural, so the caller chooses which angles to pass. */
export interface RingCandidate {
  id: string;
  startAngle: number;
  endAngle: number;
}

export interface RingAssignment {
  /** 0 is the outermost ring. */
  ringIndex: number;
  /**
   * Rings needed by this event's overlap cluster — the divisor for its share of the band.
   *
   * Per cluster, not per dial. An event that clashes with nothing keeps the whole band even when
   * a crowded stretch elsewhere in the period needs three rings. A single dial-wide depth meant
   * one busy morning thinned every arc on the dial, including arcs hours away with the band to
   * themselves — and cost them their emoji and titles for it.
   */
  clusterDepth: number;
}

/**
 * Assign each event a ring and the depth of the cluster it belongs to.
 *
 * Events are walked in start-angle order and placed on the outermost ring whose previous occupant
 * has already ended; when every ring is still busy a new inner ring is opened. This is interval
 * partitioning, and first-fit in start order is optimal for it: the ring count within a cluster
 * always equals the maximum number of mutually overlapping events, so it never opens a ring it
 * did not need. Keeping earlier events further out is also the reading order a viewer expects.
 *
 * `windowStartAngle` rebases every angle onto how far past it they fall, in `[0, 360)`, before
 * sorting. **Required in practice rather than a backstop**: the default of 0 is a no-op only for
 * angles already inside `[0, 360)`, and today's only caller is mostly not such a caller — it passes
 * the window's own start angle explicitly, because a rolling window (#25) reaches past 360°, and on
 * the 1-hour scale so does every minute of the hour but five (swept: only 10:05–10:09 keep both
 * edges in range). Rebased onto 0, the modulo turns 380° into 20°, which sorts before an event at
 * 30°; interval partitioning walked in the wrong order puts two overlapping events on one ring, the
 * later drawn at identical radii and hidden entirely beneath the earlier. The default stays because
 * it is the identity on an in-range window rather than because anything wants it: making the
 * parameter required would be a correct change and a churn of every call site and spec for a
 * hazard the one caller already avoids.
 *
 * Assumes `windowStartAngle` does not fall strictly inside any single candidate's own span; a
 * candidate already straddling the rebase origin sorts incorrectly regardless, and taking the
 * angle from the window's own edge rather than from a point nothing spans avoids that.
 *
 * Optimal in ring *count* says nothing about ring *thickness*. Callers divide a fixed band by
 * `clusterDepth`, so a deep cluster still yields rings too thin to carry an emoji or a title;
 * capping that is the caller's problem, not this function's.
 */
export function assignRings(
  events: RingCandidate[],
  windowStartAngle = 0
): Map<string, RingAssignment> {
  const relativeAngle = (angle: number): number => {
    const wrapped = (angle - windowStartAngle) % 360;
    return wrapped < 0 ? wrapped + 360 : wrapped;
  };

  const rebased = events.map((event) => {
    const startAngle = relativeAngle(event.startAngle);
    let endAngle = relativeAngle(event.endAngle);
    // An event's own end must not appear to precede its start once each is independently
    // rebased into [0, 360) — it can only mean the event's span crosses the window's own start.
    if (endAngle <= startAngle) endAngle += 360;
    return { id: event.id, startAngle, endAngle };
  });

  const sorted = [...rebased].sort((a, b) => a.startAngle - b.startAngle);

  /** End angle of the last event placed on each ring of the cluster currently being built. */
  const ringEnds: number[] = [];
  const placements: { id: string; ringIndex: number; cluster: number }[] = [];
  const clusterDepths: number[] = [];
  let cluster = 0;

  for (const event of sorted) {
    // Nothing still open means this event clashes with nothing before it, so a new cluster
    // begins. Clearing the rings does not change any ring index — first-fit would pick ring 0
    // regardless — but it is what makes the depth below a per-cluster figure.
    const clashesWithOpenEvent = ringEnds.some((end) => event.startAngle < end);
    if (!clashesWithOpenEvent && ringEnds.length > 0) {
      cluster += 1;
      ringEnds.length = 0;
    }

    let ringIndex = ringEnds.findIndex((end) => event.startAngle >= end);
    if (ringIndex === -1) {
      ringIndex = ringEnds.length;
      ringEnds.push(event.endAngle);
    } else {
      ringEnds[ringIndex] = event.endAngle;
    }

    placements.push({ id: event.id, ringIndex, cluster });
    clusterDepths[cluster] = Math.max(clusterDepths[cluster] ?? 0, ringIndex + 1);
  }

  return new Map(
    placements.map(({ id, ringIndex, cluster: index }) => [
      id,
      { ringIndex, clusterDepth: clusterDepths[index] },
    ])
  );
}
