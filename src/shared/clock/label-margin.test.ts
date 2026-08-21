import { describe, expect, it } from 'vitest';
import { PANEL_RESERVE_UNITS, labelMarginUnits } from './label-margin';

const SIZE = 600;
/** `--label-frame: 7.3vmin`, as a fraction of the shorter viewport axis. */
const FRAME = 0.073;

/**
 * The box `#dial` resolves to on a board of `width × height`: the grid column left after
 * `#display`'s padding, with `#status` hidden — which is what a working board shows.
 */
function boardBox(width: number, height: number): { width: number; height: number } {
  const pad = FRAME * Math.min(width, height);
  return { width: width - 2 * pad, height: height - 2 * pad };
}

describe('labelMarginUnits', () => {
  /**
   * The figures ADR 0009's #115 amendment implies, and the ones
   * `docs/brainstorms/2026-08-21-label-placement-fork.md` derives the other way round — from the
   * aspect ratio and the dial's 85.4% share of the height. Two independent derivations meeting to a
   * tenth of a unit is the check; either alone is an assertion about its own arithmetic.
   */
  it.each([
    ['16:9 at 1920×1080', 1920, 1080, 234.5],
    ['16:10 at 1920×1200', 1920, 1200, 172.1],
    ['16:9 at 1366×768', 1366, 768, 234.8]
  ])('grants %s its measured margin per side', (_label, width, height, expected) => {
    expect(labelMarginUnits(boardBox(width, height), width, SIZE)).toBeCloseTo(expected, 1);
  });

  it('leaves 90 units of room unclaimed, so nothing clips before the panel is built', () => {
    const [width, height] = [1920, 1080];
    const box = boardBox(width, height);
    const drawn = Math.min(box.width, box.height);
    // Today the dial is centred in the whole width, so this is the room a card actually has.
    const roomPerSide = ((width * SIZE) / drawn - SIZE) / 2;

    expect(roomPerSide - (labelMarginUnits(box, width, SIZE) ?? 0)).toBeCloseTo(
      PANEL_RESERVE_UNITS / 2,
      6
    );
  });

  /**
   * The other half of the same property, and the one that says the reserve was not merely
   * subtracted from a number nobody checked: once the panel is a column, the room per side *is*
   * what was granted, so no card has to narrow when it lands.
   */
  it('grants exactly the room the finished layout leaves beside the panel', () => {
    const [width, height] = [1920, 1080];
    const box = boardBox(width, height);
    const drawn = Math.min(box.width, box.height);
    const finished = ((width * SIZE) / drawn - SIZE - PANEL_RESERVE_UNITS) / 2;

    expect(labelMarginUnits(box, width, SIZE)).toBeCloseTo(finished, 6);
  });

  it.each([
    ['portrait', 1080, 1920],
    ['square', 1024, 1024]
  ])('grants a %s board nothing rather than a negative margin', (_label, width, height) => {
    expect(labelMarginUnits(boardBox(width, height), width, SIZE)).toBe(0);
  });

  it("scales with the drawing, so the units are the dial's own and not the device's", () => {
    // Same board, same aspect, half the pixels: the margin is a count of viewBox units and cannot
    // depend on the device's resolution.
    const big = labelMarginUnits(boardBox(1920, 1080), 1920, SIZE);
    const small = labelMarginUnits(boardBox(960, 540), 960, SIZE);

    expect(small).toBeCloseTo(big ?? 0, 6);
  });

  /**
   * Why the host watches the *box* and not the window. The status line takes height from the dial
   * without the viewport changing at all, and a smaller dial means the same board is more viewBox
   * units wide — so the margin moves when nothing about the display did. Measured on the preview:
   * 922.3 px of dial grants 234.5 units, 807.9 px with a notice showing grants 323.0.
   */
  it('grants more units to a dial the page has made smaller', () => {
    const full = boardBox(1920, 1080);
    const notice = { width: full.width, height: full.height - 150 };

    expect(labelMarginUnits(notice, 1920, SIZE)).toBeGreaterThan(
      labelMarginUnits(full, 1920, SIZE) ?? 0
    );
  });

  it('measures the viewport rather than the box it is handed', () => {
    // A box narrower than the viewport is the shipped layout — the drawing sits in a grid column
    // inside the page's frame — so a reading taken off the box alone under-reports the board.
    const box = boardBox(1920, 1080);
    expect(labelMarginUnits(box, box.width, SIZE)).toBeLessThan(
      labelMarginUnits(box, 1920, SIZE) ?? 0
    );
  });

  it.each([
    ['an unlaid-out box', { width: 0, height: 0 }, 1920, SIZE],
    ['a zero-height box', { width: 800, height: 0 }, 1920, SIZE],
    ['no viewport', boardBox(1920, 1080), 0, SIZE],
    ['no viewBox', boardBox(1920, 1080), 1920, 0]
  ])('returns null for %s, leaving the renderer on its inherited allowance', (
    _label,
    box,
    viewportWidth,
    size
  ) => {
    expect(labelMarginUnits(box, viewportWidth, size)).toBeNull();
  });
});
