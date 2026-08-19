import { describe, expect, it, vi } from "vitest";

import { defaultPreferences, encodePreferences } from "../shared/preferences";
import {
  type PreferenceStores,
  type PropertyBag,
  preferencesWire,
  readStoredPreferences,
  savePreferences
} from "./preferences";

interface FakeBag extends PropertyBag {
  /** What the store holds, so a test can assert on what was written and under which key. */
  readonly stored: { [key: string]: string };
}

function bag(initial: { [key: string]: string } = {}): FakeBag {
  const stored: { [key: string]: string } = { ...initial };

  return {
    stored,
    getProperties: () => ({ ...stored }),
    setProperty(key, value) {
      stored[key] = value;
    }
  };
}

function stores(
  user: { [key: string]: string } = {},
  script: { [key: string]: string } = {}
): PreferenceStores & { user: FakeBag; script: FakeBag } {
  return { user: bag(user), script: bag(script) };
}

describe("reading", () => {
  it("gives the defaults when nothing is stored", () => {
    expect(readStoredPreferences(stores())).toEqual(defaultPreferences());
  });

  it("takes a value from the user's own store", () => {
    expect(readStoredPreferences(stores({ "pref.showSeconds": "0" })).showSeconds).toBe(false);
  });

  it("takes a value from the script store where the user has none", () => {
    const resolved = readStoredPreferences(stores({}, { "pref.timerDurationSeconds": "600" }));

    expect(resolved.timerDurationSeconds).toBe(600);
  });

  it("prefers the user's value over the deployment's", () => {
    const resolved = readStoredPreferences(
      stores({ "pref.timerDurationSeconds": "120" }, { "pref.timerDurationSeconds": "600" })
    );

    expect(resolved.timerDurationSeconds).toBe(120);
  });

  it("ignores a property that is not under the preference prefix", () => {
    // Something else's `showSeconds` key must not become this store's, which is the whole reason
    // for the prefix.
    expect(readStoredPreferences(stores({ showSeconds: "0" })).showSeconds).toBe(true);
  });

  it("returns the defaults, and says so, when the store itself fails", () => {
    // doGet reads on every page load: a throwing PropertiesService must cost a preference, not the
    // whole display.
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const broken: PropertyBag = {
      getProperties: () => {
        throw new Error("quota exceeded");
      },
      setProperty: () => undefined
    };

    const resolved = readStoredPreferences({ user: broken, script: broken });

    expect(resolved).toEqual(defaultPreferences());
    expect(logged).toHaveBeenCalledWith(expect.stringContaining("quota exceeded"));
    logged.mockRestore();
  });
});

describe("the wire form doGet templates", () => {
  it("is the resolved set, encoded", () => {
    const live = stores({ "pref.showSeconds": "0" });

    expect(preferencesWire(live)).toBe(encodePreferences(readStoredPreferences(live)));
  });

  it("carries a stored override", () => {
    expect(preferencesWire(stores({ "pref.timerMuted": "1" }))).toContain("timerMuted=1");
  });
});

describe("saving", () => {
  it("writes an accepted value to the user store under its prefixed key", () => {
    const live = stores();

    savePreferences("timerMuted=1", live);

    expect(live.user.stored).toEqual({ "pref.timerMuted": "1" });
  });

  it("never writes to the script store, which holds the deployment's own defaults", () => {
    const live = stores();

    savePreferences("showSeconds=0;timerDurationSeconds=600", live);

    expect(live.script.stored).toEqual({});
  });

  it("leaves the keys the patch does not mention alone", () => {
    // A second tab sending one preference must not undo what the first one changed.
    const live = stores({ "pref.showSeconds": "0" });

    savePreferences("timerMuted=1", live);

    expect(live.user.stored["pref.showSeconds"]).toBe("0");
  });

  it("stores nothing at all for a patch it cannot use", () => {
    const live = stores();

    savePreferences("scaleMode=1h;timerDurationSeconds=0;showSeconds=maybe", live);

    expect(live.user.stored).toEqual({});
  });

  it("stores the schema's own encoding rather than the string it was sent", () => {
    // The client's string never reaches the store: it is parsed and re-encoded, so a value that
    // happens to parse loosely cannot be persisted in a form nothing else reads.
    const live = stores();

    savePreferences("timerDurationSeconds=0600", live);

    expect(live.user.stored["pref.timerDurationSeconds"]).toBe("600");
  });

  it("reports back the resolved set, including what it just wrote", () => {
    const live = stores();

    expect(savePreferences("showSeconds=0", live)).toBe(
      encodePreferences({ ...defaultPreferences(), showSeconds: false })
    );
  });

  it("lets a failing write reach the caller", () => {
    // The opposite of the read path: only the caller knows a preference did not stick.
    const live = stores();
    live.user.setProperty = () => {
      throw new Error("write quota exceeded");
    };

    expect(() => savePreferences("timerMuted=1", live)).toThrow("write quota exceeded");
  });
});
