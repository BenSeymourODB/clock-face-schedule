import { describe, expect, it } from "vitest";

// The barrel, which a *spec* may reach for freely — the runtime cost this import carries is
// exactly what keeps it out of `preferences.ts` itself, and node has no bundle to protect.
import { DIAL_SCALES } from "./clock";

import {
  PREFERENCES,
  PREFERENCE_KEYS,
  type PreferenceKey,
  type Preferences,
  decodePreferenceKeys,
  decodePreferencePatch,
  decodePreferences,
  defaultPreferences,
  encodePreferenceKeys,
  encodePreferences,
  resolveOverride,
  resolvePreferences
} from "./preferences";

const DEFAULTS: Preferences = {
  showSeconds: true,
  timerMuted: false,
  timerDurationSeconds: 300,
  showEventDurations: true,
  dialScale: "12h"
};

describe("defaults", () => {
  it("are the values the display already renders with", () => {
    // showSeconds especially: main.ts has always passed `true`, so registering the preference must
    // not change what a viewer with nothing stored sees.
    expect(defaultPreferences()).toEqual(DEFAULTS);
  });

  it("hands back a fresh object each time, so a caller cannot mutate the schema", () => {
    const first = defaultPreferences();
    first.showSeconds = false;

    expect(defaultPreferences().showSeconds).toBe(true);
  });
});

describe("the registry itself", () => {
  it.each(PREFERENCE_KEYS)("names %s in the wire format's own alphabet", (key) => {
    // A key carrying `;` or `=` would split its own pair, and one carrying `<`, `>`, `&` or a quote
    // would need escaping in the attribute doGet templates it into.
    expect(key).toMatch(/^[A-Za-z][A-Za-z0-9]*$/);
  });

  it.each(PREFERENCE_KEYS)("gives %s a default its own parser accepts", (key) => {
    // Catches a range edited past its own default — the definition would then reject the value it
    // reports as unset, and every source would fall through to something nothing admits.
    const definition = PREFERENCES[key];
    const wire = encodePreferences({ [key]: definition.default } as Partial<Preferences>);

    expect(decodePreferencePatch(wire)).toEqual({ [key]: definition.default });
  });
});

describe("decoding a wire string", () => {
  it.each([
    ["showSeconds=0", { showSeconds: false }],
    ["showSeconds=1", { showSeconds: true }],
    ["timerMuted=1", { timerMuted: true }],
    ["timerDurationSeconds=60", { timerDurationSeconds: 60 }],
    ["timerDurationSeconds=43200", { timerDurationSeconds: 43200 }],
    ["showSeconds=0;timerMuted=1", { showSeconds: false, timerMuted: true }]
  ])("reads %s", (wire, expected) => {
    expect(decodePreferences(wire)).toEqual({ ...DEFAULTS, ...expected });
  });

  it.each([
    ["nothing at all", ""],
    ["null", null],
    ["undefined", undefined],
    ["a key with no value", "showSeconds"],
    ["a value with no key", "=0"],
    ["a separator on its own", ";"],
    ["an unknown key", "colourScheme=light"],
    ["a boolean spelled out", "showSeconds=false"],
    ["a boolean as a word", "showSeconds=yes"],
    ["an empty value", "showSeconds="],
    ["a fractional duration", "timerDurationSeconds=90.5"],
    ["a negative duration", "timerDurationSeconds=-60"],
    ["a duration below the one-minute floor", "timerDurationSeconds=59"],
    ["a duration past the twelve-hour ceiling", "timerDurationSeconds=43201"],
    ["a duration that is not a number", "timerDurationSeconds=soon"],
    ["a value carrying its own separator", "showSeconds=1=0"]
  ])("falls back to the defaults given %s", (_case, wire) => {
    expect(decodePreferences(wire)).toEqual(DEFAULTS);
  });

  it("keeps the valid pairs beside an unreadable one", () => {
    expect(decodePreferences("showSeconds=maybe;timerMuted=1")).toEqual({
      ...DEFAULTS,
      timerMuted: true
    });
  });

  it("takes the last of a repeated key", () => {
    expect(decodePreferences("showSeconds=1;showSeconds=0").showSeconds).toBe(false);
  });
});

