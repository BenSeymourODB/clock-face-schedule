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

/**
 * A `save` whose writes finish when the test says so, which is the only way to hold two of them in
 * the air at once — the condition #84 is about.
 *
 * `settle`/`fail` complete the *oldest* unfinished write, so a test can land two out of the order
 * they were sent. `flush` waits out the promise plumbing: the store chains off `save`'s return
 * value, so the follow-up write is queued a microtask after the one before it resolves.
 */
/**
 * Waits out the store's own promise plumbing — two turns, because a queued write is sent from a
 * `then` on the promise the write before it returned.
 */
const flush = (): Promise<void> => Promise.resolve().then(() => Promise.resolve());

function controllableSave(): {
  sent: string[];
  save: (wire: string) => Promise<unknown>;
  settle: () => Promise<void>;
  fail: () => Promise<void>;
  pending: () => number;
} {
  const sent: string[] = [];
  const waiting: { resolve: () => void; reject: (error: Error) => void }[] = [];

  return {
    sent,
    save: (wire) => {
      sent.push(wire);
      return new Promise((resolve, reject) => {
        waiting.push({ resolve: () => resolve(undefined), reject });
      });
    },
    settle: () => {
      waiting.shift()?.resolve();
      return flush();
    },
    fail: () => {
      waiting.shift()?.reject(new Error("write rejected"));
      return flush();
    },
    pending: () => waiting.length
  };
}

describe("the store", () => {
  let saved: string[];

  beforeEach(() => {
    saved = [];
  });

  /**
   * Reports the write as over the moment it is made, which is the only honest thing a synchronous
   * stub can say. That makes the tests below read as they did before the queue existed: nothing is
   * ever in flight, so nothing is ever held back.
   */
  const save = (wire: string): Promise<unknown> => {
    saved.push(wire);
    return Promise.resolve();
  };

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

  it("keeps earlier changes while sending only the latest", async () => {
    const store = preferenceStore({ wire: "", save });

    store.set({ timerMuted: true });
    store.set({ timerDurationSeconds: 600 });

    // Memory is current at once; the second write waits for the first, which is #84's fix and the
    // only reason this needs awaiting at all.
    expect(store.get()).toEqual({
      showSeconds: true,
      timerMuted: true,
      timerDurationSeconds: 600
    });

    await flush();
    expect(saved).toEqual(["timerMuted=1", "timerDurationSeconds=600"]);
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
    const spy = vi.fn(() => Promise.resolve());
    const store = preferenceStore({ wire: "", save: spy });

    store.set({});

    expect(spy).not.toHaveBeenCalled();
  });
});

/**
 * #84. Two `google.script.run` calls are independent executions with no ordering between them, so a
 * control fired twice inside one round trip could land its writes in either order and leave the
 * store holding the earlier value — a reload then silently reverting what the viewer last set. The
 * store's answer is that there is only ever one writer.
 *
 * Every assertion here is on the *sequence of writes*, not on their timing: what was sent, when it
 * was allowed to be sent, and what a write's failure costs. Timing is the mechanism, and pinning it
 * would pin the plumbing rather than the property.
 */
