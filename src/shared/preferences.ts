/**
 * What a viewer can change, and what it is when they have not.
 *
 * The page runs on an ephemeral `googleusercontent.com` origin that rotates between sessions, so
 * cookies and `localStorage` are a cache with an unpredictable lifetime rather than storage — see
 * the platform constraints in docs/DESIGN.md, and issue #31. Preferences live in
 * `PropertiesService` instead, which puts the *store* server-side and leaves the *schema* here:
 * this module is the only place that knows what a preference is called, which values it admits,
 * and what it is when unset.
 *
 * Pure, so the same definitions run under node, in the browser, and inside Apps Script. The server
 * validates a write with the definition the client encoded it from, so the two cannot drift.
 */

/**
 * One preference.
 *
 * `parse` returns `undefined` for anything it does not recognise rather than throwing, and rejects
 * rather than repairs: the store is a bag of strings that some earlier version of this code wrote,
 * and a value this one no longer understands has to fall back to something valid. A wall display
 * must render with the wrong preference rather than not render.
 */
export interface PreferenceDefinition<T> {
  readonly default: T;
  parse(raw: string): T | undefined;
  encode(value: T): string;
}

const ENCODED_TRUE = "1";
const ENCODED_FALSE = "0";

function flag(defaultValue: boolean): PreferenceDefinition<boolean> {
  return {
    default: defaultValue,
    parse: (raw) => (raw === ENCODED_TRUE ? true : raw === ENCODED_FALSE ? false : undefined),
    encode: (value) => (value ? ENCODED_TRUE : ENCODED_FALSE)
  };
}

/**
 * A whole number within an inclusive range. Anything else — a fraction, a sign, a value past an
 * end — is not clamped into range but rejected, so it falls through to the next source rather than
 * being silently accepted as though someone had chosen it.
 */
function wholeNumber(
  defaultValue: number,
  min: number,
  max: number
): PreferenceDefinition<number> {
  return {
    default: defaultValue,
    parse: (raw) => {
      if (!/^[0-9]+$/.test(raw)) return undefined;
      const value = Number(raw);
      return value >= min && value <= max ? value : undefined;
    },
    encode: (value) => String(value)
  };
}

const MINUTE_SECONDS = 60;
const TWELVE_HOURS_SECONDS = 12 * 60 * 60;

/**
 * Every preference there is. Insertion order is the wire order, which makes an encoded string
 * deterministic and therefore comparable in a test.
 *
 * Deliberately short. A key here is a promise that something reads it, so #46's timer display mode,
 * #48's readout and #34's scale mode are registered by those issues rather than guessed at now;
 * a colour-scheme override waits on a light palette that clears contrast (see #27's table).
 */
export const PREFERENCES = {
  /**
   * The second hand. `main.ts` has always passed `true`, so that is the default here and
   * registering it moves nothing until something is stored. Safe to persist in ADR 0008's sense:
   * the hand is plainly present or absent, and nothing else on the dial changes meaning without it.
   *
   * Note `analogClock`'s own parameter defaults to `false` — the ported default, for a builder whose
   * caller is expected to say. This is the display's answer, and `main.ts` has to pass it explicitly.
   */
  showSeconds: flag(true),

  /**
   * #45's completion cue, which is gentle by default and mutable — so unmuted by default, and muting
   * must leave the timer working rather than degrade it. `playCompletionCue({ muted })` already
   * takes it; #47 is where a viewer will set it.
   */
  timerMuted: flag(false),

  /**
   * The last duration a teacher set, so #47's field opens pre-populated — the one interaction in
   * this app performed under time pressure.
   *
   * The range is the invented number here: a floor of one minute because the timer's encoding is
   * one band per minute, and a ceiling of twelve hours because that is the dial's own period. The
   * class-timer brainstorm's presets (1/2/5/10/20 minutes) all sit inside it.
   */
  timerDurationSeconds: wholeNumber(5 * MINUTE_SECONDS, MINUTE_SECONDS, TWELVE_HOURS_SECONDS),

  /**
   * Whether any surface states how long an event is (#178).
   *
   * One setting rather than four gates. Today an arc states a length when `fitDurationLine` clears
   * it, a floating card when the collision pass can afford the line and the panel card always — so
   * 16.6% of arcs state one on the band, 36.6% state one *anywhere on the dial* once their cards are
   * counted, and **every one of 192 pinned states is mixed**. A viewer cannot recover that rule,
   * because there is no rule: there are four pieces of geometry running out of room.
   *
   * `true`, so an unconfigured board changes nothing but the consistency. That direction matters
   * here more than for any other key: ADR 0008's hazard is a mode nobody knows was changed, and an
   * absent duration is indistinguishable from one that did not fit — which is the display's own
   * defect seen from the other side. The visible switch waits on the top bar (#85, #47); until then
   * `?durations=` is the control, and it speaks this definition's own alphabet rather than a second
   * one.
   */
  showEventDurations: flag(true)
};

