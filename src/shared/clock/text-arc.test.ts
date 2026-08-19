import { describe, expect, it } from 'vitest';
import { polarToCartesian } from './clock-utils';
import { describeTextArc } from './text-arc';

const CX = 300;
const CY = 300;
const R = 280;

/** Parse `M x y A r r 0 <largeArc> <sweep> x2 y2`. */
function parse(path: string) {
  const m = path.match(/^M (\S+) (\S+) A \S+ \S+ 0 (\d) (\d) (\S+) (\S+)$/);
  if (!m) throw new Error(`unparseable text-arc path: ${path}`);
  return {
    start: { x: Number(m[1]), y: Number(m[2]) },
    largeArcFlag: m[3],
    sweepFlag: m[4],
    end: { x: Number(m[5]), y: Number(m[6]) }
  };
}

describe('describeTextArc', () => {
  it('runs start → end clockwise on the top half', () => {
    const result = parse(describeTextArc(CX, CY, R, 300, 350));
    expect(result.sweepFlag).toBe('1');
    expect(result.start).toEqual(polarToCartesian(CX, CY, R, 300));
    expect(result.end).toEqual(polarToCartesian(CX, CY, R, 350));
  });

  it('reverses to end → start counter-clockwise on the bottom half', () => {
    // Without this, glyphs below the horizontal would render upside down.
    const result = parse(describeTextArc(CX, CY, R, 150, 210));
    expect(result.sweepFlag).toBe('0');
    expect(result.start).toEqual(polarToCartesian(CX, CY, R, 210));
    expect(result.end).toEqual(polarToCartesian(CX, CY, R, 150));
  });

  it.each([
    [0, 60, '1'],
    [80, 100, '1'],
    [91, 120, '0'],
    [180, 200, '0'],
    [260, 278, '0'],
    [280, 300, '1']
  ])('gives the %i°–%i° arc a sweep flag of %s', (start, end, sweep) => {
    expect(parse(describeTextArc(CX, CY, R, start, end)).sweepFlag).toBe(sweep);
  });

  it.each([
    [0, 90, '0'],
    [0, 180, '0'],
    [0, 181, '1'],
    [0, 300, '1']
  ])('gives the %i°–%i° arc a large-arc flag of %s', (start, end, flag) => {
    expect(parse(describeTextArc(CX, CY, R, start, end)).largeArcFlag).toBe(flag);
  });

  /**
   * Angles reach past a revolution all over this pipeline and are deliberately never reduced
   * (#33), so the half-of-the-dial test has to reduce its own copy. Caught by rendering the
   * 1-hour scale (#34), where every arc past the wrap read upside down; the same arithmetic
   * fails on the 12-hour dial for any window whose look-ahead crosses the period end (#25).
   */
  it.each([
    [504, 534, '0'],
    [150, 210, '0'],
    [-210, -150, '0'],
    [660, 710, '1'],
    [300, 350, '1'],
    [-60, -10, '1']
  ])('reads the %i°–%i° arc the same way as its unwrapped twin (%s)', (start, end, sweep) => {
    expect(parse(describeTextArc(CX, CY, R, start, end)).sweepFlag).toBe(sweep);
  });

  it('still draws the path at the angles it was given, wrapped or not', () => {
    // Only the reading direction is normalised. The geometry must stay where the caller put it,
    // or a wrapped arc's text would jump to the other side of the dial.
    const result = parse(describeTextArc(CX, CY, R, 504, 534));
    expect(result.start).toEqual(polarToCartesian(CX, CY, R, 534));
    expect(result.end).toEqual(polarToCartesian(CX, CY, R, 504));
  });

  it('bounds every coordinate to four decimal places', () => {
    const path = describeTextArc(CX, CY, 244, 137, 193);
    for (const token of path.match(/-?\d+(\.\d+)?/g) ?? []) {
      expect(token.split('.')[1]?.length ?? 0).toBeLessThanOrEqual(4);
    }
  });
});
