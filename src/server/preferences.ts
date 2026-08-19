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
  setProperty(key: string, value: string): unknown;
}

export interface PreferenceStores {
  /** The accessing user's own overrides. */
  user: PropertyBag;
  /** Deployment-wide defaults, which a forked school instance would set once. */
  script: PropertyBag;
}

function propertiesServiceStores(): PreferenceStores {
  return {
    user: PropertiesService.getUserProperties(),
    script: PropertiesService.getScriptProperties()
  };
}

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

/**
 * Every preference, the user's own store taking precedence over the deployment's.
 *
 * Never throws. `doGet` calls this on every page load, so a `PropertiesService` failure here would
 * take the whole display down over settings nobody had set — and a dial drawn with default
 * preferences is a working dial. Same reasoning as ADR 0006's stale-but-rendered payload.
 */
export function readStoredPreferences(
  stores: PreferenceStores = propertiesServiceStores()
): Preferences {
  try {
    return resolvePreferences(sourceOf(stores.user), sourceOf(stores.script));
  } catch (error) {
    console.error(`preferences unreadable, using defaults — ${(error as Error).message}`);
    return defaultPreferences();
  }
}

/** The resolved preferences in wire form, for `doGet` to template into the page. */
export function preferencesWire(stores?: PreferenceStores): string {
  return encodePreferences(readStoredPreferences(stores));
}

/**
 * Persist the preferences a wire string carries, and report the resolved set back.
 *
 * Called from the browser, so it treats its argument as untrusted: the patch is parsed against the
 * schema and each accepted value is **re-encoded** before it is stored, which leaves no path for a
 * client string to reach the store verbatim. An unknown key, a malformed value or a number outside
 * its range is dropped rather than written.
 *
 * Only the keys present are touched. A client sending one preference must not overwrite the others,
 * or a second tab holding stale values would undo whatever the first one changed.
 *
 * Writes go to the user store only — the script store is the deployment's defaults, and a viewer
 * changing their own settings has no business editing those.
 *
 * Unlike the read path this does not swallow failures: a write that hits a quota should reach the
 * caller, which is the only party that knows a preference did not stick.
 */
export function savePreferences(
  patchWire: string,
  stores: PreferenceStores = propertiesServiceStores()
): string {
  const patch = decodePreferencePatch(patchWire);

  for (const key of PREFERENCE_KEYS) {
    const value = patch[key];
    if (value === undefined) continue;
    stores.user.setProperty(PROPERTY_PREFIX + key, encodePreferenceValue(key, value));
  }

  return preferencesWire(stores);
}