/**
 * Resolve a preference the way a URL parameter overrides a stored value (#178): the first `layer`
 * that parses wins, and if none does the `stored` value stands.
 *
 * This is the inverse of how `chosenScale` treats `?scale=`, and deliberately. There the parameter
 * *is* the setting, so a stored/templated value winning stops a deployed URL being overridden by the
 * sandbox iframe's own query string. Here the setting is the stored preference and the parameter is
 * a teacher checking an override on the device — so the parameter has to win, but only where it is
 * present and valid. An empty or unrecognised layer falls *through* to `stored` rather than being
 * repaired, which is `resolvePreferences`' own rule applied to one preference across raw layers.
 *
 * Pure and shared so the precedence is asserted once, in node, rather than inside the entry file
 * that reads `window.location` — the one place it cannot be unit-tested.
 */
export function resolveOverride<T>(
  definition: PreferenceDefinition<T>,
  layers: readonly (string | null | undefined)[],
  stored: T
): T {
  for (const raw of layers) {
    // Empty is absent: a stripped `data-durations="<?= durationsParam ?>"` leaves the attribute.
    if (raw === undefined || raw === null || raw === "") continue;

    const parsed = definition.parse(raw);
    if (parsed !== undefined) return parsed;
  }
  return stored;
}

type PreferenceValue<D> = D extends PreferenceDefinition<infer T> ? T : never;

export type PreferenceKey = keyof typeof PREFERENCES;

export type Preferences = {
  [K in PreferenceKey]: PreferenceValue<(typeof PREFERENCES)[K]>;
};

export const PREFERENCE_KEYS = Object.keys(PREFERENCES) as PreferenceKey[];

/** A bag of stored strings keyed by preference name — one layer of `resolvePreferences`. */
export type PreferenceSource = { [key: string]: string | undefined };

const PAIR_SEPARATOR = ";";
const VALUE_SEPARATOR = "=";

/**
 * The registry is heterogeneous — a boolean definition beside a numeric one — so walking it needs
 * one widening. Method parameters are bivariant, which is what makes this sound enough to confine
 * to these two helpers while every caller stays typed.
 */
function definitionOf(key: PreferenceKey): PreferenceDefinition<unknown> {
  return PREFERENCES[key];
}

function assign(target: Partial<Preferences>, key: PreferenceKey, value: unknown): void {
  (target as { [key: string]: unknown })[key] = value;
}

/**
 * Split a wire string into raw pairs, without judging any of them — resolution does the validating.
 * Unrecognised keys survive this step and are dropped there; a repeated key takes its last value.
 */
function readWire(wire: string | null | undefined): PreferenceSource {
  const raw: PreferenceSource = {};
  if (!wire) return raw;

  for (const entry of wire.split(PAIR_SEPARATOR)) {
    const split = entry.indexOf(VALUE_SEPARATOR);
    // `split === 0` is a pair with no key at all, which is not one.
    if (split <= 0) continue;
    raw[entry.slice(0, split)] = entry.slice(split + 1);
  }
  return raw;
}

export function defaultPreferences(): Preferences {
  const values: Partial<Preferences> = {};
  for (const key of PREFERENCE_KEYS) assign(values, key, definitionOf(key).default);
  return values as Preferences;
}

