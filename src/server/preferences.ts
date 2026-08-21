/**
 * The preference store: `PropertiesService`, read on every page load and written on demand.
 *
 * Server-side because nothing in the browser is durable here — the page's origin rotates between
 * sessions, so cookies and `localStorage` outlive nothing (see the platform constraints in
 * docs/DESIGN.md, and issue #31). `getUserProperties()` is scoped to the *effective* user, and the
 * deployment runs `executeAs: USER_ACCESSING`, so each visitor keeps their own settings and no
 * visitor can read or clobber another's.
 *
 * Every decision about what a preference means lives in `shared/preferences.ts`, which this file
 * only stores and retrieves — so a value written by the client is validated against the same
 * definition the client encoded it with.
 */
import {
  PREFERENCE_KEYS,
  type PreferenceSource,
  type Preferences,
  decodePreferenceKeys,
  decodePreferencePatch,
  defaultPreferences,
  encodePreferenceValue,
  encodePreferences,
  resolvePreferences
} from "../shared/preferences";

/**
 * Property keys are prefixed, so preferences can share a store with anything else that ever wants
 * one without either reading the other's keys as its own.
 */
const PROPERTY_PREFIX = "pref.";

/**
 * The slice of `Properties` this file uses. Structural rather than the Apps Script type so the
 * tests can hand in a plain object — nothing here needs a live store to be worth testing, and the
 * fallback paths below are precisely the ones a live store would make awkward to reach.
 */
export interface PropertyBag {
  getProperties(): { [key: string]: string };
  /** Merges: `Properties.setProperties` only clears absent keys when told to, which it never is. */
  setProperties(properties: { [key: string]: string }): unknown;
  /**
   * One key at a time, which is the only delete this file can safely use. Of the two batched forms
   * `Properties` offers, `deleteAllProperties` reaches past the prefix into whatever else shares the
   * store — exactly what the prefix exists to prevent — and `setProperties(kept, true)` is a
   * read-modify-write over the whole store, so it rewrites every unrelated property and loses any
   * concurrent write from another execution.
   */
  deleteProperty(key: string): unknown;
}

export interface PreferenceStores {
  /** The accessing user's own overrides. */
  user: PropertyBag;
  /** Deployment-wide defaults, which a forked school instance would set once. */
  script: PropertyBag;
}

/**
 * How the stores are obtained, rather than the stores themselves.
 *
 * Deliberately a factory: `PropertiesService.getUserProperties()` can itself fail, and a default
 * *parameter* would evaluate outside `readStoredPreferences`'s own `try` — leaving the one guarantee
 * that matters (see below) covering only failures inside `getProperties`, and untestable at that.
 */
export type PreferenceStoreSource = () => PreferenceStores;

const propertiesServiceStores: PreferenceStoreSource = () => ({
  user: PropertiesService.getUserProperties(),
  script: PropertiesService.getScriptProperties()
});

/** One store's prefixed properties, reduced to the bare preference names the schema knows. */
function sourceOf(bag: PropertyBag): PreferenceSource {
  const properties = bag.getProperties();
  const source: PreferenceSource = {};

  for (const key of PREFERENCE_KEYS) {
    const stored = properties[PROPERTY_PREFIX + key];
    if (stored !== undefined) source[key] = stored;
  }
  return source;
}

function resolveFrom(stores: PreferenceStores): Preferences {
  return resolvePreferences(sourceOf(stores.user), sourceOf(stores.script));
}

/**
 * Every preference, the user's own store taking precedence over the deployment's.
 *
 * **Never throws, including from acquiring the stores.** `doGet` calls this on every page load, so
 * a `PropertiesService` failure here would take the whole display down over settings nobody had
 * set — and a dial drawn with default preferences is a working dial. Same reasoning as ADR 0006's
 * stale-but-rendered payload.
 */
export function readStoredPreferences(
  acquire: PreferenceStoreSource = propertiesServiceStores
): Preferences {
  try {
    return resolveFrom(acquire());
  } catch (error) {
    console.error(`preferences unreadable, using defaults — ${(error as Error).message}`);
    return defaultPreferences();
  }
}

/** The resolved preferences in wire form, for `doGet` to template into the page. */
export function preferencesWire(acquire?: PreferenceStoreSource): string {
  return encodePreferences(readStoredPreferences(acquire));
}

/**
 * Persist the preferences a wire string carries, and report the resolved set back.
 *
 * Called from the browser, so the argument is untrusted: it is parsed against the schema and each
 * accepted value **re-encoded** before storage, which leaves no path for a client string to reach
 * the store verbatim. Unknown keys, malformed values and out-of-range numbers are dropped.
 *
 * Only the keys present are written, for the reason `decodePreferencePatch` gives, and only to the
 * user store — the script store is the deployment's own defaults. One batched `setProperties` call
 * rather than one per key, since write quota is per call.
 *
 * Unlike the read path this does not swallow failures: a write that hits a quota should reach the
 * caller, which is the only party that knows a preference did not stick.
 */
export function savePreferences(
  patchWire: string,
  acquire: PreferenceStoreSource = propertiesServiceStores
): string {
  const stores = acquire();
  const patch = decodePreferencePatch(patchWire);
  const properties: { [key: string]: string } = {};

  for (const key of PREFERENCE_KEYS) {
    const value = patch[key];
    if (value === undefined) continue;
    properties[PROPERTY_PREFIX + key] = encodePreferenceValue(key, value);
  }

  // A patch that survived nothing writes nothing, rather than an empty batch call.
  if (Object.keys(properties).length > 0) stores.user.setProperties(properties);

  // Re-read rather than assemble the answer from the patch: the point of echoing is to report what
  // the store now holds, which is also what the `?check=1` row is checking.
  return encodePreferences(resolveFrom(stores));
}

/**
 * Remove the preferences a key wire names from the user's own store, and report the resolved set
 * back.
 *
 * Without this the user store is append-only in effect (#83): once a key is in it, that display has
 * left the deployment's own default behind permanently, and the script store is precisely the
 * mechanism #31 describes for institution defaults. The same applies to the code defaults, which
 * this project retunes on measurement.
 *
 * Only the user store is touched, for the reason `savePreferences` gives — the script store holds
 * the deployment's answer, and a viewer resetting their own settings must not reset the school's.
 * What a reset lands on is therefore the *next* layer down, not necessarily the code default.
 *
 * Unbatched where the save path batches "write quota is per call", because neither batched delete
 * `Properties` offers is usable here — see `PropertyBag.deleteProperty`. The call count is bounded by
 * the registry rather than by the request, and a reset is a deliberate act performed once rather
 * than a control held down. A key the store does not hold is skipped rather than deleted, which is
 * the same stance as the save path's "a patch that survived nothing writes nothing": the common case
 * — a "put it all back" naming every key against a store holding one — costs one write, not three.
 *
 * Like the save path and unlike the read path, a failure reaches the caller: only the caller knows
 * a preference did not go away.
 */
export function resetPreferences(
  keysWire: string,
  acquire: PreferenceStoreSource = propertiesServiceStores
): string {
  const stores = acquire();
  const held = stores.user.getProperties();

  for (const key of decodePreferenceKeys(keysWire)) {
    const property = PROPERTY_PREFIX + key;
    if (held[property] !== undefined) stores.user.deleteProperty(property);
  }
  return encodePreferences(resolveFrom(stores));
}
