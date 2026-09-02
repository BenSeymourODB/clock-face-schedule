# The teacher's top bar, and the 1h/12h switch in it

**Status:** in progress — [#85](https://github.com/BenSeymourODB/clock-face-schedule/issues/85) keeps
the one decision this cannot take offline (how the switch reads from the back of the room, which
wants the hardware), and
[#47](https://github.com/BenSeymourODB/clock-face-schedule/issues/47) is the bar's second occupant,
still not-ready on three interaction decisions of its own.
**Issue:** #85 (the switch and the bar), alongside #47 (the bar's other tenant) and #34 (the scale)
**Docs:** ADR 0008, ADR 0009, `docs/brainstorms/2026-08-17-two-time-scales.md`,
`docs/plans/2026-08-19-one-hour-scale-mode.md`,
`docs/brainstorms/2026-08-22-toggles-and-the-duration-promise.md`

## What this delivers

The bar itself, and one control in it: a persistent two-segment switch between the 12-hour dial and
#34's 1-hour one. Pressing it redraws the dial and rewrites `?scale=` without a reload.

Until now the 1-hour mode was reachable only by typing a URL, which is a check a developer performs
and not a control a teacher uses.

## What was already decided, and where

Collected because five documents each hold a piece, and the pieces are what bound this work rather
than being restated as options.

| Decision | Where |
| --- | --- |
| Interactive controls live in a navigation-bar-style **top bar**, along the upper edge | ADR 0008 |
| The bar is **always visible**, not revealed on interaction | ADR 0008, settling #85's first open item |
| The bar's height is not a trade against the dial — height converts into horizontal slack | ADR 0009, #85's comment |
| The scale control is a **persistent switch showing its own position**, not a menu and not automatic switching | #34's comment, quoted in the 1-hour plan |
| A switch of that kind is what defuses the hazard of a live mode change | ADR 0008's placement/liveness section |
| `?scale=` stays, as `?demo=1` and `?check=1` do, so a board can be checked on the device | #85, the 1-hour plan's "not here" list |
| The bar is designed **once** for #85 and #47 rather than twice | #47's comment, #85's third open item |
| Nothing about the geometry needs revisiting — `analogClock` and `clockFace` already take a scale | #85's "already done" section |

ADR 0008's accessibility caveat is carried unchanged and is not something this closes: height locks
out a teacher in a wheelchair by exactly the property that locks out the children, and that is
accepted as a first pass on a pilot rather than as an end state.

## What it costs the dial, measured

ADR 0009's argument is that the dial is bound by the board's **height**, so vertical space the bar
takes comes back as horizontal room. Taken at ADR 0009's own priced case — a 100 mm bar on a 4 ft
16:9 board, which is 8.2% of that board's height, hence `8.2vh`:

| at 1920×1080, `#status` hidden | before | after |
| --- | --- | --- |
| dial | 922.32 px | **833.76 px** (−9.60%) |
| px per viewBox unit | 1.5372 | 1.3896 |
| labels' margin, panel up | 183.2 u | **244.1 u** |
| labels' margin, no panel | 234.5 u | 300.8 u |

Both margins stay far above ADR 0009's 75.4-unit knee, so the panel is still free and a card still
saturates at thirteen characters a line. The rendered dial measured **833.77 px**, against 833.76
predicted.

The ADR predicts −8.2% and this is −9.60%. The difference is the label frame, which the ADR's model
did not carry: its board had the dial at full height, and this one already spends 7.3vmin a side on
the frame cards paint into (#115). Charging the frame **twice** would have made it worse still, which
is why `#display`'s top padding is dropped and the bar sits flush against the upper edge with its own
bottom margin restating the frame below it — the same shape `#status` uses on the other side, and
`dial-frame.test.ts` holds it.

## How the switch reads

#85's remaining open item is whether the state reads at classroom distance, and it is explicit that
this is a looking question rather than a derivable one, because *"state on a switch is carried by
position and colour rather than glyph height"*. The half that **is** derivable was computed, with the
ground named each time:

| | ratio | against |
| --- | --- | --- |
| thumb `--card-foreground` | **16.13:1** | the `--card` track it slides on |
| track `--card` | 1.09:1 | `--page` |
| track edge `--border` | 4.00:1 | `--page` |
| lit label `--page` | 17.54:1 | the thumb |
| quiet label `--muted-foreground` | 6.98:1 | the track |
| focus ring `--destructive` | 3.42:1 / 4.72:1 | the thumb / the track |

The track measures 1.09:1 against the page, which is no edge at all — the same finding as ⚫'s
1.316:1 — so the track carries a `--border` outline, which is where the 4.00:1 row comes from.

**The owner's constraint, taken as given:** the bar is operated by someone within touching distance
of the board, so its *text* need not meet the dial's legibility-at-distance bar. That is why the
labels are set at `clamp(0.95rem, 1.9vmin, 1.35rem)` rather than near the numerals' 28.62 units.
It does **not** relax the state signal, and the two are worth keeping apart: ADR 0008 permits a live
scale control only because the switch is its own indicator, and an indicator nobody can read from the
back of the room is not one. So the *position* signal is the part sized for distance — a thumb
travelling its own full width, at 16.13:1 against its track — and the labels are the part allowed to
be quiet. A distant viewer also has the dial's own numerals, which change from 1–12 to 0–55.

Whether that is enough is still #85's looking question, and it wants the hardware.

## What is deliberately not here

- **The timer's controls (#47).** Three interaction decisions still open — how the digits are
  entered, whether the two display modes get icons, and whether Stop is confirmed. The bar is built
  as a flex row aligned to the right precisely so that button lands beside this switch without
  moving it.
- **A durations switch (#178).** The toggles brainstorm concludes it needs the bar *more* than the
  scale switch does — an absent duration is indistinguishable from one that did not fit — but it is
  a preference, so it lands with the persistence above rather than before it.
- **Reworking the reach affordance.** ADR 0008's "revisit when the pilot has real users" stands.
- **Making the demo fixture demonstrate the switch (#212).** The two fixtures share no ids and one
  title, so pressing the switch in the preview looks like a data swap rather than a change of scale.
  That is #34's deliberate call — a 12-hour fixture has nothing sub-hour to show a 55-minute window —
  but it means the surface `CLAUDE.md` mandates for judging rendered output cannot demonstrate this
  feature. Verified separately that the *product* is right: with demo mode off and one six-event
  calendar, the 12-hour dial draws all six and the 1-hour dial a strict subset of four, same ids.
  Merging the fixtures disturbs crowding that #67, #70, #98, #134 and #136 have each measured, and
  invalidates README's pin table, so it is #212's own pass rather than this one's.

## What rendering found that the tests did not

Two, both invisible to a green suite.

**1. `URLSearchParams` mangled an unrelated parameter.** The first version set `?scale=` with
`URL`/`searchParams` and wrote back `url.toString()`, which re-encodes the *whole* query string as
`application/x-www-form-urlencoded` — so one press on `?now=04:15&freeze=1` produced
`?now=04%3A15&freeze=1&scale=1h`. Nothing breaks; it decodes to the same pin. But `?now=04:15` is a
string a person types, reads back off a board and pastes into a PR, and README prints it in that form
a dozen times. `withScaleParam` replaces one pair textually — the scale pair moves to the end of the
query, every other pair's own text is untouched — which is also what made it node-testable instead
of living in the entry file.

**2. The fade could not be seen at all, and the reason was not a bug.** The automation browser
reports `prefers-reduced-motion: reduce`, so both the CSS transition and `main.ts`'s wait were
correctly skipped — the reduced-motion path, working. Confirming the fade needed a preview built with
the media block neutralised and `matchMedia` stubbed. Worth writing down, because the next person to
screenshot a transition in this repo will hit it and read it as a defect.

The fade's mechanism was then checked with transitions momentarily disabled, which is the only way to
read a rule's resolved value rather than an animation at t=0: `#dial[data-swapping]` resolves opacity
to 0 and back to 1, and the thumb translates 118.047 px — exactly its own width — landing on the
second segment's cell.

## What review found after that

A `/code-review` pass turned up one live defect and one piece of dead code, both in the parts of this
that no spec could reach.

**The dial could be left permanently blank.** `data-swapping` was cleared only by the fade's own
timer, and the reduced-motion branch cancelled that timer without clearing the attribute — so a board
whose motion setting changed *between* two presses ended at `opacity: 0` with nothing left to undo
it. Reproduced live on the preview. A `redraw` that threw was the second route to the same state.

The fix is a single `settle()` that every path out goes through, with the redraw in a `try` and the
attribute cleared in the `finally`: a dial showing the *old* scale is wrong, a blank one is worse and
gives a viewer nothing to report but "the board stopped working". And the swap moved out of `main.ts`
into `scale-swap.ts` — the defect was in the one file that cannot be given a spec, which is the whole
argument for the move. Four cases now cover it, and two of them were checked by reintroducing the
defect and watching them fail.

**`--bar-height: max(3rem, 8.2vh)` had a floor that could never bind.** The switch measures 53.60 px,
so the content sets the row below a 654 px-tall viewport and 48 px is under that at every size. Two
adjacent comments said otherwise — "the floor is for a laptop window" and "retuning the bar is this
one declaration". Now `8.2vh`, with the content floor stated.

**Three smaller ones, all taken.** The bar was a `<nav>`, which publishes a navigation landmark for a
bar that navigates nowhere — now `role="group"`, and `toolbar` when #47 gives it a second control to
arrow between. `withScaleParam`'s docstring claimed to leave every other byte alone when the scale
pair does move to the end. And the README quoted the panel-up margin delta without naming which
ground it was, against `CLAUDE.md`'s own rule.

**One acknowledged and not taken:** in demo mode a press renders the band twice — once from
`setScale`, once from the re-seated fixture's `setEvents`. Both happen behind a dial at `opacity: 0`,
on a control pressed a handful of times a lesson, and the only way to make it one is a combined
set-scale-and-events entry point that exists for nothing else.

**Not yet looked at on hardware:** forced-colors mode. Every colour the switch's state rides on —
thumb background, track background, both label colours — is forced there, and the real radios are
`opacity: 0`, so the position signal would have gone. An `outline`, which forced colours preserves,
now carries it. The reasoning is sound and the preview cannot emulate the mode, so what is verified
is only that the normal path is unchanged.

## The one number that lives in two files

`SCALE_SWAP_MS` in `scale-swap.ts` and `--scale-fade` in `Styles.html` are the same 180 ms: the
stylesheet fades, and the client has to know when the old picture has finished leaving before it
draws the new one. `scale-swap.test.ts` reads the declaration back and compares, because the failure
otherwise is a dial redrawn mid-fade — a flicker, which reads as a fault rather than as a mistake and
would pass every other test in the file.

## Why the dial is redrawn rather than transitioned

The two scales share no drawn element: different outer numerals, a second numeral ring, different
hand lengths, and an arc set taken from a different window at twelve times the resolution. There is
nothing to tween, so `analogClock.setScale` rebuilds the face and re-renders the arcs, and the host
hides the rebuild behind a fade. The `<svg>` element survives the swap, which is what lets one node
be faded rather than two dials cross-dissolved.

Two things a partial redraw would have left behind, and both have a test: the face is rebuilt (arcs
alone would leave a 12-hour face reading a band running twelve times faster), and it is built at the
*current* time rather than the one the dial opened on (the hands would otherwise jump back to the
load frame — #152's class of defect).

**The demo fixture is re-seated on every switch**, because both halves of it are scale-bound (#34):
`demoFixture` picks a different set of sample events per scale, and `fixtureAnchor` places it against
that scale's own window. A refresher kept across a switch would tile the 12-hour fixture's thirteen
hours across a 55-minute window. It is re-seated from `loadedAt` and never from a fresh `now()`,
which is #152's property and the one a scale switch could quietly spend: the anchor is what fixes
every event's offset from `now`, so re-reading the clock would move the fixture's *states* as a side
effect of changing scale.

## Persisting the choice, and the half of the rule that is not obvious

#85's second small decision — whether a stored value or `?scale=` wins — is settled as **both**,
split by what caused the change:

- **`?scale=` wins for what is drawn.** It is what a board is pointed at to check something on the
  device, and a setting a wall display cannot be pointed at is one that can only be checked from a
  workstation. `chosenScale` resolves it through `resolveOverride`, the same four layers
  `showEventDurations` uses — so the two settings no longer have opposite precedence, and the three
  docstrings that said they did are corrected rather than left to be discovered.
- **Only the press writes.** A URL is a look, not a decision. A board opened once on `?scale=1h` to
  inspect an arc would otherwise leave every later viewer on the 1-hour dial with nobody having
  chosen it — ADR 0008's own hazard, reached through the store instead of through the switch. Drop
  the parameter and the board returns to what was last pressed.

`PREFERENCES.dialScale` is a `oneOf` over a closed set, and its wire form **is** its URL form: `1h`
is `1h` in both, parsed by one definition, so a value the store accepts and one the URL accepts
cannot come apart. It rejects rather than repairs, unlike `parseDialScaleId` — falling back to `12h`
is right for a URL nobody can correct and wrong for a layer with another beneath it, where it would
answer for the store instead of deferring to it.

**The scale ids are restated in `shared/preferences.ts` rather than read from `DIAL_SCALES`**, and
that is the one thing here that looks like sloppiness and is not. `shared/preferences.ts` is in the
*server* bundle; reaching `shared/clock` at runtime pulls `clock-utils` and its emoji tables into
`Code.gs`, which is the trap `shared/clock/index.ts` records and the reason `doGet` leaves `?scale=`
unparsed. The type comes in through an erased `import type`; the values are restated, and
`preferences.test.ts` compares the two lists so a third scale cannot reach one without the other.
Verified rather than assumed — the built `Code.gs` contains no `DIAL_SCALES`, no `describeArc`, no
`assignRings` and no emoji table.

Checked end to end on the built bundle, with a stored `dialScale=1h` templated onto the mount and the
bridge stubbed to record what it is asked to save:

| | dial opens on | written on load |
| --- | --- | --- |
| stored `1h`, no parameter | 1-hour | nothing |
| stored `1h`, `?scale=12h` | 12-hour | nothing |
| then pressing **1 hour** | 1-hour | `dialScale=1h` |

## The platform fact this ran into

**The address bar does not change on the deployed app, and cannot.** The page runs inside an
HtmlService sandbox iframe on a `googleusercontent.com` origin, so `window.location` belongs to the
*frame* — the `script.google.com/…/exec?scale=1h` URL a teacher typed belongs to the parent document,
which this page may not touch. `doGet` templates that parameter onto the mount instead, which is
exactly why `chosenScale` prefers the attribute over the query string.

So `recordScale` writes **both**: the attribute, which is what anything re-reading the page believes,
and the query string, which is the URL on `build/preview.html` where the page *is* the document. On
the deployed app the second half is a no-op that costs nothing and keeps one code path. The call is
wrapped, because `replaceState` throws in a sandbox without `allow-same-origin` and a display must
not stop working over a URL it could not rewrite.

`replaceState` and not `pushState`: a back button that silently un-toggles a wall display is worse
than no history at all.
