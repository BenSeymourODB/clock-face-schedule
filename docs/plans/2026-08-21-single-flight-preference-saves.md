# One writer at a time, so a preference cannot revert itself

**Status:** in review
**Issue:** [#84 — Two quick preference saves can land out of order, leaving the store disagreeing
with the screen](https://github.com/BenSeymourODB/clock-face-schedule/issues/84)
**Docs:** #31 / #82 (the preference store this builds on), #47 (the control that will fire the
burst), #83 (the unset gap in the same store), ADR 0006 (a round trip is 0.5–2 s), ADR 0008 (which
controls may be live at all), `docs/DESIGN.md` — platform constraints, on why preferences are
server-side in the first place

## The defect

`preferenceStore.set` applied the change in memory and called `save(wire)` without awaiting it.
`save` is one `google.script.run` call, and two of those are **independent executions**: Apps Script
promises nothing about the order they finish in. So a control fired twice inside one round trip —
ADR 0006 prices that at 0.5–2 s — could leave the store holding the earlier value:

```
set({ timerDurationSeconds: 600 })   → request A
set({ timerDurationSeconds: 900 })   → request B, 200 ms later
B lands, then A lands
  store:  600
  memory: 900, and 900 is what is on screen
  reload: 600 — silently reverts what the teacher last set
```

Nothing detected it. `savePreferences` returns the resolved wire and the client discarded it.

This matters most for the one field #31 calls out as high value: the duration a teacher types "under
time pressure", which is exactly where a spinner tapped three times produces several writes inside a
second.

## The fix, and why this half and not the other

#84 lists three remedies. They are not alternatives at the same level, and the dependency falls
differently for each:

| | What it buys | Whose shape it depends on |
| --- | --- | --- |
| **Single-flight queue** | ordering, totally | nobody's — one writer is one writer |
| Per-key trailing debounce | one fewer write per burst | the control's, which is #47 |
| Reconcile from the echo | detection, after the fact | — |

Only the queue makes ordering *total*, and it is the half that needs `save` to report completion —
a contract change that is cheaper to make while the write path has no production caller than after
it has one. So the queue lands here and the debounce stays with #47.

**At most one save is in flight.** Changes made while one is out are held in a patch, merged per key
so a later value replaces an earlier one, and sent when the in-flight write settles. Ordering is
total because there is only ever one writer, and it holds whether or not the caller debounces.

### The debounce is worth exactly one write per burst

The queue already collapses a burst, because a superseded value is dropped rather than queued behind
its replacement. For a burst of `N` sets inside one round trip:

| | writes |
| --- | --- |
| Before | `N` |
| Single-flight queue | **2** — the one already going, and one carrying wherever the control ended up |
| Queue + 300 ms trailing debounce | 1 |

The 2 is pinned by a spec rather than argued: `costs two writes for a burst of any length` drives
five sets through the real store and asserts the sequence. The debounce's remaining value is
therefore a **constant one write per burst, not a proportion of it** — which is a reason to leave it
to the control that produces the burst rather than to guess at a delay now.

### Deliberately not done: dropping a redundant follow-up

A tempting extra: if the coalesced follow-up encodes to the same wire the in-flight write just
stored, drop it. Measured against what this store already worries about, it is **wrong**. A second
tab writing between the two makes the follow-up not redundant at all — re-sending it is what makes
this tab's screen and the store agree again, and a store disagreeing with the screen is the title of
this issue. `decodePreferencePatch`'s own docstring exists for that two-tab case. Not built, and
recorded here so it is not built later.

### Deliberately not done: retrying a failed write

`drain` runs on rejection as well as fulfilment, so one failed write does not cost the ones behind
it — but the failed patch is not folded into the next send. The server refuses a write for a reason
it will refuse the retry for too (quota, or a value the schema rejected), and this store's stated
bargain is that a lost save costs the next reload's memory of a setting rather than interrupting a
lesson. A retry loop on a display left up for weeks costs more than that.

## Why the contract is `PromiseLike`, not `void | PromiseLike`

`save`'s return type is **required**. A `save` that reported nothing would silently restore the
racing behaviour — the store would treat every write as instantly over — and there is no test that
can catch it, because `main.ts` runs top-level side effects at import and has no spec. A required
return type moves that failure from silent-in-the-browser to `npm run check-types`, which is the
same reasoning ADR 0002 gives for generating the server footer rather than maintaining it.

`main.ts` therefore returns the bridge call, and its log line **rethrows**:

```ts
save: (wire) =>
  callServer<string>("savePreferences", wire).catch((error: Error) => {
    console.warn(`preference not saved — ${error.message}`);
    throw error;
  })
```

Swallowing there would tell the store a rejected write succeeded. It changes nothing about failure
policy today — the store drains either way — but it keeps the signal honest for anything later that
wants it, #84's third option (reconcile from the echo) included.

## Known limit, deferred

**A `save` whose promise never settles stalls every later write.** Today's fire-and-forget code
cannot stall, so this is the one axis on which the change could be worse. `callServer` rejects
through `withFailureHandler`, so the mechanism needs a bridge that neither succeeds nor fails —
plausible only if the sandboxed iframe is torn down mid-call, at which point nothing is saving
anyway. A watchdog is the fix and it needs an injectable clock; filed separately rather than folded
in, because a timeout that fires early re-creates the exact race this change removes.

A synchronous throw from `save` *is* handled: it drains rather than wedging, with a spec.

## Tests

No rendering changes, so no visual pass — this is `src/client/preferences.ts` and its spec.

Eight assertions in a new `the store, with a write still in flight` block, every one on the
**sequence of writes** rather than on timing, driven by a `save` whose writes finish when the test
says so:

- a second write is held until the first is over (fails on `main`)
- the store ends holding the last value set, whatever order the writes finished in
- a burst of five costs two writes (fails on `main`)
- different keys merge into one follow-up rather than superseding each other (fails on `main`)
- a queued write still goes after a failed one
- the failed write's own value is not retried
- a `save` that throws synchronously does not wedge the queue (fails on `main`)
- the newest value is on screen while an older one is still being written

One existing assertion — `keeps earlier changes while sending only the latest` — gains an `await`.
Its claims are unchanged and one is added: memory is checked *before* the flush, so it now also
pins that queueing the write does not queue the change.
