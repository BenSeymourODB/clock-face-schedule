import { beforeEach, describe, expect, it, vi } from "vitest";

import { PREFERENCE_KEYS, defaultPreferences, encodePreferences } from "../shared/preferences";
import {
  preferenceStore,
  readDeploymentPreferenceWire,
  readPreferenceWire
} from "./preferences";

function mountWith(wire: string | null, attribute = "data-preferences"): HTMLElement {
  const mount = document.createElement("div");
  // The real attribute name, not the dataset spelling: `dataset.preferences` would pass just as
  // happily against `data-Preferences`, and Index.html writes the hyphenated form.
  if (wire !== null) mount.setAttribute(attribute, wire);
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

describe("reading the templated deployment wire", () => {
  const DEPLOYMENT = "data-deployment-preferences";

  it("takes the value off data-deployment-preferences", () => {
    expect(readDeploymentPreferenceWire(mountWith("showSeconds=0", DEPLOYMENT))).toBe(
      "showSeconds=0"
    );
  });

  it("reads an empty attribute as empty rather than absent", () => {
    expect(readDeploymentPreferenceWire(mountWith("", DEPLOYMENT))).toBe("");
  });

  it("gives null where the attribute is not there at all", () => {
    expect(readDeploymentPreferenceWire(mountWith(null))).toBeNull();
  });

  it("does not read the resolved wire, which carries the viewer's own values", () => {
    // The failure this guards is silent and total: read the resolved attribute here and every reset
    // lands on the value it was undoing, which looks exactly like a reset that did nothing.
    expect(readDeploymentPreferenceWire(mountWith("showSeconds=0"))).toBeNull();
  });

  it("gives null for no mount", () => {
    expect(readDeploymentPreferenceWire(null)).toBeNull();
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
  reset: (keysWire: string) => Promise<string>;
  settle: (echo?: string) => Promise<void>;
  fail: () => Promise<void>;
  pending: () => number;
} {
  const sent: string[] = [];
  const waiting: { resolve: (echo: string) => void; reject: (error: Error) => void }[] = [];

  /**
   * Both transports push to the same `sent`, which costs nothing to tell apart: a reset wire names
   * keys and carries no `=`, so the two formats are distinguishable by construction — the property
   * `preferences.test.ts` asserts in the shared layer.
   */
  const held = (wire: string): Promise<string> => {
    sent.push(wire);
    return new Promise((resolve, reject) => {
      waiting.push({ resolve, reject });
    });
  };

  return {
    sent,
    save: held,
    reset: held,
    settle: (echo = "") => {
      waiting.shift()?.resolve(echo);
      return flush();
    },
    fail: () => {
      waiting.shift()?.reject(new Error("write rejected"));
      return flush();
    },
    pending: () => waiting.length
  };
}

/**
 * The deadline timer the store is handed, armed and fired by the test rather than by a clock (#122).
 *
 * Injected rather than faked, which is the whole reason the store takes it: the suite needs none of
 * vitest's timer machinery to hold a write past its deadline, and the delay the store *asks* for is
 * observable as a value rather than inferred from how long a test waited.
 */
function controllableClock(): {
  delays: number[];
  armed: () => number;
  schedule: (run: () => void, delayMs: number) => () => void;
  elapse: () => Promise<void>;
} {
  const timers: { run: () => void; live: boolean }[] = [];
  const delays: number[] = [];

  return {
    delays,
    armed: () => timers.filter((timer) => timer.live).length,
    schedule: (run, delayMs) => {
      const timer = { run, live: true };
      timers.push(timer);
      delays.push(delayMs);
      return () => {
        timer.live = false;
      };
    },
    /** Fires the oldest deadline still armed, the way real time would reach it first. */
    elapse: () => {
      const timer = timers.find((candidate) => candidate.live);
      // Loudly, rather than as a no-op. A silent one would let a spec that asserts only what the
      // store looks like *after* the deadline pass against a store that armed no deadline at all —
      // a test exercising something the renderer does not produce, in this file's own currency.
      if (timer === undefined) throw new Error("no deadline is armed — nothing to elapse");
      timer.live = false;
      timer.run();
      return flush();
    }
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

  /** Echoes the code defaults, which is what an empty store resolves to. */
  const reset = (keysWire: string): Promise<string> => {
    saved.push(keysWire);
    return Promise.resolve(encodePreferences(defaultPreferences()));
  };

  it("starts from the templated preferences", () => {
    const store = preferenceStore({ wire: "showSeconds=0", save, reset });

    expect(store.get()).toEqual({ ...defaultPreferences(), showSeconds: false });
  });

  it.each([
    ["an empty wire", ""],
    ["no wire", null],
    ["an unreadable wire", "showSeconds=perhaps"]
  ])("falls back to the defaults given %s", (_case, wire) => {
    expect(preferenceStore({ wire, save, reset }).get()).toEqual(defaultPreferences());
  });

  it("hands out a copy, so a caller cannot edit the store by holding its result", () => {
    const store = preferenceStore({ wire: "", save, reset });

    store.get().showSeconds = false;

    expect(store.get().showSeconds).toBe(true);
  });

  it("applies a change immediately, without waiting for the save", () => {
    const store = preferenceStore({ wire: "", save, reset });

    store.set({ timerMuted: true });

    expect(store.get().timerMuted).toBe(true);
  });

  it("sends only the keys it was given", () => {
    // The two-tab case: sending the whole set would push this tab's stale copy of every other
    // preference over whatever else has changed since the page loaded.
    const store = preferenceStore({ wire: "", save, reset });

    store.set({ timerMuted: true });

    expect(saved).toEqual(["timerMuted=1"]);
  });

  it("keeps earlier changes while sending only the latest", async () => {
    const store = preferenceStore({ wire: "", save, reset });

    store.set({ timerMuted: true });
    store.set({ timerDurationSeconds: 600 });

    // Memory is current at once; the second write waits for the first, which is #84's fix and the
    // only reason this needs awaiting at all.
    expect(store.get()).toEqual({
      showSeconds: true,
      timerMuted: true,
      timerDurationSeconds: 600,
      showEventDurations: true,
      dialScale: "12h"
    });

    await flush();
    expect(saved).toEqual(["timerMuted=1", "timerDurationSeconds=600"]);
  });

  it.each([
    ["past the top of its range", 43201],
    ["below the bottom of its range", 30],
    ["not a whole number", 90.5]
  ])("ignores a duration %s, in memory as well as on the wire", (_case, duration) => {
    const store = preferenceStore({ wire: "", save, reset });

    store.set({ timerDurationSeconds: duration });

    expect(store.get().timerDurationSeconds).toBe(defaultPreferences().timerDurationSeconds);
    expect(saved).toEqual([]);
  });

  it("saves the acceptable half of a mixed patch", () => {
    const store = preferenceStore({ wire: "", save, reset });

    store.set({ timerDurationSeconds: 0, showSeconds: false });

    expect(saved).toEqual(["showSeconds=0"]);
    expect(store.get().timerDurationSeconds).toBe(defaultPreferences().timerDurationSeconds);
  });

  it("does not call the server for an empty patch", () => {
    const spy = vi.fn(() => Promise.resolve());
    const store = preferenceStore({ wire: "", save: spy, reset });

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
    const { sent, save, reset, settle } = controllableSave();
    const store = preferenceStore({ wire: "", save, reset });

    store.set({ timerDurationSeconds: 600 });
    store.set({ timerDurationSeconds: 900 });

    // The defect, as a sequence: on `main` both are with the server at this point, and whichever
    // Apps Script finishes second is what a reload reads back.
    expect(sent).toEqual(["timerDurationSeconds=600"]);

    await settle();
    expect(sent).toEqual(["timerDurationSeconds=600", "timerDurationSeconds=900"]);
  });

  it("leaves the store holding the last value set, whatever order the writes finished in", async () => {
    const { sent, save, reset, settle } = controllableSave();
    const store = preferenceStore({ wire: "", save, reset });

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
    const { sent, save, reset, settle } = controllableSave();
    const store = preferenceStore({ wire: "", save, reset });

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
    const { sent, save, reset, settle } = controllableSave();
    const store = preferenceStore({ wire: "", save, reset });

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
    const { sent, save, reset, fail } = controllableSave();
    const store = preferenceStore({ wire: "", save, reset });

    store.set({ showSeconds: false });
    store.set({ timerMuted: true });
    await fail();

    expect(sent).toEqual(["showSeconds=0", "timerMuted=1"]);
  });

  it("does not retry the failed write's own value", async () => {
    const { sent, save, reset, fail, settle, pending } = controllableSave();
    const store = preferenceStore({ wire: "", save, reset });

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
      },
      reset: () => Promise.resolve("")
    });

    store.set({ showSeconds: false });
    store.set({ timerMuted: true });
    await flush();

    // `callServer` rejects rather than throws, but a `save` is a caller-supplied function and a
    // synchronous throw wedging the queue would cost every later preference rather than this one.
    expect(sent).toEqual(["showSeconds=0", "timerMuted=1"]);
  });

  it("shows the newest value on screen while an older one is still being written", async () => {
    const { save, reset, settle } = controllableSave();
    const store = preferenceStore({ wire: "", save, reset });

    store.set({ timerDurationSeconds: 600 });
    store.set({ timerDurationSeconds: 900 });

    // Queueing the write must not queue the change: the control the viewer just used has to agree
    // with the display immediately, which is what the store applies changes locally for.
    expect(store.get().timerDurationSeconds).toBe(900);

    await settle();
    expect(store.get().timerDurationSeconds).toBe(900);
  });
});

/**
 * #122. `drain` runs on fulfilment *and* rejection, so a failed write costs its own value and not the
 * ones behind it — but a promise that does neither leaves `writing` true forever, and nothing is
 * written again for the life of the page. On a wall display that is however long the board has been
 * up, and the stall has no symptom: the screen stays correct and only a reload reveals it.
 *
 * This is the one axis on which #84's queue can be worse than the fire-and-forget it replaced, which
 * could lose a write and could order two wrongly but could not stop writing.
 *
 * The one that matters is the **negative** one: a write that never settles must not stop the next
 * write from being sent. Asserting only that the timer fires would pass without testing the property
 * this issue exists to protect.
 *
 * Most of these are on the sequence of writes, for the reason the block above gives — but three
 * deliberately are not, and the exception is worth naming rather than glossed. `clock.delays`,
 * `clock.armed()` and the `window.setTimeout` spy pin the timer itself. The 10 s is a **decision**
 * recorded on #122 rather than plumbing, and the spy is the only thing standing between the deadline
 * and never reaching a board: every other spec here injects a clock, so a default that armed nothing
 * would leave all of them green.
 */
describe("the store, with a write that never settles", () => {
  /** The deployment's answer for `showSeconds`, which differs from the code default of `true`. */
  const DEPLOYMENT_WIRE = encodePreferences({ ...defaultPreferences(), showSeconds: false });

  it("sends the queued write once the abandoned one's deadline passes", async () => {
    const { sent, save, reset } = controllableSave();
    const clock = controllableClock();
    const store = preferenceStore({ wire: "", save, reset, schedule: clock.schedule });

    store.set({ showSeconds: false });
    store.set({ timerMuted: true });

    expect(sent).toEqual(["showSeconds=0"]);

    // The defect, as a sequence: without a deadline the second entry is never sent at all, and nor
    // is anything set after it, for as long as the page is open.
    await clock.elapse();
    expect(sent).toEqual(["showSeconds=0", "timerMuted=1"]);
  });

  it("does not resend the abandoned write's own value", async () => {
    const { sent, save, reset, pending } = controllableSave();
    const clock = controllableClock();
    const store = preferenceStore({ wire: "", save, reset, schedule: clock.schedule });

    store.set({ showSeconds: false });
    await clock.elapse();

    // Same bargain as a refused write: a lost save costs the next reload's memory of a setting rather
    // than interrupting a lesson, and a retry loop on a display up for weeks costs more than that.
    // The write is still with the server — abandoning it is the store giving up its turn, not the
    // bridge answering.
    expect(sent).toEqual(["showSeconds=0"]);
    expect(pending()).toBe(1);
  });

  it("abandons a reset the same way, so a reset cannot shut the queue either", async () => {
    const { sent, save, reset } = controllableSave();
    const clock = controllableClock();
    const store = preferenceStore({ wire: "", save, reset, schedule: clock.schedule });

    store.reset(["showSeconds"]);
    store.set({ timerMuted: true });

    expect(sent).toEqual(["showSeconds"]);

    await clock.elapse();
    expect(sent).toEqual(["showSeconds", "timerMuted=1"]);
  });

  it("sends the follow-up at the settle, not at the deadline", async () => {
    const { sent, save, reset, settle } = controllableSave();
    const clock = controllableClock();
    const store = preferenceStore({ wire: "", save, reset, schedule: clock.schedule });

    store.set({ showSeconds: false });
    store.set({ timerMuted: true });
    await settle();

    // A healthy round trip is 0.5–2 s (ADR 0006) against a 10 s deadline, so the deadline must be
    // invisible in the ordinary case rather than a delay every write waits out.
    expect(sent).toEqual(["showSeconds=0", "timerMuted=1"]);
  });

  it("leaves no deadline armed once a write is over", async () => {
    const { save, reset, settle, fail } = controllableSave();
    const clock = controllableClock();
    const store = preferenceStore({ wire: "", save, reset, schedule: clock.schedule });

    store.set({ showSeconds: false });
    await settle();
    store.set({ timerMuted: true });
    await fail();

    // A board is up for weeks. A stray deadline outliving its own write would fire while a *later*
    // write was in flight and abandon that healthy write's turn — a slow leak that gets worse the
    // longer the display runs, which is the opposite of what this change is for.
    expect(clock.armed()).toBe(0);
  });

  it("does not end the next write's turn when the abandoned one answers late", async () => {
    const { sent, save, reset, settle } = controllableSave();
    const clock = controllableClock();
    const store = preferenceStore({ wire: "", save, reset, schedule: clock.schedule });

    store.set({ showSeconds: false });
    store.set({ timerMuted: true });
    await clock.elapse();
    store.set({ timerDurationSeconds: 600 });

    // `settle` completes the *oldest* unfinished write, which is the abandoned one. Draining a second
    // time for it would send the queue's next entry while the previous entry was still out — #84's
    // defect, reintroduced by the fix for the stall.
    await settle();
    expect(sent).toEqual(["showSeconds=0", "timerMuted=1"]);

    await settle();
    expect(sent).toEqual(["showSeconds=0", "timerMuted=1", "timerDurationSeconds=600"]);
  });

  it("does not adopt a reset echo that arrives after the deadline", async () => {
    const { save, reset, settle } = controllableSave();
    const clock = controllableClock();
    const store = preferenceStore({
      wire: "showSeconds=0",
      // The deployment says `showSeconds=1`, so the reset lands on `true` locally and the echo below
      // says `false` — which is what makes the assertion about the *echo* rather than about where the
      // reset landed. Borrowed from the "echo the transport did not keep" block's own reasoning, and
      // needed here for the same reason: since #157 a reset applies the layer beneath at once, so a
      // store with no `deploymentWire` would land on the code default and pass either way.
      deploymentWire: "showSeconds=1",
      save,
      reset,
      schedule: clock.schedule
    });

    store.reset(["showSeconds"]);
    await clock.elapse();

    // An abandoned reset is a failed reset, and a failed reset adopts nothing. The echo is a reading
    // of the layer beneath from before the store gave up its turn, so applying it now would move a
    // value the store has already stopped waiting on.
    await settle(DEPLOYMENT_WIRE);
    expect(store.get().showSeconds).toBe(true);
  });

  it("leaves an abandoned reset showing the layer beneath, not the value it undid", async () => {
    const { save, reset } = controllableSave();
    const clock = controllableClock();
    const store = preferenceStore({
      wire: "timerDurationSeconds=900",
      deploymentWire: encodePreferences({ ...defaultPreferences(), timerDurationSeconds: 600 }),
      save,
      reset,
      schedule: clock.schedule
    });

    store.reset(["timerDurationSeconds"]);
    await clock.elapse();

    // Where this change and #157 meet, and neither one's specs covered it alone. #157 made a *failed*
    // reset leave the display on a real layer rather than on an unmoored value; an abandoned reset is
    // a failed reset, so it has to keep that property — the deadline must cost the store's memory of
    // the setting, never the screen's honesty about which layer it is showing.
    expect(store.get().timerDurationSeconds).toBe(600);
  });

  it("arms a fresh deadline for the write that follows an abandoned one", async () => {
    const { sent, save, reset } = controllableSave();
    const clock = controllableClock();
    const store = preferenceStore({ wire: "", save, reset, schedule: clock.schedule });

    store.set({ showSeconds: false });
    store.set({ timerMuted: true });
    await clock.elapse();
    store.set({ timerDurationSeconds: 600 });

    // A bridge that has stopped answering stops answering *every* write, so the deadline has to be
    // per write rather than per page: arming once would recover the first stall and then shut the
    // queue on the second, which is the same defect one write later.
    await clock.elapse();
    expect(sent).toEqual(["showSeconds=0", "timerMuted=1", "timerDurationSeconds=600"]);
  });

  it("keeps writing after a reset that throws instead of rejecting", async () => {
    const clock = controllableClock();
    const sent: string[] = [];
    const store = preferenceStore({
      wire: "",
      save: (wire) => {
        sent.push(wire);
        return Promise.resolve();
      },
      // The `sendKeys` half of the synchronous-throw path, which nothing covered before: it has its
      // own `try` and its own `end`, and a throw wedging there costs every later preference.
      reset: (keysWire) => {
        sent.push(keysWire);
        throw new Error("bridge missing");
      },
      schedule: clock.schedule
    });

    store.reset(["showSeconds"]);
    store.set({ timerMuted: true });
    await flush();

    expect(sent).toEqual(["showSeconds", "timerMuted=1"]);
    expect(clock.armed()).toBe(0);
  });

  it("arms a real timer when no clock is injected, so a board gets a deadline at all", () => {
    // The one property every other spec in this block cannot see, because they all inject. A default
    // that armed nothing would leave production with no deadline and leave all of them green — the
    // same shape of hole as a test that exercises a geometry the renderer does not produce.
    //
    // Stubbed rather than merely observed: the write below never settles, so a real timer would still
    // be armed when the test ends and would fire `console.warn` and `drain` out of a finished spec.
    const armed = vi
      .spyOn(window, "setTimeout")
      .mockImplementation(() => 0 as unknown as ReturnType<typeof window.setTimeout>);
    const { save, reset } = controllableSave();
    const store = preferenceStore({ wire: "", save, reset });

    store.set({ showSeconds: false });

    expect(armed).toHaveBeenCalledWith(expect.any(Function), 10_000);
    armed.mockRestore();
  });

  it("arms the deadline at ten seconds", () => {
    const { save, reset } = controllableSave();
    const clock = controllableClock();
    const store = preferenceStore({ wire: "", save, reset, schedule: clock.schedule });

    store.set({ showSeconds: false });

    // Five times the slow end of ADR 0006's 0.5–2 s round trip. Not 2 s, which races a merely-loaded
    // board routinely; not 60 s, which leaves a minute of dead queue per occurrence.
    expect(clock.delays).toEqual([10_000]);
  });

  it("reports an abandoned write, so the failure leaves some trace", async () => {
    const warned = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { save, reset } = controllableSave();
    const clock = controllableClock();
    const store = preferenceStore({ wire: "", save, reset, schedule: clock.schedule });

    store.set({ showSeconds: false });
    await clock.elapse();

    // `main.ts` logs the sibling failures — `preference not saved`, `preference not reset` — from
    // inside the functions this store is handed, which is upstream of the deadline. Without a line
    // here an abandoned write is the only failure in this store with no record anywhere, on a display
    // nobody is watching.
    expect(warned).toHaveBeenCalledWith(expect.stringContaining("abandoned"));
    warned.mockRestore();
  });

  it("keeps a synchronous throw draining at once, deadline and all", async () => {
    const clock = controllableClock();
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
      },
      reset: () => Promise.resolve(""),
      schedule: clock.schedule
    });

    store.set({ showSeconds: false });
    store.set({ timerMuted: true });
    await flush();

    // The deadline must not turn a throw that drained *synchronously* into one that waits 10 s, and
    // must not leave the throwing write's timer armed behind it.
    expect(sent).toEqual(["showSeconds=0", "timerMuted=1"]);
    expect(clock.armed()).toBe(0);
  });
});