/**
 * One value per key, taking `sources` **most specific first** — the user's own store before the
 * deployment's defaults.
 *
 * A source whose value does not parse is fallen *through* rather than deferred to: a corrupt user
 * value lands on the institution's default rather than skipping past it to the code's. Which is the
 * only reason this takes a list instead of a merged object.
 */
export function resolvePreferences(...sources: PreferenceSource[]): Preferences {
  const values: Partial<Preferences> = {};

  for (const key of PREFERENCE_KEYS) {
    const definition = definitionOf(key);
    let resolved = definition.default;

    for (const source of sources) {
      const raw = source[key];
      if (raw === undefined) continue;

      const parsed = definition.parse(raw);
      if (parsed !== undefined) {
        resolved = parsed;
        break;
      }
    }
    assign(values, key, resolved);
  }
  return values as Preferences;
}

/** Every preference, resolved from one wire string over the defaults. */
export function decodePreferences(wire: string | null | undefined): Preferences {
  return resolvePreferences(readWire(wire));
}

/**
 * Only the preferences a wire string actually carries, and only where they parse.
 *
 * The save path wants this rather than a full set: a client that sends one key must not write the
 * other two, or a second tab holding stale values would clobber them.
 */
export function decodePreferencePatch(wire: string | null | undefined): Partial<Preferences> {
  const raw = readWire(wire);
  const patch: Partial<Preferences> = {};

  for (const key of PREFERENCE_KEYS) {
    const stored = raw[key];
    if (stored === undefined) continue;

    const parsed = definitionOf(key).parse(stored);
    if (parsed !== undefined) assign(patch, key, parsed);
  }
  return patch;
}

/**
 * One preference's stored form — the value half of a wire pair, which is also what a single
 * property in the server's store holds.
 */
export function encodePreferenceValue<K extends PreferenceKey>(
  key: K,
  value: Preferences[K]
): string {
  return definitionOf(key).encode(value);
}

/**
 * The wire form of some or all preferences, in registry order.
 *
 * Every value comes from a definition's own `encode`, so the alphabet is closed and contains
 * nothing HTML-special — which is what lets `doGet` template the result straight into an attribute
 * on the mount element. `preferences.test.ts` asserts that closure rather than trusting it.
 */
export function encodePreferences(values: Partial<Preferences>): string {
  const pairs: string[] = [];

  for (const key of PREFERENCE_KEYS) {
    const value = values[key];
    if (value === undefined) continue;
    pairs.push(`${key}${VALUE_SEPARATOR}${encodePreferenceValue(key, value)}`);
  }
  return pairs.join(PAIR_SEPARATOR);
}

/**
 * The wire form of a *set of preference names* — what a reset carries, since it names keys rather
 * than values (#83). Separated by the same `;` the patch format puts between pairs, and in registry
 * order, so the result is deterministic and therefore comparable in a test.
 *
 * Deliberately not expressible as a patch, and vice versa: `readWire` drops any entry with no `=`,
 * and no `key=value` pair is itself a registry key. So sending one format where the other is
 * expected names nothing and writes nothing, rather than doing something adjacent to what was meant.
 *
 * The filter is for order and repeats — the type already closes the set of names a caller can pass.
 */
export function encodePreferenceKeys(keys: readonly PreferenceKey[]): string {
  return PREFERENCE_KEYS.filter((key) => keys.indexOf(key) !== -1).join(PAIR_SEPARATOR);
}

/**
 * The preferences a reset wire names, in registry order and without repeats. Names the registry does
 * not know are dropped, as they are on the patch path — this argument arrives from the browser.
 *
 * An empty wire names nothing, so it resets nothing. That direction is the deliberate one: the
 * argument a caller reaches by accident must be the harmless one, and a full reset is every key
 * named explicitly.
 */
export function decodePreferenceKeys(wire: string | null | undefined): PreferenceKey[] {
  if (!wire) return [];

  const named = wire.split(PAIR_SEPARATOR);
  return PREFERENCE_KEYS.filter((key) => named.indexOf(key) !== -1);
}
