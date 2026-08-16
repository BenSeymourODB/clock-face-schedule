/**
 * Stacking order for overlapping event arcs.
 * Extracted from next-digital-wall-calendar's `analog-clock.tsx`, where it was a
 * module-private function and only covered indirectly through component tests.
 */
import type { ClockEvent } from './types';

/**
 * Assign each event a ring index, where 0 is the outermost ring. Events are walked in
 * start-angle order and placed on the outermost ring whose previous occupant has already
 * ended; when every ring is still busy a new inner ring is opened.
 *
 * This is interval partitioning, and first-fit in start order is optimal for it: the ring
 * count always equals the maximum number of mutually overlapping events, so it never opens
 * a ring it did not need. Keeping earlier events further out is also the reading order a
 * viewer expects.
 *
 * Optimal in ring *count* says nothing about ring *thickness*. Callers split a fixed band
 * between however many rings this returns, so a deep overlap yields rings too thin to carry
 * an emoji or a title. Capping that is the caller's problem, not this function's.
 */
export function assignRingIndices(events: ClockEvent[]): Map<string, number> {
  const ringMap = new Map<string, number>();
  const sorted = [...events].sort((a, b) => a.startAngle - b.startAngle);

  /** End angle of the last event placed on each ring. */
  const ringEnds: number[] = [];

  for (const event of sorted) {
    let assigned = false;
    for (let ring = 0; ring < ringEnds.length; ring++) {
      if (event.startAngle >= ringEnds[ring]) {
        ringMap.set(event.id, ring);
        ringEnds[ring] = event.endAngle;
        assigned = true;
        break;
      }
    }
    if (!assigned) {
      ringMap.set(event.id, ringEnds.length);
      ringEnds.push(event.endAngle);
    }
  }

  return ringMap;
}