/**
 * #83, as #157 leaves it. A reset used to be the one operation whose outcome the client could not
 * compute — `doGet` templated the *resolved* wire and nothing else, so nothing in the browser knew
 * which layer a value came from, and dropping the viewer's own might land on the deployment's answer
 * or on the code's. `deploymentWire` is that missing layer, templated beside the resolved set.
 *
 * So the assertions here are about a reset landing on the layer beneath **at once**, about the echo
 * still being adopted as a correction to it, and about a reset taking its turn in the same single
 * writer #84 established.
 */
describe("resetting a preference", () => {
  /** The deployment's answer for `showSeconds`, which differs from the code default of `true`. */
  const DEPLOYMENT_WIRE = encodePreferences({ ...defaultPreferences(), showSeconds: false });

  it("sends the keys it was given, as a key list rather than a patch", () => {
    const { sent, save, reset } = controllableSave();
    const store = preferenceStore({ wire: "", save, reset });

    store.reset(["showSeconds"]);

    expect(sent).toEqual(["showSeconds"]);
  });

  it("sends one wire in registry order for several keys", () => {
    const { sent, save, reset } = controllableSave();
    const store = preferenceStore({ wire: "", save, reset });

    store.reset(["timerDurationSeconds", "showSeconds"]);

    expect(sent).toEqual(["showSeconds;timerDurationSeconds"]);
  });

  it("does not call the server for no keys", () => {
    const spy = vi.fn(() => Promise.resolve(""));
    const store = preferenceStore({ wire: "", save: () => Promise.resolve(), reset: spy });

    store.reset([]);

    expect(spy).not.toHaveBeenCalled();
  });

  it("lands on the deployment's value before any promise settles", async () => {
    // #157's discriminating case, and the reversal of the spec that used to stand here. `showSeconds`
    // defaults to `true` in code, the viewer's store held `true`, and the deployment says `false`, so
    // a store guessing the code default would land on `true` — indistinguishable from doing nothing.
    // The templated deployment layer is how it lands on `false` with the write still in the air.
    const { save, reset, settle } = controllableSave();
    const store = preferenceStore({
      wire: "showSeconds=1",
      deploymentWire: DEPLOYMENT_WIRE,
      save,
      reset
    });

    store.reset(["showSeconds"]);
    expect(store.get().showSeconds).toBe(false);

    await settle(DEPLOYMENT_WIRE);
    expect(store.get().showSeconds).toBe(false);
  });

  it("lands on the code default where the deployment has no answer of its own", () => {
    // The other half of the same property: the layer beneath is the deployment's *resolved* set, so
    // a key the deployment never set is the code default there and lands there too.
    const { save, reset } = controllableSave();
    const store = preferenceStore({
      wire: "timerDurationSeconds=900",
      deploymentWire: encodePreferences(defaultPreferences()),
      save,
      reset
    });

    store.reset(["timerDurationSeconds"]);

    expect(store.get().timerDurationSeconds).toBe(300);
  });

  it("falls back to the code defaults where no deployment wire was templated at all", () => {
    // The local preview, which has no server and therefore no deployment layer. Also a page served
    // before the attribute existed — where the code default is what the old reset would have guessed.
    const { save, reset } = controllableSave();
    const store = preferenceStore({ wire: "showSeconds=0", save, reset });

    store.reset(["showSeconds"]);

    expect(store.get().showSeconds).toBe(true);
  });

  it("still adopts the echo, which is fresher than the layer the page loaded with", async () => {
    // The reason the echo is kept rather than dropped as redundant: `deploymentWire` is a snapshot
    // from page load, and a wall display's page is loaded for as long as the board has been up. A
    // second tab or an administrator can move the script store underneath it.
    const { save, reset, settle } = controllableSave();
    const store = preferenceStore({
      wire: "timerDurationSeconds=900",
      deploymentWire: encodePreferences({ ...defaultPreferences(), timerDurationSeconds: 300 }),
      save,
      reset
    });

    store.reset(["timerDurationSeconds"]);
    expect(store.get().timerDurationSeconds).toBe(300);

    await settle(encodePreferences({ ...defaultPreferences(), timerDurationSeconds: 600 }));
    expect(store.get().timerDurationSeconds).toBe(600);
  });

  it("adopts only the keys it named, though the echo carries every one", async () => {
    // The echo is the whole resolved set. Taking all of it would import a second tab's changes, or
    // undo a local one, on the strength of a reset that never mentioned the key.
    const { save, reset, settle } = controllableSave();
    const store = preferenceStore({ wire: "", save, reset });

    store.reset(["showSeconds"]);
    await settle(
      encodePreferences({ showSeconds: false, timerMuted: true, timerDurationSeconds: 1800 })
    );

    expect(store.get()).toEqual({ ...defaultPreferences(), showSeconds: false });
  });

  it("leaves the display on the layer beneath when the reset fails", async () => {
    // The second reversal (#157). A failed write costs the store's memory of a setting, as it always
    // has — but it no longer costs the screen's honesty: what is shown is a real layer, not the
    // value the reset was undoing. The viewer's own value is the one that did not go away.
    const { save, reset, fail } = controllableSave();
    const store = preferenceStore({
      wire: "showSeconds=1",
      deploymentWire: DEPLOYMENT_WIRE,
      save,
      reset
    });

    store.reset(["showSeconds"]);
    await fail();

    expect(store.get().showSeconds).toBe(false);
  });
});

