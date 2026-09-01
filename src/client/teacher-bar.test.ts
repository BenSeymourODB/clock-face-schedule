/**
 * The teacher's controls, and the two properties that make the scale switch legitimate at all.
 *
 * ADR 0008 permits a live control that changes what the arcs already on screen *mean* only because
 * the switch is persistent and shows its own position — so "which position is it showing" is not a
 * cosmetic detail here, it is the whole defence. Both halves are asserted: the switch reports the
 * scale it was opened on, and it reports the new one before the dial has caught up.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import styles from "../../static/Styles.html?raw";
import type { DialScaleId } from "../shared/clock";
import { SCALE_SWAP_MS, teacherBar, withScaleParam } from "./teacher-bar";

function build(scale: DialScaleId = "12h") {
  const onScaleChange = vi.fn();
  const bar = teacherBar({ scale, onScaleChange });
  // Appended, because a radio group's one-checked invariant is enforced across a document tree and
  // an orphaned pair would let both inputs be checked at once.
  document.body.append(bar.element);

  const group = bar.element.querySelector(".scale-switch");
  if (!(group instanceof HTMLElement)) throw new Error("no scale switch in the bar");

  const inputs = [...group.querySelectorAll("input")];
  return { bar, group, inputs, onScaleChange };
}

function press(input: HTMLInputElement): void {
  input.checked = true;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("the scale switch", () => {
  // Radio names are scoped to the document, not to the element: a bar left over from the previous
  // case would join this one's group and hold a checked input that no assertion here built.
  beforeEach(() => {
    document.body.textContent = "";
  });

  it("offers both scales and lights the one the dial opened on", () => {
    const { group, inputs } = build("1h");

    expect(inputs.map((input) => input.value)).toEqual(["12h", "1h"]);
    expect(inputs.filter((input) => input.checked).map((input) => input.value)).toEqual(["1h"]);
    // What the stylesheet slides the thumb off, and therefore what a viewer across the room reads.
    expect(group.dataset["scale"]).toBe("1h");
  });

  it("names both states in words rather than showing one as the absence of the other", () => {
    // The switch is a two-segment control precisely because "12 hours" turned off does not say
    // "1 hour". An on/off switch here would leave the unlit state unnamed.
    const { group } = build();
    const labels = [...group.querySelectorAll(".scale-option-text")].map((node) => node.textContent);

    expect(labels).toEqual(["12 hours", "1 hour"]);
  });

  it("moves its own position before the caller has drawn anything", () => {
    const { group, inputs, onScaleChange } = build("12h");

    press(inputs[1]);

    // The order is the point: the dial's redraw is deferred behind a fade, and the switch must not
    // wait for it. Someone standing at a board with a class waiting has to see the press land.
    expect(group.dataset["scale"]).toBe("1h");
    expect(onScaleChange).toHaveBeenCalledExactlyOnceWith("1h");
  });

  it("stays quiet for the input being cleared, so one press is one change", () => {
    const { inputs, onScaleChange } = build("12h");

    press(inputs[1]);
    // Native radios clear the other member without firing `change` on it; this fires one anyway, to
    // hold the guard that would otherwise let a caller be handed the scale it is already drawing.
    inputs[0].dispatchEvent(new Event("change", { bubbles: true }));

    expect(onScaleChange).toHaveBeenCalledExactlyOnceWith("1h");
  });

  it("is one native radio group, so arrow keys and roving focus come free", () => {
    const { inputs } = build();

    expect(inputs.map((input) => input.type)).toEqual(["radio", "radio"]);
    expect(new Set(inputs.map((input) => input.name)).size).toBe(1);
  });

  it("announces itself as a group rather than as two unrelated presses", () => {
    const { bar, group } = build();

    expect(group.getAttribute("role")).toBe("radiogroup");
    expect(group.getAttribute("aria-label")).toBe("Dial scale");
    expect(bar.element.getAttribute("aria-label")).toBe("Display controls");
  });

  /**
   * The one number that lives in two files. `main.ts` waits `SCALE_SWAP_MS` before redrawing the
   * dial and the stylesheet fades it over `--scale-fade`; a drift between them redraws the dial
   * mid-fade, which reads as a flicker rather than as a mistake and would pass every other test
   * here.
   */
  it("waits exactly as long as the stylesheet fades for", () => {
    const declared = /--scale-fade:\s*(\d+)ms/.exec(styles);

    expect(declared, "Styles.html declares --scale-fade in milliseconds").not.toBeNull();
    expect(Number(declared?.[1])).toBe(SCALE_SWAP_MS);
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
  it("leaves every other parameter exactly as it was authored", () => {
    expect(withScaleParam("?now=2026-08-18T04:15&freeze=1", "12h")).toBe(
      "?now=2026-08-18T04:15&freeze=1&scale=12h"
    );
  });
});
