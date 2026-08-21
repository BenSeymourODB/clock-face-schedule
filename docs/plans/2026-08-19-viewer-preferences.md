# Viewer preferences in PropertiesService

**Status:** done — shipped in [#82](https://github.com/BenSeymourODB/clock-face-schedule/pull/82)
**Issue:** [#31](https://github.com/BenSeymourODB/clock-face-schedule/issues/31)
**PR:** [#82](https://github.com/BenSeymourODB/clock-face-schedule/pull/82)
**Docs:** [../DESIGN.md](../DESIGN.md) (Platform constraints — browser storage; ADR 0006; ADR 0008)

## What this builds

The **mechanism**, not the controls. Nothing on the display can set a preference yet — #47's top bar
is where that goes — so the deliverable is the path a value travels and the shape a new preference
declares itself in:

```
PropertiesService (script defaults, user overrides)
        │  doGet reads once, per page load
        ▼
  data-preferences="showSeconds=1;timerMuted=0;timerDurationSeconds=300"   ← templated into Index.html
        │  client decodes off the mount element, no round trip
        ▼
  preferenceStore().get() → Preferences        used by main.ts
        │  .set({ … })  →  savePreferences(wire)   fire-and-forget google.script.run
        ▼
PropertiesService (user store only)
```

Registering a preference afterwards is one definition in `PREFERENCES` plus its test. That is the
property this plan is really trying to buy.

## Why the read is templated rather than fetched

ADR 0006 measures a `google.script.run` round trip at 0.5–2 s, and the display's first paint is
already ordered around that — hands before data. A preference that arrives after first paint would
mean the dial renders once with the default and again with the stored value, which for anything
affecting layout is a visible flicker on a wall. `doGet` already templates `showDemo` into
`data-demo`, so preferences ride the same path for free.

Writes are the other way round: user-initiated, one at a time, and nothing on screen waits for them.

## The wire format, and why not JSON

One string, `key=value` pairs joined by `;`, in a fixed key order.

JSON in an HTML attribute has to survive whatever escaping `<?= ?>` applies, and JSON in a
`<script>` block cannot use `<?= ?>` at all (HTML entities are not decoded inside `script`, so the
escaped output would not parse) — which would leave `<?!= ?>` and an unescaped store value inside a
tag that a `</script>` in the data can close. Both are avoidable.

Every value comes out of the schema's own `encode`, so the alphabet is closed: `[A-Za-z0-9]` plus
`=` and `;`. **Nothing in an encoded wire string is HTML-special**, and that is asserted as a
property of the registry rather than of a list: `preferences.test.ts` iterates `PREFERENCE_KEYS` and
checks every sample value against `/^[A-Za-z0-9;=]*$/`, with the samples in a mapped type that
**fails to compile if a new key is registered without one**. A definition whose `encode` could emit
`&`, `"` or `<` cannot slip past by simply not being on a list.

Cost: the format carries no types, so a value is only as safe as its `parse`. Which it has to be
anyway — the store is a bag of strings a previous version of the code wrote.

## Layering, and what a bad value falls back to

Three sources, most specific first: **user store → script store → the code's default.** Per key,
the first source that holds a value which *parses* wins.

That "which parses" matters and is the deliberate part: a corrupt user value falls through to the
institution's script default rather than skipping straight to the code default, and a malformed
store never throws. A wall display must render with wrong preferences rather than not render — the
same reasoning ADR 0006 gives for keeping the last good payload up and marking it stale.

Writes are validated the same way and re-encoded from the parsed value, so nothing a client sends
reaches the store verbatim: an unknown key, a malformed value or an out-of-range number is dropped,
and what lands is what the schema itself would have written.

## Keys registered here

| key | type | default | consumer |
| --- | --- | --- | --- |
| `showSeconds` | boolean | `true` | `main.ts` today — it passes a hardcoded `true` to `analogClock` |
| `timerMuted` | boolean | `false` | `playCompletionCue({ muted })` (#45/#55), once #47 can set it |
| `timerDurationSeconds` | 60…43200 | `300` | #47's duration field, pre-populated |

`showSeconds` is here because a mechanism with no live consumer cannot be verified end-to-end, and
it is the only preference-shaped value the display already hardcodes. Its default is `true` — the
value `main.ts` passes today — so registering it changes nothing about what renders until something
stores otherwise. It is also in ADR 0008's safe class: a second hand is present or absent and
nothing else on the dial is reinterpreted by its absence.

`timerDurationSeconds`'s range is the one invented number here: a floor of one minute because the
timer's encoding is one band per minute, and a ceiling of 12 hours because that is the dial's own
period. The brainstorm's presets (1/2/5/10/20 minutes) all sit inside it. Flagged in the PR for
confirmation rather than presented as derived.

### Deliberately not registered

- **`colourScheme`.** The storage half is three lines, but honouring `light` needs a light palette
  authored *and* contrast-verified: #27's table has nine of Google's eleven event colours failing
  on white (Banana 1.40:1, Graphite 1.31:1). Storing a preference the renderer would ignore is
  worse than not having it. Filed as
  [#81](https://github.com/BenSeymourODB/clock-face-schedule/issues/81), which the key lands with.
- **`timerDisplayMode`, `showTimerReadout`.** #46 and #48 decide their option sets; a guess here
  would be a key those issues have to migrate.
- **`scaleMode`.** #34, whose comment settles that a persistent toggle makes it safe to store —
  but the toggle is the thing that makes it safe, and the toggle is #34's own work.

## Phases

1. **Shared schema.** `src/shared/preferences.ts` — definitions, defaults, decode/encode, source
   layering. Pure, node-tested, no DOM and no Apps Script types (it compiles under both tsconfigs).
2. **Server.** `src/server/preferences.ts` over an injected two-store interface so it is testable in
   node with fakes; `savePreferences` exported from `main.ts` (the footer is generated — ADR 0002);
   `doGet` templates the resolved wire into `data-preferences`.
3. **Client.** `src/client/preferences.ts` — read the mount attribute, in-memory store, patch-only
   writes so two tabs cannot clobber each other's other keys. `main.ts` takes `showSeconds` from it.
4. **Render and look.** The preview strips `<?= … ?>` to `""`, so its default render must be
   pixel-identical to today's. Then inject a stored `showSeconds=0` and confirm the second hand and
   its halo are the only things that change.

## Risks

- **The preview strips scriptlets.** The templated attribute becomes `data-preferences=""` there,
  which the client must read as "nothing stored" rather than "empty preferences".
  `index-template.test.ts` applies the same strip the preview builder applies and asserts the empty
  value survives.
- **A guarded attribute would be absent on every real load.** Not, as this plan first claimed, baked
  into the preview: the guard is `showDemo`, and the preview keeps guarded content while stripping
  the value to `""` either way — so a guard would be invisible locally and would leave every
  calendar-showing display with no preferences at all. Corrected after building it both ways and
  finding the preview line byte-identical. The assertion that catches it removes each guarded region
  the way a false condition would and checks the attribute is still there.
- **`doGet` must not be able to fail.** A `PropertiesService` error at page load would take the whole
  display down for a preference nobody set. `readStoredPreferences` catches — and takes its stores
  from a **factory** rather than a default parameter, because a default parameter is evaluated
  outside the function's own `try`: `PropertiesService.getUserProperties()` throwing would have
  escaped the guard entirely, and no test injecting a fake store could have noticed. Both halves now
  have a case.
- **Setting a preference is one-way.** Nothing can unset one, so a stored key stops tracking the
  script store's default and the code's forever (#83). Why `?check=1` reports the store rather than
  writing to it: an earlier version echoed the resolved values back, which pinned every key into the
  viewer's own store on the first diagnostic run.
- **Two quick saves can land out of order** (#84), which will matter once #47 gives someone a field
  to tap twice.
- **Textual conflict with #75**, which also edits `doGet` and the same line of `Index.html`. No
  semantic overlap; whichever merges second resolves.