describe("layering sources", () => {
  it("prefers the first source that has the key", () => {
    const resolved = resolvePreferences({ showSeconds: "0" }, { showSeconds: "1" });

    expect(resolved.showSeconds).toBe(false);
  });

  it("takes a later source's value where an earlier one is silent", () => {
    const resolved = resolvePreferences({}, { timerDurationSeconds: "600" });

    expect(resolved.timerDurationSeconds).toBe(600);
  });

  it("falls through an unparseable value to the next source rather than to the default", () => {
    // The case this signature exists for: a corrupt user value should land on the deployment's own
    // default, not skip past it. Both differ from the code default, so the assertion can tell.
    const resolved = resolvePreferences(
      { timerDurationSeconds: "twenty" },
      { timerDurationSeconds: "1200" }
    );

    expect(resolved.timerDurationSeconds).toBe(1200);
  });

  it("reaches the default when every source is unparseable", () => {
    const resolved = resolvePreferences(
      { timerDurationSeconds: "twenty" },
      { timerDurationSeconds: "0" }
    );

    expect(resolved.timerDurationSeconds).toBe(DEFAULTS.timerDurationSeconds);
  });
});

describe("encoding", () => {
  it("writes every key in registry order", () => {
    expect(encodePreferences(DEFAULTS)).toBe(
      "showSeconds=1;timerMuted=0;timerDurationSeconds=300;showEventDurations=1;dialScale=12h"
    );
  });

  it("writes only the keys it is given", () => {
    expect(encodePreferences({ timerMuted: true })).toBe("timerMuted=1");
  });

  it("orders by the registry rather than by the object it is handed", () => {
    const scrambled: Partial<Preferences> = { timerDurationSeconds: 600, showSeconds: false };

    expect(encodePreferences(scrambled)).toBe("showSeconds=0;timerDurationSeconds=600");
  });

  it("writes nothing at all for an empty set", () => {
    expect(encodePreferences({})).toBe("");
  });

  /**
   * Every value each definition can produce, keyed so that **a new preference cannot be registered
   * without extending this** — the mapped type fails to compile otherwise. That is the point: the
   * alphabet assertion below has to be a property of the registry rather than of a list of literals
   * somebody remembered to update.
   */
  const SAMPLES: { [K in PreferenceKey]: Array<Preferences[K]> } = {
    showSeconds: [true, false],
    timerMuted: [true, false],
    timerDurationSeconds: [60, 300, 43200],
    showEventDurations: [true, false],
    dialScale: ["12h", "1h"]
  };

  it.each(PREFERENCE_KEYS)("keeps %s in an attribute-safe alphabet, for every value", (key) => {
    // The load-bearing assertion behind templating this into `data-preferences` in Index.html: no
    // quote, angle bracket or ampersand can appear, whatever a definition encodes, so the value
    // needs no escaping and cannot break out of the attribute.
    for (const value of SAMPLES[key]) {
      const wire = encodePreferences({ [key]: value } as Partial<Preferences>);

      expect(wire).toMatch(/^[A-Za-z0-9;=]*$/);
      expect(wire).not.toBe("");
    }
  });

  it("keeps a whole encoded set in the same alphabet", () => {
    expect(encodePreferences(DEFAULTS)).toMatch(/^[A-Za-z0-9;=]*$/);
    expect(
      encodePreferences({ showSeconds: false, timerMuted: true, timerDurationSeconds: 43200 })
    ).toMatch(/^[A-Za-z0-9;=]*$/);
  });

  it.each([
    ["the defaults", DEFAULTS],
    [
      "everything switched",
      {
        showSeconds: false,
        timerMuted: true,
        timerDurationSeconds: 1800,
        showEventDurations: false,
        dialScale: "1h" as const
      }
    ],
    [
      "the range's ends",
      {
        showSeconds: true,
        timerMuted: true,
        timerDurationSeconds: 60,
        showEventDurations: true,
        dialScale: "12h" as const
      }
    ]
  ])("round-trips %s through a wire string", (_case, values) => {
    expect(decodePreferences(encodePreferences(values))).toEqual(values);
  });
});

