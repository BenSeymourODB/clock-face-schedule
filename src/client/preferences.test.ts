import { beforeEach, describe, expect, it, vi } from "vitest";

import { defaultPreferences } from "../shared/preferences";
import { preferenceStore, readPreferenceWire } from "./preferences";

function mountWith(wire: string | null): HTMLElement {
  const mount = document.createElement("div");
  // The real attribute name, not the dataset spelling: `dataset.preferences` would pass just as
  // happily against `data-Preferences`, and Index.html writes the hyphenated form.
  if (wire !== null) mount.setAttribute("data-preferences", wire);
  return mount;
}

describe("reading the templated wire", () => {
  it("takes the value off data-preferences", () => {
    expect(readPreferenceWire(mountWith("showSeconds=0"))).toBe("showSeconds=0");
  });

  it("reads an empty attribute as empty rather than absent", () => {
    // What the local preview has: the builder strips the scriptlet and leaves the attribute behind.
    expect(readPreferenceWire(mountWith(""))).toBe("");
  });

  it("gives null where the attribute is not there at all", () => {
    expect(readPreferenceWire(mountWith(null))).toBeNull();
  });

  it("gives null for no mount", () => {
    expect(readPreferenceWire(null)).toBeNull();
  });

  it("gives null for a non-HTML element, which has no dataset", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "g");

    expect(readPreferenceWire(svg)).toBeNull();
  });
});

describe("the store", () => {
  let saved: string[];

  beforeEach(() => {
    saved = [];
  });

  const save = (wire: string): void => void saved.push(wire);

  it("starts from the templated preferences", () => {
    const store = preferenceStore({ wire: "showSeconds=0", save });

    expect(store.get()).toEqual({ ...defaultPreferences(), showSeconds: false });
  });

  it.each([
    ["an empty wire", ""],
    ["no wire", null],
    ["an unreadable wire", "showSeconds=perhaps"]
  ])("falls back to the defaults given %s", (_case, wire) => {
    expect(preferenceStore({ wire, save }).get()).toEqual(defaultPreferences());
  });

  it("hands out a copy, so a caller cannot edit the store by holding its result", () => {
    const store = preferenceStore({ wire: "", save });

    store.get().showSeconds = false;

    expect(store.get().showSeconds).toBe(true);
  });

  it("applies a change immediately, without waiting for the save", () => {
    const store = preferenceStore({ wire: "", save });

    store.set({ timerMuted: true });

    expect(store.get().timerMuted).toBe(true);
  });

  it("sends only the keys it was given", () => {
    // The two-tab case: sending the whole set would push this tab's stale copy of every other
    // preference over whatever else has changed since the page loaded.
    const store = preferenceStore({ wire: "", save });

    store.set({ timerMuted: true });

    expect(saved).toEqual(["timerMuted=1"]);
  });

  it("keeps earlier changes while sending only the latest", () => {
    const store = preferenceStore({ wire: "", save });

    store.set({ timerMuted: true });
    store.set({ timerDurationSeconds: 600 });

    expect(saved).toEqual(["timerMuted=1", "timerDurationSeconds=600"]);
    expect(store.get()).toEqual({
      showSeconds: true,
      timerMuted: true,
      timerDurationSeconds: 600
    });
  });

  it.each([
    ["past the top of its range", 43201],
    ["below the bottom of its range", 30],
    ["not a whole number", 90.5]
  ])("ignores a duration %s, in memory as well as on the wire", (_case, duration) => {
    const store = preferenceStore({ wire: "", save });

    store.set({ timerDurationSeconds: duration });

    expect(store.get().timerDurationSeconds).toBe(defaultPreferences().timerDurationSeconds);
    expect(saved).toEqual([]);
  });

  it("saves the acceptable half of a mixed patch", () => {
    const store = preferenceStore({ wire: "", save });

    store.set({ timerDurationSeconds: 0, showSeconds: false });

    expect(saved).toEqual(["showSeconds=0"]);
    expect(store.get().timerDurationSeconds).toBe(defaultPreferences().timerDurationSeconds);
  });

  it("does not call the server for an empty patch", () => {
    const spy = vi.fn();
    const store = preferenceStore({ wire: "", save: spy });

    store.set({});

    expect(spy).not.toHaveBeenCalled();
  });
});
