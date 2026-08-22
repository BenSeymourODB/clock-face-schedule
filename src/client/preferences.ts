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
 *
 * A write therefore gets a **deadline** (#122). One writer means one stuck write is every write: a
 * promise that neither resolves nor rejects would leave the queue shut for the life of the page,
 * which on a wall display is however long the board has been up — and with no symptom, since the
 * screen keeps showing what the viewer set and only a reload reveals the store fell behind. That is
 * the one axis on which a single writer is worse than the fire-and-forget it replaced, which could
 * lose a write and could order two wrongly but could not stop writing.
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
   * The one operation here that does **not** show its effect immediately, because the client cannot
   * know it: see `PreferenceStoreOptions.reset`.
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
   * That asymmetry is the point rather than an oversight. After a save the client already knows the
   * outcome: it wrote the user layer, and the user layer is the one that wins. After a reset it
   * cannot. `doGet` templates the *resolved* wire and nothing else (#31), so the client is never
   * told which layer a value came from, and dropping a user value may land on the deployment's
   * answer or on the code's. Only the server knows which.
   *
   * So the wire is required, and a `reset` that reported nothing would leave the store guessing.
   * Typed as `string` for the same reason `save`'s return type is required at all: it is the only
   * thing that catches the omission at build time.
   */
  reset: (keysWire: string) => PromiseLike<string>;
  /**
   * Runs `run` after `delayMs`, and returns a function that cancels it. `window.setTimeout` unless a
   * caller passes something else, which only a spec has reason to.
   *
   * A parameter rather than a direct `setTimeout` because the store is otherwise pure apart from the
   * `save` it is handed: injecting the timer is what lets a spec hold a write past its deadline
   * without fake timers, in a suite that needs none.
   */
  schedule?: (run: () => void, delayMs: number) => () => void;
}

/**
 * How long a write may be with the server before the queue gives up its turn (#122).
 *
 * Five times the slow end of ADR 0006's 0.5–2 s round trip. The number is a trade rather than a
 * measurement: past it, a slow-but-alive write races the one behind it, which is the defect the
 * single writer exists to remove — so the deadline has to be long enough that the race is rarer than
 * the stall it prevents. 2 s would race a merely-loaded board routinely; 60 s would leave a minute of
 * dead queue per occurrence, giving most of the value back.
 */
const WRITE_DEADLINE_MS = 10_000;

/** The real timer, for every caller that is not a spec. */
const browserSchedule = (run: () => void, delayMs: number): (() => void) => {
  const id = window.setTimeout(run, delayMs);
  return () => window.clearTimeout(id);
};

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

export function preferenceStore({
  wire,
  save,
  reset,
  schedule = browserSchedule
}: PreferenceStoreOptions): PreferenceStore {
  let values = decodePreferences(wire);

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

  /**
   * One write's turn at the queue, arming its deadline and ending **exactly once** — whichever of the
   * server's answer and the deadline arrives first (#122).
   *
   * `over` is what makes it once, and it is the half that carries the correctness:
   *
   * - **The deadline closes the turn**, so an answer arriving afterwards does nothing. Draining twice
   *   for one write would send the queue's next entry while the previous one was still out, which is
   *   the race a single writer exists to remove.
   * - **`over` is per turn**, so a stale timer cannot reach a *later* write either: it finds its own
   *   turn already over and returns. That is why cancelling is housekeeping rather than a guard —
   *   `setTimeout` is one-shot, so live timers are bounded by the writes of the last ten seconds
   *   however long the board has been up, and the cost of a stray one is a wasted callback.
   *
   * The one thing cancelling *did* protect is the log, which is why the warning is inside the turn:
   * `end` runs it only if the deadline is what ended the turn, so an abandoned-write line cannot
   * describe a write that succeeded. True by construction rather than by `clearTimeout` winning.
   */
  function writeTurn(): (finish: () => void) => void {
    let over = false;
    // Assigned below, and a no-op until then. A `schedule` that ran its callback synchronously would
    // otherwise reach `cancel` in its dead zone and throw *out of `set`* with `writing` left true and
    // no timer to recover it — permanent silence, which is the failure this deadline exists to
    // remove. Only a spec supplies a `schedule`, and none does that; one line is cheaper than
    // trusting that.
    let cancel: () => void = () => undefined;

    function end(finish: () => void): void {
      if (over) return;
      over = true;
      cancel();
      finish();
    }

    cancel = schedule(() => {
      end(() => {
        // The only record an abandoned write leaves. `main.ts` logs the sibling failures from inside
        // the functions handed in here, which is upstream of this deadline, so without a line the
        // failure would be invisible on a display nobody is watching.
        console.warn(`preference write abandoned after ${WRITE_DEADLINE_MS} ms — no answer`);
        drain();
      });
    }, WRITE_DEADLINE_MS);

    return end;
  }

  function sendValues(patch: Partial<Preferences>): void {
    writing = true;
    const end = writeTurn();

    try {
      save(encodePreferences(patch)).then(
        () => end(drain),
        () => end(drain)
      );
    } catch {
      // A `save` that throws rather than rejecting has still finished, and the queue has to keep
      // moving: wedging here would cost every later preference, not just this one. The `then` is
      // inside the try for the same reason — a `save` that returns something un-thenable throws
      // here, and it would throw out of `set` and into a click handler with the queue left shut.
      // `end` rather than `drain` so the throw also disarms the deadline it just armed.
      end(drain);
    }
  }

  function sendKeys(keys: PreferenceKey[]): void {
    writing = true;
    const end = writeTurn();

    try {
      reset(encodePreferenceKeys(keys)).then(
        (resolved) =>
          end(() => {
            adopt(keys, resolved);
            drain();
          }),
        () => end(drain)
      );
    } catch {
      end(drain);
    }
  }

  /**
   * Take the server's answer for the keys a reset named — the only way the display learns what the
   * reset landed on, since the layer beneath the viewer's own was never sent to the browser.
   *
   * Per key, and only where a **new value** is queued for it: that value was set while this reset
   * was in flight, so the echo predates it and adopting it would revert the control the viewer just
   * used. Single-flight means only one write is ever out, so `queuedValues` is exactly "set since".
   * Read before `drain` empties it.
   *
   * That invariant now rests on `writeTurn`'s `over` rather than on single-flight alone (#122): an
   * echo arriving after its deadline never reaches here, and it is the one echo `queuedValues` could
   * not speak for — the store has drained and moved on, so a value set since is already sent rather
   * than queued.
   *
   * A queued *reset* for the same key is deliberately not a reason to skip. It asks for what the
   * echo already reports — the property is gone, and deleting an absent one changes nothing — so
   * suppressing adoption there would discard the only answer the client is going to get, and leave
   * the display on the value the reset removed if the second reset then failed.
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

      // Nothing is applied locally, which is the one place this store departs from "the display
      // agrees with the control at once". It cannot: guessing the code default would show the wrong
      // value where the deployment has an answer of its own, and briefly stale beats briefly wrong.
      // `PreferenceStoreOptions.reset` has the reasoning.
      if (writing) {
        queuedKeys = normalise(queuedKeys.concat(named));
        // The superseded value is dropped rather than sent, per the last-operation-wins rule. Note
        // it was already applied to `values`, so a reset that supersedes a `set` and then *fails*
        // leaves the display on a value that reached neither the store nor any layer. #157 removes
        // that by its nature rather than by handling it: once the deployment's own wire is
        // templated, a reset applies its real answer locally and there is no unmoored value left.
        for (const key of named) delete queuedValues[key];
      } else sendKeys(named);
    }
  };
}
