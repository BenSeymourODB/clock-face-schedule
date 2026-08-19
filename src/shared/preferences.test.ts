import { describe, expect, it } from "vitest";

import {
  PREFERENCES,
  PREFERENCE_KEYS,
  type Preferences,
  decodePreferencePatch,
  decodePreferences,
  defaultPreferences,
  encodePreferences,
  resolvePreferences
} from "./preferences";

const DEFAULTS: Preferences = {
  showSeconds: true,
  timerMuted: false,
  timerDurationSeconds: 300
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
    expect(encodePreferences(DEFAULTS)).toBe("showSeconds=1;timerMuted=0;timerDurationSeconds=300");
  });

  it("writes only the keys it is given", () => {
    expect(encodePreferences({ timerMuted: true })).toBe("timerMuted=1");
  });

  it("orders by the registry rather than by the object it is handed", () => {
    const scrambled: Partial<Preferences> = { timerDurationSeconds: 600, showSeconds: false };

    expect(encodePreferences(scrambled)).toBe("showSeconds=0;timerDurationSeconds=600");
  });

  it.each([
    ["the defaults", DEFAULTS],
    ["the other end of every value", { showSeconds: false, timerMuted: true, timerDurationSeconds: 43200 }],
    ["the floor of the numeric range", { ...DEFAULTS, timerDurationSeconds: 60 }],
    ["nothing", {}]
  ])("stays in an attribute-safe alphabet for %s", (_case, values) => {
    // The load-bearing assertion behind templating this into `data-preferences` in Index.html: no
    // quote, angle bracket or ampersand can appear, whatever a definition encodes, so the value
    // needs no escaping and cannot break out of the attribute.
    expect(encodePreferences(values)).toMatch(/^[A-Za-z0-9;=]*$/);
  });

  it.each([
    ["the defaults", DEFAULTS],
    ["everything switched", { showSeconds: false, timerMuted: true, timerDurationSeconds: 1800 }],
    ["the range's ends", { showSeconds: true, timerMuted: true, timerDurationSeconds: 60 }]
  ])("round-trips %s through a wire string", (_case, values) => {
    expect(decodePreferences(encodePreferences(values))).toEqual(values);
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
