# Unsetting a preference, so the deployment's own defaults stay reachable

**Status:** done — shipped in [#158](https://github.com/BenSeymourODB/clock-face-schedule/pull/158)
**Issue:** [#83 — A preference can be set but never unset, so the script-store layer is one-way
losable](https://github.com/BenSeymourODB/clock-face-schedule/issues/83)
**Docs:** #31 / #82 (the store this extends), #84 (the single-flight queue a reset has to join),
#122 (the timeout question a queued write inherits), #47 (the control that will offer a reset), ADR
0002 (the footer is generated), ADR 0003 (the server stores and validates, nothing more), ADR 0006
(a round trip is 0.5–2 s), ADR 0008 (a preference nobody can put back is the durable version of a
mode nobody knows was changed)

## The defect

`savePreferences` writes to `PropertiesService.getUserProperties()`; `resolvePreferences` layers
**user store → script store → code default**. Nothing removes a user property, and the wire format
cannot express a removal: `decodePreferencePatch` keeps only keys whose values *parse*, and `key=`
parses as nothing and is dropped.

So the user store is append-only in effect. Measured against the real modules:

```
script store {pref.showSeconds: "0"}, user store empty
  → resolved showSeconds=0            (the deployment's default, in effect)
user store gains {pref.showSeconds: "0"}
admin changes script pref.showSeconds to "1"
  → resolved showSeconds=0            (never picked up again)
```

The same shape applies to the **code** defaults, which this project retunes constantly (#26, #27,
#64, #67 all moved a number that had shipped). A display that has once stored a key ignores every
later change to it.

## The decided shape

Recorded on #83: **a separate entry point — `resetPreferences(keysWire)`, deleting the named user
properties.** It is the only one of the three options that keeps the patch format closed. A reset
sentinel (`showSeconds=`) makes an empty value *meaningful* where `readWire` today cannot tell
`key=` from a key to ignore; "never store a value equal to what the lower layers resolve to" opts a
viewer who *deliberately* matched today's default into whatever it changes to later.

Its cost is one footer entry, and the footer is generated from the bundle's export list (ADR 0002),
so adding an `export` to `src/server/main.ts` is the whole of it.

## The wire the reset carries

A reset names keys, not values, so it gets its own encoding rather than reusing the patch's:

```
resetPreferences("showSeconds;timerMuted")
```

`encodePreferenceKeys` / `decodePreferenceKeys` in `src/shared/preferences.ts`, registry-ordered and
deduped like every other wire here. The two formats are **mutually non-confusable**, which is worth
having rather than merely observing: `readWire` drops an entry with no `=`, so a key wire decodes to
an empty patch; and `showSeconds=0` is not a registry key, so a patch wire decodes to an empty key
list. Sending one where the other is expected therefore does nothing, rather than doing something
adjacent. Asserted, not assumed.

**An empty wire resets nothing.** A full reset is every key named — the client has
`PREFERENCE_KEYS`, so `encodePreferenceKeys(PREFERENCE_KEYS)` is the whole of it — and that ordering
is deliberate: the argument a caller reaches by accident (`""`, a dropped variable) must be the
harmless one. `savePreferences("")` already writes nothing for the same reason.

## Why not `deleteAllProperties`

#83 offers it "for a full reset". Declining it, because the prefix rules it out: `PROPERTY_PREFIX`
exists precisely so preferences "can share a store with anything else that ever wants one without
either reading the other's keys as its own", and `deleteAllProperties` deletes those other keys too.
`setProperties(kept, true)` — the only *batched* delete Apps Script's `Properties` offers — has the
same reach and the same objection.

So a reset is one `deleteProperty` call per key. That is unbatched where `savePreferences`
deliberately batches "since write quota is per call", and the answer is that the count is bounded by
the registry rather than by the request: three keys today, and a reset is a deliberate act a viewer
performs once, not a spinner held down.

## What the client cannot know

The store applies a `set` locally at once — "the display is never out of step with the control the
viewer just used". **A reset cannot do that**, and this is the one genuinely new thing here.

The client is templated the *resolved* wire (#31) and nothing else. It has no idea which layer any
value came from, so it cannot compute what a reset resolves to: dropping a user value may land on
the script store's value or on the code default, and only the server knows which. Guessing the code
default is worse than waiting — with `pref.showSeconds="0"` in the script store and `"1"` in the
user's, a locally-guessed reset shows `1` (unchanged), then flips to `0` when the echo lands.

So `reset` adopts the wire the server echoes back, and shows the *previous* value until it arrives.
Briefly stale beats briefly wrong, and ADR 0006 prices the wait at 0.5–2 s on a control nobody is
operating under time pressure. `savePreferences`'s echo stays discarded — after a save the client
already knows the answer, because the user layer it just wrote is the one that wins.

The flicker-free version needs `doGet` to template the deployment-resolved wire alongside the
resolved one, so the client knows the lower layers. Out of scope here and filed as #157.

Adoption is **per key and only where untouched**: for each key the reset named, take the echoed
value unless a later `set` or `reset` is queued against it. Single-flight (#84) means only one write
is ever out, so "queued" is exactly "touched since the reset was sent".

## Joining the single-flight queue

A reset is a write to the same store, so it queues with the saves rather than beside them — two
independent `google.script.run` calls have no ordering, which is #84's whole finding.

The queue's held state splits in two, with **one invariant: a key is in at most one bucket.**
Queueing a `set` for a key drops it from the reset bucket and vice versa, so the last operation on a
key is the one that survives — the same supersede rule the queue already applies to values, extended
to cover "and unset it". Because the buckets are key-disjoint by construction, the order `drain`
sends them in cannot matter, which is why it may simply send whichever is non-empty.

## Phases

1. **Shared** — `encodePreferenceKeys` / `decodePreferenceKeys`, and the non-confusability
   assertions.
2. **Server** — `PropertyBag.deleteProperty`, `resetPreferences`, the `export` in `main.ts`, and the
   **layering-restored** spec: user value set, then unset, resolving back to the *script* store's
   value rather than to the code default. That is the property #83 is about, and asserting only "the
   key is gone" would pass without testing it.
3. **Client** — `PreferenceStore.reset`, the split queue, echo adoption, and the `main.ts` wiring.

## Not built here

- **Templating the deployment-resolved wire** so a reset applies locally with no round trip —
  [#157](https://github.com/BenSeymourODB/clock-face-schedule/issues/157), which writes out the
  discriminating spec.
- **A control that offers it.** #47 owns the surface; nothing in production calls `savePreferences`
  today either.
- **`?check=1` stays read-only.** An earlier version wrote the resolved values back and pinned every
  key into the user store on the first diagnostic run — which is the hazard this plan closes, and a
  diagnostic that *deleted* a viewer's settings to prove it could would be the same mistake facing
  the other way.
