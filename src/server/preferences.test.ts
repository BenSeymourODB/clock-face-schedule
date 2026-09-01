import { describe, expect, it, vi } from "vitest";

import { defaultPreferences, encodePreferences } from "../shared/preferences";
import {
  type PreferenceStoreSource,
  type PreferenceStores,
  type PropertyBag,
  deploymentPreferencesWire,
  preferencesWire,
  readDeploymentPreferences,
  readStoredPreferences,
  resetPreferences,
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
    },
    deleteProperty(key) {
      delete stored[key];
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
      setProperties: () => undefined,
      deleteProperty: () => undefined
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
      "showSeconds=0;timerMuted=0;timerDurationSeconds=300;showEventDurations=1;dialScale=12h"
    );
  });

  it("is the encoded defaults when nothing is stored", () => {
    expect(preferencesWire(from(stores()))).toBe(
      "showSeconds=1;timerMuted=0;timerDurationSeconds=300;showEventDurations=1;dialScale=12h"
    );
  });
});

/**
 * The layer a reset lands on, templated beside the resolved set so the client stops having to ask
 * (#157). Every assertion here is about the user store being absent from it — which is the whole of
 * what distinguishes it from `preferencesWire`, and what a copy-paste would silently undo.
 */
describe("the deployment's own wire form", () => {
  it("is the encoded defaults when nothing is stored anywhere", () => {
    expect(deploymentPreferencesWire(from(stores()))).toBe(
      "showSeconds=1;timerMuted=0;timerDurationSeconds=300;showEventDurations=1;dialScale=12h"
    );
  });

  it("takes the deployment's value from the script store", () => {
    expect(deploymentPreferencesWire(from(stores({}, { "pref.showSeconds": "0" })))).toBe(
      "showSeconds=0;timerMuted=0;timerDurationSeconds=300;showEventDurations=1;dialScale=12h"
    );
  });

  it("omits the viewer's own value even where it differs from the deployment's", () => {
    // The discriminating case, and the reason this function exists at all: `preferencesWire` says
    // 600 here and this one has to say 300, or a reset lands back on the value it was undoing.
    const live = from(
      stores({ "pref.timerDurationSeconds": "600" }, { "pref.timerDurationSeconds": "300" })
    );

    expect(preferencesWire(live)).toContain("timerDurationSeconds=600");
    expect(deploymentPreferencesWire(live)).toContain("timerDurationSeconds=300");
  });

  it("falls to the code default where the viewer's store is the only one holding a key", () => {
    const live = from(stores({ "pref.showSeconds": "0" }));

    expect(readDeploymentPreferences(live).showSeconds).toBe(true);
  });

  it("ignores a script property that is not under the preference prefix", () => {
    expect(readDeploymentPreferences(from(stores({}, { showSeconds: "0" }))).showSeconds).toBe(true);
  });

  it("falls through a corrupt deployment value to the code default", () => {
    // Same stance as the resolved path: a value this version no longer understands is rejected
    // rather than repaired, and a wall display renders with the wrong preference over not at all.
    expect(
      readDeploymentPreferences(from(stores({}, { "pref.timerDurationSeconds": "0" })))
        .timerDurationSeconds
    ).toBe(300);
  });

  it("returns the defaults, and says so, when reading the script store fails", () => {
    // `doGet` now reads twice on every page load, so this path has to be as forgiving as the other:
    // a throwing PropertiesService must cost a preference, not the whole display.
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const broken: PropertyBag = {
      getProperties: () => {
        throw new Error("read quota exceeded");
      },
      setProperties: () => undefined,
      deleteProperty: () => undefined
    };

    const resolved = readDeploymentPreferences(from({ user: broken, script: broken }));

    expect(resolved).toEqual(defaultPreferences());
    expect(logged).toHaveBeenCalledWith(expect.stringContaining("read quota exceeded"));
    logged.mockRestore();
  });

  it("returns the defaults when obtaining the stores fails at all", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const resolved = readDeploymentPreferences(() => {
      throw new Error("no effective user");
    });

    expect(resolved).toEqual(defaultPreferences());
    expect(logged).toHaveBeenCalledWith(expect.stringContaining("no effective user"));
    logged.mockRestore();
  });

  it("never reads the user store at all, so it cannot depend on one being there", () => {
    // Stronger than the value assertions above and the reason they can be trusted: a user bag that
    // throws on any access proves the deployment layer is computed without touching it.
    const exploding: PropertyBag = {
      getProperties: () => {
        throw new Error("the user store must not be read here");
      },
      setProperties: () => undefined,
      deleteProperty: () => undefined
    };

    const resolved = readDeploymentPreferences(
      from({ user: exploding, script: bag({ "pref.showSeconds": "0" }) })
    );

    expect(resolved.showSeconds).toBe(false);
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

    expect(savePreferences("", from(live))).toBe(
      "showSeconds=0;timerMuted=0;timerDurationSeconds=300;showEventDurations=1;dialScale=12h"
    );
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

/**
 * #83. Every case here is about the *layering*, not about the key going away: a store that only
 * forgets is not what was missing — what was missing is the deployment's own answer becoming
 * reachable again.
 */
describe("resetting", () => {
  it("restores the script store's value rather than the code default", () => {
    // The property the issue is actually about. Asserting only "the key is gone" would pass against
    // a reset that dropped the viewer through the deployment's layer to the code's.
    const live = stores({ "pref.showSeconds": "1" }, { "pref.showSeconds": "0" });

    expect(resetPreferences("showSeconds", from(live))).toBe(
      encodePreferences({ ...defaultPreferences(), showSeconds: false })
    );
  });

  it("lets a later change to the deployment's default reach a display that had stored the key", () => {
    // The scenario in the issue, end to end: the user store shadows the script store, the admin
    // changes the deployment's answer, and before this it was never picked up again.
    const live = stores({ "pref.timerDurationSeconds": "600" }, { "pref.timerDurationSeconds": "600" });
    expect(readStoredPreferences(from(live)).timerDurationSeconds).toBe(600);

    live.script.setProperties({ "pref.timerDurationSeconds": "1200" });
    expect(readStoredPreferences(from(live)).timerDurationSeconds).toBe(600);

    resetPreferences("timerDurationSeconds", from(live));

    expect(readStoredPreferences(from(live)).timerDurationSeconds).toBe(1200);
  });

  it("falls to the code default where the deployment has no answer either", () => {
    const live = stores({ "pref.timerMuted": "1" });

    expect(resetPreferences("timerMuted", from(live))).toBe(encodePreferences(defaultPreferences()));
  });

  it("deletes the prefixed key, and only that one", () => {
    const live = stores({ "pref.showSeconds": "0", "pref.timerMuted": "1" });

    resetPreferences("showSeconds", from(live));

    expect(live.user.stored).toEqual({ "pref.timerMuted": "1" });
  });

  it("leaves a property that is not under the preference prefix alone", () => {
    // The prefix is why the batched deletes `Properties` offers are unusable here: something else's
    // key sharing the store must survive a preference reset.
    const live = stores({ showSeconds: "0", "pref.showSeconds": "0" });

    resetPreferences("showSeconds", from(live));

    expect(live.user.stored).toEqual({ showSeconds: "0" });
  });

  it("never touches the script store, so a viewer cannot reset the deployment's own defaults", () => {
    const live = stores({ "pref.showSeconds": "0" }, { "pref.showSeconds": "0" });
    const deleted = vi.spyOn(live.script, "deleteProperty");

    resetPreferences("showSeconds;timerMuted;timerDurationSeconds", from(live));

    expect(deleted).not.toHaveBeenCalled();
    expect(live.script.stored).toEqual({ "pref.showSeconds": "0" });
  });

  it("deletes every key the wire names", () => {
    const live = stores({
      "pref.showSeconds": "0",
      "pref.timerMuted": "1",
      "pref.timerDurationSeconds": "600"
    });

    resetPreferences("showSeconds;timerDurationSeconds", from(live));

    expect(live.user.stored).toEqual({ "pref.timerMuted": "1" });
  });

  it("deletes nothing for an empty wire, so a dropped argument is harmless", () => {
    // The direction that matters: `savePreferences("")` writes nothing, and the reset path must not
    // read the same accidental argument as "everything".
    const live = stores({ "pref.showSeconds": "0" });
    const deleted = vi.spyOn(live.user, "deleteProperty");

    expect(resetPreferences("", from(live))).toBe(
      encodePreferences({ ...defaultPreferences(), showSeconds: false })
    );
    expect(deleted).not.toHaveBeenCalled();
  });

  it("deletes nothing when handed a patch wire instead of a key list", () => {
    const live = stores({ "pref.showSeconds": "0" });

    resetPreferences("showSeconds=0", from(live));

    expect(live.user.stored).toEqual({ "pref.showSeconds": "0" });
  });

  it("ignores a name the schema does not know", () => {
    const live = stores({ "pref.scaleMode": "1h", "pref.showSeconds": "0" });

    resetPreferences("scaleMode", from(live));

    expect(live.user.stored).toEqual({ "pref.scaleMode": "1h", "pref.showSeconds": "0" });
  });

  it("reports the resolved set back, as the save path does", () => {
    const live = stores({ "pref.showSeconds": "0", "pref.timerMuted": "1" });

    expect(resetPreferences("showSeconds", from(live))).toBe(
      encodePreferences({ ...defaultPreferences(), timerMuted: true })
    );
  });

  it("lets a failing delete reach the caller", () => {
    const live = stores({ "pref.showSeconds": "0" });
    live.user.deleteProperty = () => {
      throw new Error("write quota exceeded");
    };

    expect(() => resetPreferences("showSeconds", from(live))).toThrow("write quota exceeded");
  });
});

describe("resetting a key the store does not hold", () => {
  it("does not write, so a put-it-all-back costs one call and not three", () => {
    // The same stance as the save path's "a patch that survived nothing writes nothing". A reset
    // naming every key against a store holding one is the common case for a reset control.
    const live = stores({ "pref.timerMuted": "1" });
    const deleted = vi.spyOn(live.user, "deleteProperty");

    resetPreferences("showSeconds;timerMuted;timerDurationSeconds", from(live));

    expect(deleted).toHaveBeenCalledTimes(1);
    expect(deleted).toHaveBeenCalledWith("pref.timerMuted");
    expect(live.user.stored).toEqual({});
  });

  it("still reports the resolved set back", () => {
    const live = stores({}, { "pref.showSeconds": "0" });

    expect(resetPreferences("showSeconds", from(live))).toBe(
      encodePreferences({ ...defaultPreferences(), showSeconds: false })
    );
  });
});
