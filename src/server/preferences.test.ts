import { describe, expect, it, vi } from "vitest";

import { defaultPreferences, encodePreferences } from "../shared/preferences";
import {
  type PreferenceStoreSource,
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
    setProperties(properties) {
      // Merging, as `Properties.setProperties` does when not told to clear the rest.
      for (const key of Object.keys(properties)) stored[key] = properties[key] as string;
    }
  };
}

interface FakeStores extends PreferenceStores {
  user: FakeBag;
  script: FakeBag;
}

function stores(
  user: { [key: string]: string } = {},
  script: { [key: string]: string } = {}
): FakeStores {
  return { user: bag(user), script: bag(script) };
}

/** The injection point is a factory, not the stores, so acquisition itself can be made to fail. */
const from = (live: PreferenceStores): PreferenceStoreSource => () => live;

describe("reading", () => {
  it("gives the defaults when nothing is stored", () => {
    expect(readStoredPreferences(from(stores()))).toEqual(defaultPreferences());
  });

  it("takes a value from the user's own store", () => {
    const resolved = readStoredPreferences(from(stores({ "pref.showSeconds": "0" })));

    expect(resolved.showSeconds).toBe(false);
  });

  it("takes a value from the script store where the user has none", () => {
    const resolved = readStoredPreferences(
      from(stores({}, { "pref.timerDurationSeconds": "600" }))
    );

    expect(resolved.timerDurationSeconds).toBe(600);
  });

  it("prefers the user's value over the deployment's", () => {
    const resolved = readStoredPreferences(
      from(stores({ "pref.timerDurationSeconds": "120" }, { "pref.timerDurationSeconds": "600" }))
    );

    expect(resolved.timerDurationSeconds).toBe(120);
  });

  it("ignores a property that is not under the preference prefix", () => {
    // Something else's `showSeconds` key must not become this store's, which is the whole reason
    // for the prefix.
    const resolved = readStoredPreferences(from(stores({ showSeconds: "0" })));

    expect(resolved.showSeconds).toBe(true);
  });

  it("returns the defaults, and says so, when reading a store fails", () => {
    // doGet reads on every page load: a throwing PropertiesService must cost a preference, not the
    // whole display.
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const broken: PropertyBag = {
      getProperties: () => {
        throw new Error("read quota exceeded");
      },
      setProperties: () => undefined
    };

    const resolved = readStoredPreferences(from({ user: broken, script: broken }));

    expect(resolved).toEqual(defaultPreferences());
    expect(logged).toHaveBeenCalledWith(expect.stringContaining("read quota exceeded"));
    logged.mockRestore();
  });

  it("returns the defaults when obtaining the stores fails at all", () => {
    // `PropertiesService.getUserProperties()` can fail on its own — no effective user, an internal
    // error — and that happens *before* any bag exists to throw from. A default parameter would
    // have been evaluated outside the try, so this case is the reason the seam is a factory.
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const resolved = readStoredPreferences(() => {
      throw new Error("no effective user");
    });

    expect(resolved).toEqual(defaultPreferences());
    expect(logged).toHaveBeenCalledWith(expect.stringContaining("no effective user"));
    logged.mockRestore();
  });
});

describe("the wire form doGet templates", () => {
  it("is the encoded resolved set", () => {
    expect(preferencesWire(from(stores({ "pref.showSeconds": "0" })))).toBe(
      "showSeconds=0;timerMuted=0;timerDurationSeconds=300"
    );
  });

  it("is the encoded defaults when nothing is stored", () => {
    expect(preferencesWire(from(stores()))).toBe(
      "showSeconds=1;timerMuted=0;timerDurationSeconds=300"
    );
  });
});

describe("saving", () => {
  it("writes an accepted value to the user store under its prefixed key", () => {
    const live = stores();

    savePreferences("timerMuted=1", from(live));

    expect(live.user.stored).toEqual({ "pref.timerMuted": "1" });
  });

  it("never writes to the script store, which holds the deployment's own defaults", () => {
    const live = stores();

    savePreferences("showSeconds=0;timerDurationSeconds=600", from(live));

    expect(live.script.stored).toEqual({});
  });

  it("writes the whole patch in one call, because write quota is per call", () => {
    const live = stores();
    const batched = vi.spyOn(live.user, "setProperties");

    savePreferences("showSeconds=0;timerMuted=1;timerDurationSeconds=600", from(live));

    expect(batched).toHaveBeenCalledTimes(1);
    expect(batched).toHaveBeenCalledWith({
      "pref.showSeconds": "0",
      "pref.timerMuted": "1",
      "pref.timerDurationSeconds": "600"
    });
  });

  it("leaves the keys the patch does not mention alone", () => {
    // A second tab sending one preference must not undo what the first one changed.
    const live = stores({ "pref.showSeconds": "0" });

    savePreferences("timerMuted=1", from(live));

    expect(live.user.stored["pref.showSeconds"]).toBe("0");
  });

  it("stores nothing at all for a patch it cannot use", () => {
    const live = stores();
    const batched = vi.spyOn(live.user, "setProperties");

    savePreferences("scaleMode=1h;timerDurationSeconds=0;showSeconds=maybe", from(live));

    expect(live.user.stored).toEqual({});
    expect(batched).not.toHaveBeenCalled();
  });

  it("does not touch the store for an empty patch, so a read-only caller stays read-only", () => {
    // The `?check=1` row relies on this: it sends nothing and reads the echo.
    const live = stores({ "pref.showSeconds": "0" });
    const batched = vi.spyOn(live.user, "setProperties");

    expect(savePreferences("", from(live))).toBe("showSeconds=0;timerMuted=0;timerDurationSeconds=300");
    expect(batched).not.toHaveBeenCalled();
  });

  it("stores the schema's own encoding rather than the string it was sent", () => {
    // The client's string never reaches the store: it is parsed and re-encoded, so a value that
    // happens to parse loosely cannot be persisted in a form nothing else reads.
    const live = stores();

    savePreferences("timerDurationSeconds=0600", from(live));

    expect(live.user.stored["pref.timerDurationSeconds"]).toBe("600");
  });

  it("reports back the resolved set, including what it just wrote", () => {
    const live = stores();

    expect(savePreferences("showSeconds=0", from(live))).toBe(
      encodePreferences({ ...defaultPreferences(), showSeconds: false })
    );
  });

  it("lets a failing write reach the caller", () => {
    // The opposite of the read path: only the caller knows a preference did not stick.
    const live = stores();
    live.user.setProperties = () => {
      throw new Error("write quota exceeded");
    };

    expect(() => savePreferences("timerMuted=1", from(live))).toThrow("write quota exceeded");
  });
});