/**
 * #178's `?durations=` override: a URL layer beats the stored value where it parses, and falls
 * through where it does not. Asserted here, in node, rather than only inside `main.ts` where
 * `window.location` cannot be reached — and now shared with `?scale=`, which resolves identically
 * since #85 gave the scale a stored value for the parameter to override.
 */
describe("resolveOverride", () => {
  const flagDef = PREFERENCES.showEventDurations;

  it("takes the first layer that parses, ahead of the stored value", () => {
    // Stored true, the URL says 0 — the override wins, which is the whole reason it exists.
    expect(resolveOverride(flagDef, ["0"], true)).toBe(false);
    expect(resolveOverride(flagDef, ["1"], false)).toBe(true);
  });

  it("prefers an earlier layer to a later one", () => {
    // The templated attribute (what doGet saw) ahead of the page's own query string.
    expect(resolveOverride(flagDef, ["1", "0"], false)).toBe(true);
  });

  it.each([
    ["empty", ""],
    ["absent (null)", null],
    ["absent (undefined)", undefined],
    ["unparseable", "yes"]
  ])("falls through a %s layer to the stored value", (_case, layer) => {
    // The stored value is what a stripped preview attribute, an omitted parameter, and a garbled one
    // all land on — never the registry default, and never a repair.
    expect(resolveOverride(flagDef, [layer], true)).toBe(true);
    expect(resolveOverride(flagDef, [layer], false)).toBe(false);
  });

  it("skips an unparseable layer to reach a valid one behind it", () => {
    expect(resolveOverride(flagDef, ["yes", "0"], true)).toBe(false);
  });

  it("returns the stored value when no layer resolves", () => {
    expect(resolveOverride(flagDef, ["", null, undefined], true)).toBe(true);
  });
});

/**
 * The dial's scale as a stored setting (#85), and the precedence half of its rule: `?scale=` wins,
 * the store answers when it is absent. The other half — that only *pressing* the switch writes —
 * is `main.ts`'s and cannot be reached from here; it is asserted at the wire in `preferences.ts`'s
 * client spec and stated in this definition's own docstring.
 */
describe("the dial scale", () => {
  const scale = PREFERENCES.dialScale;

  it("opens on the 12-hour dial when nothing is stored, as the renderer already did", () => {
    expect(scale.default).toBe("12h");
  });

  it.each([
    ["?scale=1h over a stored 12h", "1h", "12h", "1h"],
    ["?scale=12h over a stored 1h", "12h", "1h", "12h"],
  ])("lets the URL win: %s", (_case, layer, stored, expected) => {
    expect(resolveOverride(scale, [layer], stored as never)).toBe(expected);
  });

  it.each([
    ["absent", null],
    ["empty, which is a stripped preview attribute", ""],
    ["a scale that does not exist", "30m"],
    ["the id in the wrong case", "1H"],
  ])("falls through a %s parameter to what was last pressed", (_case, layer) => {
    // Never repaired to the default: `parseDialScaleId` answers `12h` for all four of these, which
    // is right for a URL nobody can correct and would here overrule a setting the teacher chose.
    expect(resolveOverride(scale, [layer], "1h" as never)).toBe("1h");
  });

  it("stores as the spelling the URL uses, so one parser serves both", () => {
    // `?scale=1h` and a stored `1h` are the same string read by the same definition. A second
    // spelling on the wire is how a value the store accepts and one the URL accepts come apart.
    expect(encodePreferences({ dialScale: "1h" })).toBe("dialScale=1h");
    expect(decodePreferences("dialScale=1h").dialScale).toBe("1h");
  });

  /**
   * `shared/preferences.ts` restates the scale ids rather than reading `DIAL_SCALES`, because
   * reaching `shared/clock` at runtime would pull the geometry layer's emoji tables into the server
   * bundle — the trap `shared/clock/index.ts` records, and the reason `doGet` leaves `?scale=`
   * unparsed. This is what stops the two lists drifting: a third scale added to `DIAL_SCALES` fails
   * here until the preference accepts it too, which is the direction that matters — a scale the
   * dial can draw and the store silently rejects is a switch position that will not stick.
   */
  it("accepts exactly the scales the dial has", () => {
    const accepted = Object.keys(DIAL_SCALES).filter((id) => scale.parse(id) !== undefined);

    expect(accepted).toEqual(Object.keys(DIAL_SCALES));
  });
});