/**
 * A reset is a write to the same store as a save, so it joins the single writer rather than opening
 * a second one — the same reasoning as #84, whose finding is that two `google.script.run` calls have
 * no ordering between them at all.
 */
describe("resetting, against the write in flight", () => {
  const DEPLOYMENT_WIRE = encodePreferences({ ...defaultPreferences(), showSeconds: false });

  it("holds a reset until the save before it is over", async () => {
    const { sent, save, reset, settle } = controllableSave();
    const store = preferenceStore({ wire: "", save, reset });

    store.set({ timerMuted: true });
    store.reset(["showSeconds"]);

    expect(sent).toEqual(["timerMuted=1"]);

    await settle();
    expect(sent).toEqual(["timerMuted=1", "showSeconds"]);
  });

  it("applies a held reset locally at once, before it is even sent", async () => {
    // Queueing the write must not queue the change — the same property `set` has, and the branch it
    // would be easiest to leave out, since the sending branch is the one every other spec exercises.
    const { sent, save, reset, settle } = controllableSave();
    const store = preferenceStore({
      wire: "showSeconds=1",
      deploymentWire: DEPLOYMENT_WIRE,
      save,
      reset
    });

    store.set({ timerMuted: true });
    store.reset(["showSeconds"]);

    expect(sent).toEqual(["timerMuted=1"]);
    expect(store.get().showSeconds).toBe(false);

    await settle();
    expect(store.get().showSeconds).toBe(false);
  });

  it("holds a save until the reset before it is over", async () => {
    const { sent, save, reset, settle } = controllableSave();
    const store = preferenceStore({ wire: "", save, reset });

    store.reset(["showSeconds"]);
    store.set({ timerMuted: true });

    expect(sent).toEqual(["showSeconds"]);

    await settle(DEPLOYMENT_WIRE);
    expect(sent).toEqual(["showSeconds", "timerMuted=1"]);
  });

  it("sends a key once however many times it is queued for reset", async () => {
    const { sent, save, reset, settle } = controllableSave();
    const store = preferenceStore({ wire: "", save, reset });

    store.set({ timerMuted: true });
    store.reset(["showSeconds"]);
    store.reset(["showSeconds", "timerDurationSeconds"]);
    await settle();

    expect(sent).toEqual(["timerMuted=1", "showSeconds;timerDurationSeconds"]);
  });

  it("drops a queued reset for a key that is then set", async () => {
    // Last operation on a key wins, which is the supersede rule the queue already applied to values.
    // Sending both would leave the store holding whichever the second call happened to be.
    const { sent, save, reset, settle } = controllableSave();
    const store = preferenceStore({ wire: "", save, reset });

    store.set({ timerMuted: true });
    store.reset(["showSeconds"]);
    store.set({ showSeconds: false });
    await settle();
    await settle();

    expect(sent).toEqual(["timerMuted=1", "showSeconds=0"]);
    expect(store.get().showSeconds).toBe(false);
  });

  it("drops a queued value for a key that is then reset", async () => {
    const { sent, save, reset, settle } = controllableSave();
    const store = preferenceStore({ wire: "", save, reset });

    store.set({ timerMuted: true });
    store.set({ showSeconds: false });
    store.reset(["showSeconds"]);
    await settle();
    await settle(DEPLOYMENT_WIRE);

    expect(sent).toEqual(["timerMuted=1", "showSeconds"]);
  });

  it("leaves no unmoored value when a reset supersedes a queued set and is then refused", async () => {
    // #158's gap, closed by #157 rather than handled by it. The 900 below is dropped from the queue
    // by the reset that supersedes it, so it reaches neither the store nor any layer — and before
    // the deployment wire was templated it stayed on screen, the one value in the whole system with
    // nowhere behind it. Now the reset lands on 600 at once, and a refused write costs the store's
    // memory rather than the screen's honesty.
    const { sent, save, reset, settle, fail } = controllableSave();
    const store = preferenceStore({
      wire: "",
      deploymentWire: encodePreferences({ ...defaultPreferences(), timerDurationSeconds: 600 }),
      save,
      reset
    });

    store.set({ timerMuted: true });
    store.set({ timerDurationSeconds: 900 });
    store.reset(["timerDurationSeconds"]);
    await settle();
    await fail();

    expect(sent).toEqual(["timerMuted=1", "timerDurationSeconds"]);
    expect(store.get().timerDurationSeconds).toBe(600);
  });

  it("adopts the echo of a reset that succeeded even with another reset queued behind it", async () => {
    // A queued *reset* is not a change: it asks for what the echo already reports, since deleting an
    // absent property does nothing. Skipping adoption there discards the only answer the client gets
    // — and if the second reset then fails, the display keeps the value the first one removed.
    const { save, reset, settle, fail } = controllableSave();
    const store = preferenceStore({ wire: "showSeconds=1", save, reset });

    store.set({ timerMuted: true });
    store.reset(["showSeconds"]);
    await settle();
    store.reset(["showSeconds"]);
    await settle(DEPLOYMENT_WIRE);
    await fail();

    expect(store.get().showSeconds).toBe(false);
  });

  it("keeps a queued value of `false` against an echo that says otherwise", async () => {
    // The predicate is `queuedValues[key] !== undefined`, not a truthiness test: a queued `false`
    // is a change the viewer made and the echo predates it. A truthiness test passes every other
    // spec here and reverts this one silently.
    const { save, reset, settle } = controllableSave();
    const store = preferenceStore({ wire: "showSeconds=1", save, reset });

    store.reset(["showSeconds"]);
    store.set({ showSeconds: false });
    await settle(encodePreferences(defaultPreferences()));

    expect(store.get().showSeconds).toBe(false);
  });

  it("does not let an echo undo a change made while the reset was in flight", async () => {
    // The echo predates the change: the server answered before this tab set the key again. Adopting
    // it would silently revert the control the viewer had just used, which is #84's own defect.
    const { sent, save, reset, settle } = controllableSave();
    const store = preferenceStore({ wire: "showSeconds=1", save, reset });

    store.reset(["showSeconds"]);
    store.set({ showSeconds: true });
    await settle(DEPLOYMENT_WIRE);

    expect(store.get().showSeconds).toBe(true);
    expect(sent).toEqual(["showSeconds", "showSeconds=1"]);
  });

  it("sends the queued write after a failed reset, so one loss is not every loss", async () => {
    const { sent, save, reset, fail } = controllableSave();
    const store = preferenceStore({ wire: "", save, reset });

    store.reset(["showSeconds"]);
    store.set({ timerMuted: true });
    await fail();

    expect(sent).toEqual(["showSeconds", "timerMuted=1"]);
  });

  it("keeps writing after a reset that throws instead of rejecting", async () => {
    const sent: string[] = [];
    const store = preferenceStore({
      wire: "",
      save: (wire) => {
        sent.push(wire);
        return Promise.resolve();
      },
      reset: (keysWire) => {
        sent.push(keysWire);
        throw new Error("bridge missing");
      }
    });

    store.reset(["showSeconds"]);
    store.set({ timerMuted: true });
    await flush();

    expect(sent).toEqual(["showSeconds", "timerMuted=1"]);
  });

  it("resets every key there is when asked for the whole registry", () => {
    // What a "put it back how it was" control will send. Named explicitly rather than by an empty
    // wire, which the server reads as nothing at all.
    const { sent, save, reset } = controllableSave();
    const store = preferenceStore({ wire: "", save, reset });

    store.reset(PREFERENCE_KEYS);

    expect(sent).toEqual([
      "showSeconds;timerMuted;timerDurationSeconds;showEventDurations;dialScale"
    ]);
  });
});

