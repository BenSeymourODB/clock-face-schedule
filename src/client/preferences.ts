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
  type PreferenceKey,
  type Preferences,
  decodePreferenceKeys,
  decodePreferencePatch,
  decodePreferences,
  encodePreferenceKeys,
  encodePreferences
} from "../shared/preferences";

export interface PreferenceStore {
  /** The preferences in effect. A copy: the store's own state is not handed out. */
  get(): Preferences;
  /** Apply and persist some preferences, ignoring any the schema rejects. */
  set(patch: Partial<Preferences>): void;
  /**
   * Forget the viewer's own values for these keys, so each falls back to whatever the layer beneath
   * it says (#83) — the deployment's default, or the code's where the deployment has none.
   *
   * Shows its effect immediately, like `set`, because that layer is templated too (#157). The
   * server's echo still arrives and is still adopted; it is a correction rather than the answer.
   */
  reset(keys: readonly PreferenceKey[]): void;
}

export interface PreferenceStoreOptions {
  /**
   * The wire string `doGet` templated in. Empty or absent means nothing is stored — which is the
   * normal case in the local preview, where no server ran at all.
   */
  wire?: string | null;
  /**
   * The deployment's own resolved set, templated beside `wire` — every preference as it would be
   * with the viewer's own store taken away. What a reset lands on, in other words, which is the one
   * thing the resolved wire cannot say (#157).
   *
   * Empty or absent decodes to the code defaults, and that is the right answer for both cases that
   * produce it: the local preview, where no server ran and so there is no deployment layer at all,
   * and a page served before this attribute existed, where the code default is what the old `reset`
   * would have guessed anyway.
   */
  deploymentWire?: string | null;
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
  /**
   * Deletes the viewer's own values for the keys a wire names, and resolves with **the resolved set
   * the store then holds** — where `save`'s answer is discarded.
   *
   * That asymmetry survives `deploymentWire`, which changes what the echo is *for* rather than
   * removing the need for it. `deploymentWire` is the deployment layer as it stood when the page
   * loaded, and a wall display's page is loaded for as long as the board has been up: a second tab,
   * or an administrator setting a school default, moves the script store underneath it. So the local
   * answer is right at once and the echo keeps it right, which is one more reason than a save has —
   * a save wrote the winning layer itself and has nothing to learn.
   *
   * Still required, and still typed as `string`, for the reason `save`'s return type is required at
   * all: it is the only thing that catches the omission at build time.
   */
  reset: (keysWire: string) => PromiseLike<string>;
}

/** One templated attribute, read as absent rather than as an error where it is not there. */
function readWireAttribute(mount: Element | null | undefined, datasetKey: string): string | null {
  if (!(mount instanceof HTMLElement)) return null;
  const wire = mount.dataset[datasetKey];
  return wire === undefined ? null : wire;
}

/**
 * The templated wire string, from the element the dial mounts into.
 *
 * `data-preferences` — the same path `data-demo` already takes. The attribute name is spelled out
 * here rather than assembled, so a search for it finds both this and `Index.html`.
 */
export function readPreferenceWire(mount: Element | null | undefined): string | null {
  return readWireAttribute(mount, "preferences");
}

/**
 * The deployment layer's wire string, from `data-deployment-preferences` on the same element.
 *
 * A separate function rather than a parameter on the one above, so both attribute names are spelled
 * out where a search for either finds this file and `Index.html` — the two spellings have to match
 * across a template boundary no type checks.
 */
export function readDeploymentPreferenceWire(mount: Element | null | undefined): string | null {
  return readWireAttribute(mount, "deploymentPreferences");
}

