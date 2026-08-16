import { describe, expect, it } from 'vitest';
import { assignRingIndices } from './ring-layout';
import type { ClockEvent } from './types';

function arc(id: string, startAngle: number, endAngle: number): ClockEvent {
  return {
    id,
    title: id,
    cleanTitle: id,
    startAngle,
    endAngle,
    color: '#3B82F6',
    isAllDay: false
  };
}

describe('assignRingIndices', () => {
  it('returns an empty map for no events', () => {
    expect(assignRingIndices([]).size).toBe(0);
  });

  it('keeps non-overlapping events on the outer ring', () => {
    const rings = assignRingIndices([arc('a', 0, 30), arc('b', 30, 60), arc('c', 90, 120)]);
    expect([...rings.values()]).toEqual([0, 0, 0]);
  });

  it('pushes an overlapping event to the next ring in', () => {
    const rings = assignRingIndices([arc('a', 0, 60), arc('b', 30, 90)]);
    expect(rings.get('a')).toBe(0);
    expect(rings.get('b')).toBe(1);
  });

  it('opens a new ring per simultaneous event', () => {
    const rings = assignRingIndices([arc('a', 0, 90), arc('b', 10, 90), arc('c', 20, 90)]);
    expect(rings.get('a')).toBe(0);
    expect(rings.get('b')).toBe(1);
    expect(rings.get('c')).toBe(2);
  });

  it('reuses the outermost ring that has already freed up', () => {
    // `c` starts after `a` ends, so it belongs back on ring 0 rather than on a third ring.
    const rings = assignRingIndices([arc('a', 0, 30), arc('b', 10, 90), arc('c', 40, 70)]);
    expect(rings.get('a')).toBe(0);
    expect(rings.get('b')).toBe(1);
    expect(rings.get('c')).toBe(0);
  });

  it('treats an event starting exactly where another ends as non-overlapping', () => {
    const rings = assignRingIndices([arc('a', 0, 45), arc('b', 45, 90)]);
    expect(rings.get('b')).toBe(0);
  });

  it('assigns by start angle regardless of input order', () => {
    const forwards = assignRingIndices([arc('a', 0, 60), arc('b', 30, 90)]);
    const backwards = assignRingIndices([arc('b', 30, 90), arc('a', 0, 60)]);
    expect(backwards.get('a')).toBe(forwards.get('a'));
    expect(backwards.get('b')).toBe(forwards.get('b'));
  });

  it('does not mutate the input array', () => {
    const events = [arc('b', 30, 90), arc('a', 0, 60)];
    assignRingIndices(events);
    expect(events.map((e) => e.id)).toEqual(['b', 'a']);
  });

  it('assigns a ring to every event', () => {
    const events = [arc('a', 0, 90), arc('b', 10, 90), arc('c', 20, 30), arc('d', 200, 260)];
    expect(assignRingIndices(events).size).toBe(events.length);
  });
});
