/**
 * The viewer's preferences, as the display sees them.
 *
 * Read off the mount element, where `doGet` templated them (#31), so nothing on the first paint
 * waits for a round trip — ADR 0006 prices one at 0.5–2 s, and a preference arriving after the dial
 * has drawn means drawing it twice.
 *
 * Writes go the other way, over `google.script.run`, and nothing on screen waits for those either:
 * a save that fails costs the next reload's memory of a setting, which is not worth interrupting a
 * lesson over. The store applies the change locally regardless, so the display is never out of step
 * with the control the viewer just used.
 *
 * Known limit, filed as #84: two saves fired in quick succession can land out of order, leaving the
 * store holding the earlier value. Unfixed here deliberately — the remedy (a single-flight queue, a
 * per-key debounce, or both) needs `save` to report completion, and belongs with the first control
 * that can actually fire twice in a second (#47's duration field).
 */
import {
  type Preferences,
  decodePreferencePatch,
  decodePreferences,
  encodePreferences
} from "../shared/preferences";

export interface PreferenceStore {
  /** The preferences in effect. A copy: the store's own state is not handed out. */
  get(): Preferences;
  /** Apply and persist some preferences, ignoring any the schema rejects. */
  set(patch: Partial<Preferences>): void;
}

export interface PreferenceStoreOptions {
  /**
   * The wire string `doGet` templated in. Empty or absent means nothing is stored — which is the
   * normal case in the local preview, where no server ran at all.
   */
  wire?: string | null;
  /** Persists a wire patch. Called and not awaited. */
  save: (wire: string) => void;
}

/**
 * The templated wire string, from the element the dial mounts into.
 *
 * `data-preferences` — the same path `data-demo` already takes. The attribute name is spelled out
 * here rather than assembled, so a search for it finds both this and `Index.html`.
 */
export function readPreferenceWire(mount: Element | null | undefined): string | null {
  if (!(mount instanceof HTMLElement)) return null;
  const wire = mount.dataset["preferences"];
  return wire === undefined ? null : wire;
}

export function preferenceStore({ wire, save }: PreferenceStoreOptions): PreferenceStore {
  let values = decodePreferences(wire);

  return {
    get: () => ({ ...values }),

    set(patch) {
      // Round-tripped through the wire format, which is by definition what the server will accept.
      // Without this a value the schema rejects would sit in memory looking stored, and the display
      // would disagree with the store until the next reload resolved it the other way.
      const accepted = decodePreferencePatch(encodePreferences(patch));
      if (Object.keys(accepted).length === 0) return;

      values = { ...values, ...accepted };
      save(encodePreferences(accepted));
    }
  };
}