export function preferenceStore({
  wire,
  deploymentWire,
  save,
  reset
}: PreferenceStoreOptions): PreferenceStore {
  let values = decodePreferences(wire);

  /**
   * What each preference is with the viewer's own store taken away — fixed for the life of the page,
   * because it is a snapshot of the server's layers at load. A reset lands here at once, and the
   * server's echo is what covers the snapshot having gone stale since.
   */
  const beneath = decodePreferences(deploymentWire);

  /** Whether a write is with the server. The queue's only state that is not the queue. */
  let writing = false;

  /**
   * Changes made while a write was in flight, merged so a later value for a key replaces an earlier
   * one — the superseded value is dropped rather than queued behind its own replacement. A burst of
   * taps therefore costs two writes however long it is: the one already going, and one carrying
   * wherever the control ended up.
   */
  let queuedValues: Partial<Preferences> = {};

  /**
   * Keys held for a reset, the same way values are held for a save (#83). A reset is a write to the
   * same store, so it queues *with* the saves rather than beside them — two `google.script.run`
   * calls have no ordering between them, which is the whole of #84.
   *
   * **A key is in at most one of the two buckets**: queueing either operation for a key drops it
   * from the other, so the last thing asked of a key is the one that lands — the supersede rule the
   * queue already applied to values, extended to cover "and unset it". Being key-disjoint by
   * construction is also why the order `drain` sends the two in cannot matter.
   */
  let queuedKeys: PreferenceKey[] = [];

  /** Registry order, no repeats, nothing the schema does not know — as the wire itself would give. */
  const normalise = (keys: readonly PreferenceKey[]): PreferenceKey[] =>
    decodePreferenceKeys(encodePreferenceKeys(keys));

  function sendValues(patch: Partial<Preferences>): void {
    writing = true;

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

  function sendKeys(keys: PreferenceKey[]): void {
    writing = true;

    try {
      reset(encodePreferenceKeys(keys)).then((resolved) => {
        adopt(keys, resolved);
        drain();
      }, drain);
    } catch {
      drain();
    }
  }

  /**
   * Take the server's answer for the keys a reset named — a correction to what `reset` already
   * applied from `beneath`, which is a snapshot taken when the page loaded and can have gone stale
   * since (`PreferenceStoreOptions.reset` has the cases).
   *
   * Per key, and only where a **new value** is queued for it: that value was set while this reset
   * was in flight, so the echo predates it and adopting it would revert the control the viewer just
   * used. Single-flight means only one write is ever out, so `queuedValues` is exactly "set since".
   * Read before `drain` empties it.
   *
   * A queued *reset* for the same key is deliberately not a reason to skip. It asks for what the
   * echo already reports — the property is gone, and deleting an absent one changes nothing — so
   * suppressing adoption there would discard the freshest reading of the layer beneath and leave the
   * display on a load-time snapshot the echo had just contradicted.
   */
  function adopt(keys: readonly PreferenceKey[], resolved: string): void {
    // `reset` is caller-supplied and its answer arrives over the bridge as a cast rather than a
    // check, so the declared `string` is a promise the transport may not keep. A non-string throws
    // out of `decodePreferencePatch` — and it would throw *inside a fulfilment handler*, where
    // `sendKeys`'s own `catch` cannot see it, shutting the queue and costing every later preference
    // rather than this echo. Which is the failure the synchronous case is already guarded against.
    if (typeof resolved !== "string") return;

    // A *patch* rather than the resolved set, so the echo only speaks for the keys it actually
    // names. `decodePreferences` would read a wire that carries nothing — an empty answer from a
    // bridge that did not really answer — as "every preference is at its code default", which is
    // exactly the guess this whole path exists to avoid making.
    const stored = decodePreferencePatch(resolved);
    const next = { ...values };

    for (const key of keys) {
      if (queuedValues[key] !== undefined) continue;

      const value = stored[key];
      if (value === undefined) continue;
      // The registry is heterogeneous, so walking it needs one widening — confined to this line.
      (next as { [key: string]: unknown })[key] = value;
    }
    values = next;
  }

  /**
   * Send whatever accumulated while the last write was out, if anything.
   *
   * A failed write is *not* folded into the next send. The server rejects one for a reason it will
   * reject the retry for too — quota, or a value the schema refused — and this store's documented
   * stance is that a lost write costs the next reload's memory of a setting rather than interrupting
   * a lesson.
   */
  function drain(): void {
    writing = false;

    const pending = queuedValues;
    queuedValues = {};
    if (Object.keys(pending).length > 0) {
      sendValues(pending);
      return;
    }

    const pendingKeys = queuedKeys;
    queuedKeys = [];
    if (pendingKeys.length > 0) sendKeys(pendingKeys);
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
      if (writing) {
        queuedValues = { ...queuedValues, ...accepted };
        queuedKeys = queuedKeys.filter((key) => accepted[key] === undefined);
      } else sendValues(accepted);
    },

    reset(keys) {
      const named = normalise(keys);
      if (named.length === 0) return;

      // Applied at once, exactly as `set` is, because the layer beneath is templated too (#157).
      // Before that it could not be: guessing the code default would have shown the wrong value
      // wherever the deployment had an answer of its own, so the store waited for the echo and was
      // briefly stale rather than briefly wrong.
      const next = { ...values };
      for (const key of named) {
        // The registry is heterogeneous, so walking it needs one widening — as `adopt` does.
        (next as { [key: string]: unknown })[key] = beneath[key];
      }
      values = next;

      if (writing) {
        queuedKeys = normalise(queuedKeys.concat(named));
        // The superseded value is dropped rather than sent, per the last-operation-wins rule — and
        // the line above has already replaced it on screen with the layer beneath. That is what
        // closes #158's gap: a reset that supersedes a `set` and is then refused now leaves the
        // display on a real layer rather than on a value that reached neither the store nor any.
        for (const key of named) delete queuedValues[key];
      } else sendKeys(named);
    }
  };
}
