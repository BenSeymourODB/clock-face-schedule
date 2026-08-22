# Template the layer under the viewer's, so a reset shows its own result

**Status:** done — shipped in [#164](https://github.com/BenSeymourODB/clock-face-schedule/pull/164)
**Issue:** [#157](https://github.com/BenSeymourODB/clock-face-schedule/issues/157)
**Docs:** ADR 0006 (the 0.5–2 s round trip this stops waiting on), #31 / #82 (why preferences are
server-side and templated), #83 (`resetPreferences`, which deferred this), #84 (the single-flight
queue a reset takes its turn in), #158 (the supersede site whose unmoored value this removes), #47
(the control that will offer a reset)

## What is decided, and what is not

Nothing. #157 reads *"fully implementable as specified — no open decisions"*, and it names the whole
of the mechanism: one more server function returning `script ∪ code`, one more templated attribute,
and `preferenceStore.reset` applying its answer locally the way `set` already does. This plan exists
to record the two contract reversals that fall out of it, because both are currently asserted the
other way round by passing tests, and a reviewer should see that they were reversed on purpose
rather than found in the way.

## The gap, restated

`preferenceStore.set` keeps its own promise — *"the display is never out of step with the control the
viewer just used"*. `reset` cannot keep it, because `doGet` templates one attribute carrying the
**resolved** set (#31): the browser is never told which layer a value came from, so dropping the
viewer's own value may land on the deployment's answer or on the code default, and only the server
knows which. #83 chose briefly stale over briefly wrong and left it there.

```
script store  pref.showSeconds = "0"      the deployment's answer
user store    pref.showSeconds = "1"      the viewer's own
code default  showSeconds = true

reset(['showSeconds'])
  guessed locally → true   (unchanged on screen), then flips to false when the echo lands
```

## The change, in four parts

1. **`deploymentPreferencesWire(acquire?)`** in `src/server/preferences.ts` — `resolvePreferences`
   over the script source alone, so `script ∪ code` with the user layer omitted. It is
   `resolveFrom` minus one argument. Like `readStoredPreferences` and for the same reason, it must
   **never throw**: `doGet` calls it on every page load, and a `PropertiesService` failure must cost
   a preference rather than the whole display.

   Not exported from `src/server/main.ts`. The browser never calls it — `doGet` does, server-side —
   so it needs no footer entry, and adding one would advertise a function nothing on the bridge
   asks for.

2. **`data-deployment-preferences`** on the mount element in `static/Index.html`, beside
   `data-preferences` and templated the same way: an unconditional attribute with a templated
   *value*, `<?= ?>` rather than `<?!= ?>`. All four properties `index-template.test.ts` already
   asserts of `data-preferences` apply unchanged and are asserted of this one too — emitted whatever
   the conditions evaluate to, stripping to `""` for the preview, and escaped rather than raw.

   It costs no round trip: `doGet` is already holding the stores open for `preferencesWire`.

3. **`readDeploymentPreferenceWire`** in `src/client/preferences.ts`, mirroring
   `readPreferenceWire`, and a `deploymentWire` option on `preferenceStore`. The store decodes it
   once into the values a reset lands on.

   An empty or absent attribute decodes to the code defaults, which is the correct answer for the
   two cases that produce it: the local preview, where no server ran and there is therefore no
   deployment layer, and a page from before this change, where guessing the code default is exactly
   what the old `reset` did.

4. **`reset` applies locally, at once**, in both the sending and the queueing branch — `values[key]`
   becomes the deployment layer's value for every key named. The echo is still adopted, still per
   key, and still only where nothing has been asked of the key since: a second tab can have moved
   the script store under this one, so the echo remains a correction rather than the only answer.

## The two contracts this reverses

Both are asserted today, and both assertions have to turn round. Naming them here so the diff is
not read as a test being bent to fit code.

| spec, in `src/client/preferences.test.ts` | today | after |
| --- | --- | --- |
| "shows the value it had until the echo arrives" | the pre-reset value, then the echo's | the deployment layer's value, before any promise settles |
| "leaves the value alone when the reset fails" | the pre-reset value stands | the layer beneath stands; the store's memory is what a failed write costs |

The second is the one worth dwelling on, because it is the defect #157's comment records rather than
a preference about wording. A reset that supersedes a queued `set` and is then refused leaves the
display on a value that reached neither the store nor any layer:

```
deployment says timerDurationSeconds=600, user store empty

set({timerMuted: true})           → sent
set({timerDurationSeconds: 900})  → queued, and applied to `values` locally
reset(['timerDurationSeconds'])   → supersedes it; the 900 is dropped, never sent
settle()                          → the save lands, the reset goes out
fail()                            → the reset is refused

sent === ['timerMuted=1', 'timerDurationSeconds']     the 900 went nowhere
server resolves 600                                   display shows 900
```

900 then exists in exactly one place: the screen. Once the reset applies the deployment's own answer
locally, the same sequence ends on 600 — the layer beneath — and there is no unmoored value left to
handle. No rollback snapshot, no re-read on the error path.

## Tests

- `src/server/preferences.test.ts` — the wire is `script ∪ code`; a user value is **not** in it even
  where it differs; a store failure yields the defaults rather than throwing; acquisition failing
  likewise.
- `src/server/index-template.test.ts` — the four attribute properties, and that the two preference
  attributes are distinct names (a copy-paste that templated the resolved wire into both would make
  every reset a no-op, and nothing else would notice).
- `src/client/preferences.test.ts` — the discriminating case from #157's acceptance list: deployment
  says `showSeconds=0`, viewer stored `1`, code default `true`, reset lands on `false` **before any
  promise settles**. Plus the superseded-then-refused sequence above, the two reversed specs, and
  that the echo still corrects a value the deployment layer got wrong (the second-tab case).
- `src/client/preview-template.test.ts` — the stripped template leaves the attribute empty, so the
  preview's reset lands on the code defaults rather than on `undefined`.

## Not in scope

**Nothing on the dial changes.** No geometry, no colour, no text: the only visible consequence is
which value a control shows in the moment after a reset, and there is no control yet — #47 is where a
viewer will reach one. So there is no screenshot to take of a changed drawing, and the preview is
checked for the one thing that could regress here: that the page still loads and the dial still
draws with the extra attribute present.

`?check=1` gains a row for the new attribute, for the reason the existing preferences row exists: the
attribute is emitted whatever the conditions are, so its absence means templating broke, and that is
a failure with no other symptom than a reset quietly landing on the code default.