describe("a patch", () => {
  it("carries only the keys present in the wire", () => {
    expect(decodePreferencePatch("timerMuted=1")).toEqual({ timerMuted: true });
  });

  it("is empty for an empty wire, so a save writes nothing", () => {
    expect(decodePreferencePatch("")).toEqual({});
  });

  it("drops what it cannot parse rather than defaulting it", () => {
    // Defaulting here would turn a garbled write into a deliberate-looking one: the store would end
    // up holding a value the client never sent.
    expect(decodePreferencePatch("timerDurationSeconds=0;timerMuted=1")).toEqual({
      timerMuted: true
    });
  });

  it("ignores keys it does not recognise", () => {
    expect(decodePreferencePatch("scaleMode=1h")).toEqual({});
  });
});

/** #83's wire: a reset names keys, so it needs a format the patch path cannot be mistaken for. */
describe("a key list", () => {
  it("carries the names it was given", () => {
    expect(encodePreferenceKeys(["timerMuted"])).toBe("timerMuted");
  });

  it("is written in registry order, whatever order it was given in", () => {
    expect(encodePreferenceKeys(["timerDurationSeconds", "showSeconds"])).toBe(
      "showSeconds;timerDurationSeconds"
    );
  });

  it("names a repeated key once", () => {
    expect(encodePreferenceKeys(["timerMuted", "timerMuted"])).toBe("timerMuted");
  });

  it("is empty for no keys, so a reset with nothing to do deletes nothing", () => {
    expect(encodePreferenceKeys([])).toBe("");
    expect(decodePreferenceKeys("")).toEqual([]);
  });

  it.each([
    ["null", null],
    ["undefined", undefined]
  ])("names nothing for %s", (_case, wire) => {
    expect(decodePreferenceKeys(wire)).toEqual([]);
  });

  it("round-trips every key there is", () => {
    expect(decodePreferenceKeys(encodePreferenceKeys(PREFERENCE_KEYS))).toEqual(PREFERENCE_KEYS);
  });

  it("drops a name the registry does not know", () => {
    expect(decodePreferenceKeys("scaleMode;timerMuted")).toEqual(["timerMuted"]);
  });

  it("reads in registry order and without repeats, whatever the wire says", () => {
    expect(decodePreferenceKeys("timerMuted;timerDurationSeconds;timerMuted;showSeconds")).toEqual([
      "showSeconds",
      "timerMuted",
      "timerDurationSeconds"
    ]);
  });

  /**
   * The safety property the two formats are worth having rather than merely observing: neither can
   * be read as the other, so `resetPreferences(patchWire)` deletes nothing and
   * `savePreferences(keysWire)` writes nothing. A reset that silently deleted whatever a misrouted
   * patch happened to name is the failure this closes.
   */
  it("names nothing when handed a patch wire", () => {
    expect(decodePreferenceKeys("showSeconds=0;timerMuted=1")).toEqual([]);
  });

  it("is read as an empty patch, so a misrouted key list writes nothing", () => {
    expect(decodePreferencePatch(encodePreferenceKeys(PREFERENCE_KEYS))).toEqual({});
  });

  it("stays in the attribute-safe alphabet the patch format keeps", () => {
    expect(encodePreferenceKeys(PREFERENCE_KEYS)).toMatch(/^[A-Za-z0-9;=]*$/);
  });
});