describe("the store, with a write still in flight", () => {
  it("holds a second write until the first is over, so the two cannot race", async () => {
    const { sent, save, settle } = controllableSave();
    const store = preferenceStore({ wire: "", save });

    store.set({ timerDurationSeconds: 600 });
    store.set({ timerDurationSeconds: 900 });

    // The defect, as a sequence: on `main` both are with the server at this point, and whichever
    // Apps Script finishes second is what a reload reads back.
    expect(sent).toEqual(["timerDurationSeconds=600"]);

    await settle();
    expect(sent).toEqual(["timerDurationSeconds=600", "timerDurationSeconds=900"]);
  });

  it("leaves the store holding the last value set, whatever order the writes finished in", async () => {
    const { sent, save, settle } = controllableSave();
    const store = preferenceStore({ wire: "", save });

    store.set({ timerDurationSeconds: 600 });
    store.set({ timerDurationSeconds: 900 });
    await settle();
    await settle();

    // The last thing written is the last thing set — the whole point, stated as the outcome rather
    // than as the mechanism. `sent` is the order the *server* saw, which is now the only order.
    expect(sent[sent.length - 1]).toBe("timerDurationSeconds=900");
    expect(store.get().timerDurationSeconds).toBe(900);
  });

  it("costs two writes for a burst of any length, since a superseded value is dropped", async () => {
    const { sent, save, settle } = controllableSave();
    const store = preferenceStore({ wire: "", save });

    // A spinner held down: one write goes, the rest collapse into the one that follows it. That
    // bounds the burst at two writes however long it is, which is what makes a trailing debounce
    // (#84's other option) worth exactly one write per burst rather than a proportion of it — the
    // reason it is left to #47, where the control that produces the burst lives.
    for (const seconds of [60, 120, 300, 600, 1200]) store.set({ timerDurationSeconds: seconds });

    expect(sent).toEqual(["timerDurationSeconds=60"]);

    await settle();
    await settle();
    expect(sent).toEqual(["timerDurationSeconds=60", "timerDurationSeconds=1200"]);
  });

  it("merges different keys rather than superseding them", async () => {
    const { sent, save, settle } = controllableSave();
    const store = preferenceStore({ wire: "", save });

    store.set({ showSeconds: false });
    store.set({ timerMuted: true });
    store.set({ timerDurationSeconds: 600 });
    await settle();

    // One follow-up carrying both held keys, in registry order — not one per key, and not the
    // earlier key dropped. Sending only the keys that changed is what keeps a second tab's values
    // out of this write, which `decodePreferencePatch` exists for.
    expect(sent).toEqual(["showSeconds=0", "timerMuted=1;timerDurationSeconds=600"]);
  });

  it("sends a queued write after a failed one, so one loss is not every loss", async () => {
    const { sent, save, fail } = controllableSave();
    const store = preferenceStore({ wire: "", save });

    store.set({ showSeconds: false });
    store.set({ timerMuted: true });
    await fail();

    expect(sent).toEqual(["showSeconds=0", "timerMuted=1"]);
  });

  it("does not retry the failed write's own value", async () => {
    const { sent, save, fail, settle, pending } = controllableSave();
    const store = preferenceStore({ wire: "", save });

    store.set({ showSeconds: false });
    await fail();
    await settle();

    // A write the server refused — quota, or a value it would refuse again — is not resent. The
    // store's stated bargain is that a lost save costs the next reload's memory of a setting, and a
    // retry loop on a display left up for weeks costs more than that.
    expect(sent).toEqual(["showSeconds=0"]);
    expect(pending()).toBe(0);
  });

  it("keeps writing after a save that throws instead of rejecting", async () => {
    const sent: string[] = [];
    let thrown = false;
    const store = preferenceStore({
      wire: "",
      save: (wire) => {
        sent.push(wire);
        if (!thrown) {
          thrown = true;
          throw new Error("bridge missing");
        }
        return Promise.resolve();
      }
    });

    store.set({ showSeconds: false });
    store.set({ timerMuted: true });
    await flush();

    // `callServer` rejects rather than throws, but a `save` is a caller-supplied function and a
    // synchronous throw wedging the queue would cost every later preference rather than this one.
    expect(sent).toEqual(["showSeconds=0", "timerMuted=1"]);
  });

  it("shows the newest value on screen while an older one is still being written", async () => {
    const { save, settle } = controllableSave();
    const store = preferenceStore({ wire: "", save });

    store.set({ timerDurationSeconds: 600 });
    store.set({ timerDurationSeconds: 900 });

    // Queueing the write must not queue the change: the control the viewer just used has to agree
    // with the display immediately, which is what the store applies changes locally for.
    expect(store.get().timerDurationSeconds).toBe(900);

    await settle();
    expect(store.get().timerDurationSeconds).toBe(900);
  });
});