/**
 * The echo comes back over `google.script.run`, where `callServer<string>` is a cast and not a
 * check. These are the cases where it does not keep that promise — and the cost of getting them
 * wrong is not the echo, it is the queue: a throw inside a fulfilment handler shuts the single
 * writer and every later preference with it.
 */
describe("resetting, with an echo the transport did not keep", () => {
  const badEcho = (echo: unknown) => {
    const sent: string[] = [];
    const store = preferenceStore({
      wire: "showSeconds=0",
      // The deployment says `showSeconds=0` too, so a reset lands where the value already was and the
      // assertions below isolate the echo: anything that moves `showSeconds` came from the echo, not
      // from the local application (#157). Without this the reset would land on the code default and
      // a bad echo adopting `true` would be indistinguishable from adopting nothing.
      deploymentWire: "showSeconds=0",
      save: (wire) => {
        sent.push(wire);
        return Promise.resolve();
      },
      reset: (keysWire) => {
        sent.push(keysWire);
        return Promise.resolve(echo as string);
      }
    });
    return { sent, store };
  };

  it.each([
    ["an object", { showSeconds: 1 }],
    ["undefined", undefined],
    ["a number", 1]
  ])("keeps the queue moving when the echo is %s", async (_case, echo) => {
    const { sent, store } = badEcho(echo);

    store.reset(["showSeconds"]);
    store.set({ timerMuted: true });
    await flush();
    await flush();

    // Without the guard the first of these is all that is ever sent, and every preference set for
    // the rest of the page's life is lost — a wall display is up for weeks.
    expect(sent).toEqual(["showSeconds", "timerMuted=1"]);
    expect(store.get().timerMuted).toBe(true);
  });

  it("adopts nothing from an echo that names nothing", async () => {
    // Reading an empty wire as the resolved set would say "every preference is at its code default"
    // — showSeconds back to `true` — which is precisely the guess the echo exists to avoid.
    const { store } = badEcho("");

    store.reset(["showSeconds"]);
    await flush();

    expect(store.get().showSeconds).toBe(false);
  });

  it("adopts nothing for a key the echo cannot state", async () => {
    const { store } = badEcho("showSeconds=perhaps;timerMuted=1");

    store.reset(["showSeconds", "timerMuted"]);
    await flush();

    expect(store.get()).toEqual({ ...defaultPreferences(), showSeconds: false, timerMuted: true });
  });
});
