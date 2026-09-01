/**
 * The fade between the two dials, and the record a press leaves in the URL.
 *
 * Most of this file is one defect's worth of assertions. The first version of the swap lived inside
 * `main.ts`, where nothing can be given a spec, and it could leave `data-swapping` set with no
 * timer left to clear it — a dial at `opacity: 0`, permanently, looking exactly like a load that
 * never finished. It was found by driving the preview, not by the suite. Every path out of a press
 * is asserted here because that is the property that was wrong.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import styles from "../../static/Styles.html?raw";
import type { DialScaleId } from "../shared/clock";
import { SCALE_SWAP_MS, SWAPPING_ATTRIBUTE, scaleSwapper, withScaleParam } from "./scale-swap";

describe("scaleSwapper", () => {
  let dial: HTMLElement;
  let drawn: DialScaleId[];
  let reduced: boolean;

  const build = (redraw?: (scale: DialScaleId) => void) =>
    scaleSwapper({
      dial,
      redraw: redraw ?? ((scale) => drawn.push(scale)),
      reducedMotion: () => reduced
    });

  const fading = () => dial.hasAttribute(SWAPPING_ATTRIBUTE);

  beforeEach(() => {
    vi.useFakeTimers();
    dial = document.createElement("div");
    drawn = [];
    reduced = false;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("holds the dial out for the fade, then redraws it and lets it back in", () => {
    const swap = build();

    swap("1h");
    expect(fading()).toBe(true);
    expect(drawn).toEqual([]);

    vi.advanceTimersByTime(SCALE_SWAP_MS);

    expect(drawn).toEqual(["1h"]);
    expect(fading()).toBe(false);
  });

  it("redraws once, at the last press, when two land inside one fade", () => {
    const swap = build();

    swap("1h");
    vi.advanceTimersByTime(SCALE_SWAP_MS / 2);
    swap("12h");
    vi.advanceTimersByTime(SCALE_SWAP_MS);

    // Not `["1h", "12h"]`: the first press was superseded before its fade ended, and drawing a scale
    // the switch has already moved off is a frame of the wrong dial.
    expect(drawn).toEqual(["12h"]);
    expect(fading()).toBe(false);
  });

  describe("less motion asked for", () => {
    beforeEach(() => {
      reduced = true;
    });

    it("redraws at the press, with nothing to wait for", () => {
      build()("1h");

      expect(drawn).toEqual(["1h"]);
      expect(fading()).toBe(false);
    });

    /**
     * The defect, and the reason `reducedMotion` is read per press rather than captured once.
     *
     * A board whose setting changes mid-fade — a viewer turning it on, an OS theme switch — takes
     * the fade path on the first press and this one on the second. The second cancels the first's
     * timer, which was the only thing that would ever have cleared the attribute. Before the fix
     * the dial stayed at `opacity: 0` for the rest of the session.
     */
    it("clears a fade an earlier press left running", () => {
      const swap = build();

      reduced = false;
      swap("1h");
      expect(fading()).toBe(true);

      reduced = true;
      swap("12h");

      expect(fading()).toBe(false);
      expect(drawn).toEqual(["12h"]);
      // And nothing is left armed to undo it.
      vi.advanceTimersByTime(SCALE_SWAP_MS * 2);
      expect(fading()).toBe(false);
      expect(drawn).toEqual(["12h"]);
    });
  });

  it("lets the dial back in even when the redraw throws", () => {
    const swap = build(() => {
      throw new Error("renderer blew up");
    });

    swap("1h");
    expect(() => vi.advanceTimersByTime(SCALE_SWAP_MS)).toThrow("renderer blew up");

    // A dial showing the *old* scale is wrong. A blank one is worse, and gives a viewer nothing to
    // report but "the board stopped working".
    expect(fading()).toBe(false);
  });

  it("redraws immediately when there is no element to fade", () => {
    // A jsdom fixture, or a host that mounted something other than an element. The scale still has
    // to change; only the fade is unavailable.
    const swap = scaleSwapper({
      dial: null,
      redraw: (scale) => drawn.push(scale),
      reducedMotion: () => false
    });

    swap("1h");

    expect(drawn).toEqual(["1h"]);
  });

  /**
   * The one number that lives in two files. The stylesheet fades over `--scale-fade` and the swap
   * waits `SCALE_SWAP_MS` before redrawing; a drift between them redraws the dial mid-fade, which
   * reads as a flicker rather than as a mistake and would pass every other test here.
   */
  it("waits exactly as long as the stylesheet fades for", () => {
    const declared = /--scale-fade:\s*(\d+)ms/.exec(styles);

    expect(declared, "Styles.html declares --scale-fade in milliseconds").not.toBeNull();
    expect(Number(declared?.[1])).toBe(SCALE_SWAP_MS);
  });

  it("names the attribute the stylesheet actually fades on", () => {
    // Two spellings of one hook: the client sets it, `#dial[data-swapping]` takes the dial to zero.
    // A rename on either side is a fade that never happens, with nothing else to show for it.
    expect(styles).toContain(`#dial[${SWAPPING_ATTRIBUTE}]`);
  });
});

/**
 * The record a press leaves in the URL. The scale has been selectable by `?scale=` since #34 and
 * stays so, so the switch's job here is to keep that parameter telling the truth rather than to
 * introduce a second control.
 */
describe("withScaleParam", () => {
  it.each([
    ["", "?scale=1h"],
    ["?", "?scale=1h"],
    ["?demo=1", "?demo=1&scale=1h"],
    ["?scale=12h", "?scale=1h"],
    ["?now=04:15&scale=12h&freeze=1", "?now=04:15&freeze=1&scale=1h"],
    // A repeat would leave the URL saying two things; `URLSearchParams.get` reads only the first.
    ["?scale=12h&scale=1h", "?scale=1h"],
    // Valueless, which is what `?scale` on its own parses as — replaced rather than kept beside.
    ["?scale", "?scale=1h"],
    // Not the parameter, however much it looks like it.
    ["?scaled=1", "?scaled=1&scale=1h"],
  ])("%s → %s", (search, expected) => {
    expect(withScaleParam(search, "1h")).toBe(expected);
  });

  /**
   * The defect this function exists for, found by pressing the switch on a pinned preview rather
   * than by reading the code: `URLSearchParams` re-encodes the whole query string, so an unrelated
   * `?now=04:15` came back as `?now=04%3A15`. It still parses; it is no longer the string README
   * prints or a person types.
   */
  it("leaves every other parameter's text exactly as it was authored", () => {
    expect(withScaleParam("?now=2026-08-18T04:15&freeze=1", "12h")).toBe(
      "?now=2026-08-18T04:15&freeze=1&scale=12h"
    );
  });
});
