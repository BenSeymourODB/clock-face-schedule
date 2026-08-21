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
 * Those writes are **single-flight** (#84). Two `google.script.run` calls are independent
 * executions and Apps Script promises nothing about the order they finish in, so firing both leaves
 * the store holding whichever landed last — and a reload then silently reverts what the viewer set.
 * At most one save is in flight; changes made meanwhile are held, coalesced per key, and sent when
 * it settles. Ordering is total because there is only ever one writer.
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
  /**
   * Persists a wire patch, and reports when the write is over.
   *
   * The return value is what makes the queue possible, so it is required rather than optional: a
   * `save` that reported nothing would silently restore the racing behaviour #84 describes, and a
   * required return type is the only thing that catches that at build time. Resolve or reject as
   * the write did — the store treats both as "over" and drains regardless, so a rejected save
   * costs its own value and not the ones behind it.
   */
  save: (wire: string) => PromiseLike<unknown>;
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

  /** Whether a save is with the server. The queue's only state that is not the queue. */
  let saving = false;

  /**
   * Changes made while a save was in flight, merged so a later value for a key replaces an earlier
   * one — the superseded value is dropped rather than queued behind its own replacement. A burst of
   * taps therefore costs two writes however long it is: the one already going, and one carrying
   * wherever the control ended up.
   */
  let queued: Partial<Preferences> = {};

  function send(patch: Partial<Preferences>): void {
    saving = true;

    try {
      save(encodePreferences(patch)).then(drain, drain);
    } catch {
      // A `save` that throws rather than rejecting has still finished, and the queue has to keep
      // moving: wedging here would cost every later preference, not just this one. The `then` is
      // inside the try for the same reason — a `save` that returns something un-thenable throws
      // here, and it would throw out of `set` and into a click handler with the queue left shut.
      drain();
    }
  }

  /**
   * Send whatever accumulated while the last save was out, if anything.
   *
   * A failed patch is *not* folded into the next send. The server rejects a write for a reason it
   * will reject the retry for too — quota, or a value the schema refused — and this store's
   * documented stance is that a lost save costs the next reload's memory of a setting rather than
   * interrupting a lesson.
   */
  function drain(): void {
    saving = false;
    const pending = queued;
    queued = {};
    if (Object.keys(pending).length > 0) send(pending);
  }

  return {
    get: () => ({ ...values }),

    set(patch) {
      // Round-tripped through the wire format, which is by definition what the server will accept.
      // Without this a value the schema rejects would sit in memory looking stored, and the display
      // would disagree with the store until the next reload resolved it the other way.
      const accepted = decodePreferencePatch(encodePreferences(patch));
      if (Object.keys(accepted).length === 0) return;

      values = { ...values, ...accepted };

      // Memory is updated either way, above: the screen shows the latest value from the moment it
      // is set, and the queue only decides when the store is told.
      if (saving) queued = { ...queued, ...accepted };
      else send(accepted);
    }
  };
}
