/**
 * The teacher's controls, and the two properties that make the scale switch legitimate at all.
 *
 * ADR 0008 permits a live control that changes what the arcs already on screen *mean* only because
 * the switch is persistent and shows its own position — so "which position is it showing" is not a
 * cosmetic detail here, it is the whole defence. Both halves are asserted: the switch reports the
 * scale it was opened on, and it reports the new one before the dial has caught up.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DialScaleId } from "../shared/clock";
import { teacherBar } from "./teacher-bar";

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
    // Not a `<nav>`: the bar navigates nowhere, and a landmark saying otherwise is worse
    // than none. Not `toolbar` either, until #47 gives it a second control to move between.
    expect(bar.element.getAttribute("role")).toBe("group");
    expect(bar.element.tagName).toBe("DIV");
  });
});
