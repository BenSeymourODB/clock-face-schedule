import { describe, expect, it } from 'vitest';
import { type RingCandidate, assignRings } from './ring-layout';

function arc(id: string, startAngle: number, endAngle: number): RingCandidate {
  return { id, startAngle, endAngle };
}

function ringsOf(events: RingCandidate[]): number[] {
  const assigned = assignRings(events);
  return events.map((event) => assigned.get(event.id)?.ringIndex ?? -1);
}

function depthsOf(events: RingCandidate[]): number[] {
  const assigned = assignRings(events);
  return events.map((event) => assigned.get(event.id)?.clusterDepth ?? -1);
}

describe('assignRings', () => {
  it('returns an empty map for no events', () => {
    expect(assignRings([]).size).toBe(0);
  });

  it('assigns every event', () => {
    const events = [arc('a', 0, 90), arc('b', 10, 90), arc('c', 20, 30), arc('d', 200, 260)];
    expect(assignRings(events).size).toBe(events.length);
  });

  it('does not mutate the input array', () => {
    const events = [arc('b', 30, 90), arc('a', 0, 60)];
    assignRings(events);
    expect(events.map((event) => event.id)).toEqual(['b', 'a']);
  });

  describe('ring order', () => {
    it('keeps non-overlapping events on the outer ring', () => {
      expect(ringsOf([arc('a', 0, 30), arc('b', 30, 60), arc('c', 90, 120)])).toEqual([0, 0, 0]);
    });

    it('pushes an overlapping event to the next ring in', () => {
      expect(ringsOf([arc('a', 0, 60), arc('b', 30, 90)])).toEqual([0, 1]);
    });

    it('opens a new ring per simultaneous event', () => {
      expect(ringsOf([arc('a', 0, 90), arc('b', 10, 90), arc('c', 20, 90)])).toEqual([0, 1, 2]);
    });

    it('reuses the outermost ring that has already freed up', () => {
      // `c` starts after `a` ends, so it belongs back on ring 0 rather than on a third ring.
      expect(ringsOf([arc('a', 0, 30), arc('b', 10, 90), arc('c', 40, 70)])).toEqual([0, 1, 0]);
    });

    it('treats an event starting exactly where another ends as non-overlapping', () => {
      expect(ringsOf([arc('a', 0, 45), arc('b', 45, 90)])).toEqual([0, 0]);
    });

    it('assigns by start angle regardless of input order', () => {
      const forwards = assignRings([arc('a', 0, 60), arc('b', 30, 90)]);
      const backwards = assignRings([arc('b', 30, 90), arc('a', 0, 60)]);

      expect(backwards.get('a')).toEqual(forwards.get('a'));
      expect(backwards.get('b')).toEqual(forwards.get('b'));
    });
  });

  describe('cluster depth', () => {
    it('is 1 when nothing overlaps', () => {
      expect(depthsOf([arc('a', 0, 30), arc('b', 60, 90), arc('c', 120, 150)])).toEqual([1, 1, 1]);
    });

    it('equals the deepest simultaneous overlap within the cluster', () => {
      expect(depthsOf([arc('a', 0, 90), arc('b', 10, 90), arc('c', 20, 90)])).toEqual([3, 3, 3]);
    });

    it('does not charge an isolated event for a crowd elsewhere on the dial', () => {
      // The whole point. A lone lunch arc used to be thinned to a third of the band by a
      // three-deep cluster hours earlier, losing its emoji and title to it.
      const events = [arc('a', 0, 90), arc('b', 10, 90), arc('c', 20, 90), arc('lunch', 200, 260)];

      expect(depthsOf(events)).toEqual([3, 3, 3, 1]);
    });

    it('measures each cluster separately', () => {
      const events = [
        arc('a', 0, 60),
        arc('b', 30, 90), // clashes with a — depth 2
        arc('c', 180, 240),
        arc('d', 200, 260),
        arc('e', 220, 280), // three-deep cluster
      ];

      expect(depthsOf(events)).toEqual([2, 2, 3, 3, 3]);
    });

    it('chains transitively through a cluster', () => {
      // a–b overlap and b–c overlap, but a–c do not. One cluster, and never more than two at once.
      expect(depthsOf([arc('a', 0, 30), arc('b', 20, 50), arc('c', 40, 70)])).toEqual([2, 2, 2]);
    });

    it('starts a new cluster the moment nothing is still open', () => {
      expect(depthsOf([arc('a', 0, 30), arc('b', 10, 40), arc('c', 40, 70)])).toEqual([2, 2, 1]);
    });
  });
});
