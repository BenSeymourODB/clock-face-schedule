# Design notes

Early architectural decisions for `clock-face-schedule`. Decisions are recorded as short
ADR-style entries and will grow as the project does.

## Architecture at a glance

```
Google Apps Script project                          Browser (kitchen / wall display)
┌──────────────────────────────┐                    ┌────────────────────────────────┐
│ Code.gs                      │  doGet → HTML      │ Index.html                     │
│  ├ doGet()  ──────────────────────────────────────▶│  ├ <svg> dial                 │
│  └ getEvents()               │                    │  ├ Client.html  (bundled JS)   │
│      └ CalendarApp ──▶ Google│  google.script.run  │  │   ├ shared/clock/* geometry │
│         Calendar             │◀───────────────────▶│  │   └ render/* SVG builders   │
│      └ CacheService          │  ISO-8601 events    │  └ Styles.html (CSS tokens)    │
└──────────────────────────────┘                    └────────────────────────────────┘
```

The server is a **calendar adapter and nothing else**: it fetches events for a window, maps
them to a plain JSON shape, and caches. All geometry, layout, and rendering happen in the
browser, where the hands have to tick anyway.

---

## ADR 0001 — Google Apps Script as the runtime

**Status:** accepted

**Context.** Both prior implementations spent most of their infrastructure budget on getting
authorised access to a calendar, not on drawing the dial. NDWC needed NextAuth, a Google OAuth
client, server-side refresh-token storage, and a Postgres instance; `yuvomi-kiosk` needed a
Yuvomi server plus a kiosk token-provisioning scheme. The artefact in both cases is a
read-only wall display for one household.

**Decision.** Implement the dial as a **Google Apps Script web app**. `CalendarApp` reads
calendars under the script owner's own authorisation — the OAuth consent is the script's
install prompt, and there is no client secret, no refresh token to store, and no database.
`HtmlService` serves the page from Google's infrastructure, so there is nothing to host and
nothing to keep patched on the wall device.

**Consequences.**
- A constrained runtime. No ES modules server-side, client JS must be inlined into `.html`
  files, and the client↔server bridge is `google.script.run` rather than HTTP. ADRs 0002–0004
  deal with the consequences.
- Apps Script quotas apply. Well within limits for a 5-minute poll (see ADR 0006).
- Loses NDWC's write path (event create/edit) — this is a read-only display. `CalendarApp` can
  write, so that door stays open, but it is out of scope.
- Vendor lock-in to Google Calendar is total. Acceptable: it was already the only data source.

## ADR 0002 — TypeScript compiled by esbuild, pushed by clasp

**Status:** accepted

**Context.** The reusable half of this project is ~550 LOC of TypeScript already extracted and
tested in `yuvomi-kiosk` (see "Inherited work"). Keeping it as TypeScript keeps that lift
verbatim and keeps its vitest specs runnable. But **clasp 3.x no longer transpiles TypeScript** —
that was removed in the 3.0 rewrite, and TS projects are now expected to bundle before pushing.

**Decision.** Author in TypeScript; bundle with **esbuild**; push the bundle with **clasp**.
Two entry points produce two artefacts:

| Entry | Format | Output | Notes |
| --- | --- | --- | --- |
| `src/server/main.ts` | IIFE | `build/Code.gs` | Plus a generated footer re-declaring every export as a top-level `function` |
| `src/client/main.ts` | IIFE | `build/Client.html` | Bundle wrapped in `<script>…</script>` by a post-build step |

Static files (`appsscript.json`, `Index.html`, `Styles.html`) are copied into `build/`, which
is `rootDir` in `.clasp.json`. `clasp push` therefore uploads only generated output.

**Consequences.**
- One build step between editing and seeing a change. Acceptable; `esbuild --watch` plus
  `clasp push --watch` keeps it short.
- The Apps Script online editor becomes read-only in practice — edits there are overwritten by
  the next push. This extends to **deployment configuration**: `executeAs` and `access` live in
  `appsscript.json`, and the UI's deployment dialog writes back to that same file, so the two
  can silently diverge. `npm run push` passes `--force` for this reason. Without it clasp prompts
  before overwriting a differing remote manifest, declining skips the *entire* push rather than
  just the manifest, and with no TTY it auto-declines and exits 0 — a scripted push that uploads
  nothing and reports success.
- **The footer is structurally required — resolved on the deployed scaffold (#1).** A probe
  deployed two functions: one declared at top level by the footer, one only assigned onto
  `globalThis` from inside the bundle. The declared one was reachable; the assigned one was not
  present on `google.script.run` **at all** — the client-side failure was "no such method",
  not a server-side lookup error.

  That places the constraint in the client stub list rather than in server name resolution:
  Apps Script generates `google.script.run`'s methods from a static scan of top-level function
  declarations when it serves the page, so a global assigned at runtime is invisible to it. No
  amount of server-side cleverness can work around that, and the footer can never be dropped.

  Because forgetting a footer entry fails silently in the browser rather than at build time, the
  footer is **generated from the bundle's own export list**, not hand-maintained. Adding an
  `export` to `src/server/main.ts` is the whole of the work. esbuild only reports exports for
  `esm` output, so the build harvests them from a throwaway in-memory `esm` pass alongside the
  real IIFE one.

## ADR 0003 — Geometry and rendering run client-side; the server is a calendar adapter

**Status:** accepted

**Context.** The work splits into fetching events (needs Apps Script) and turning them into a
dial (needs a DOM and a per-second tick). It could be divided at several points: the server
could return raw events, pre-computed arc angles, or a fully-rendered SVG string.

**Decision.** The server returns **plain event objects and nothing more**. Every derived value
— period bounds, arc angles, ring indices, title fitting, label positions — is computed in the
browser.

**Consequences.**
- One geometry codebase, running in one environment, tested in one place. Had the maths been
  split across `.gs` and the client, the ported modules would have had to be bundled twice and
  reasoned about under two runtimes.
- The hands tick without a server round trip, and re-layout on resize is free.
- Geometry changes need only a client rebuild.
- The server's testable surface shrinks to a pure mapper (`CalendarApp.CalendarEvent` → the
  wire shape), which is the only part worth unit-testing there.

## ADR 0004 — Vanilla SVG DOM builders, no UI framework

**Status:** accepted

**Context.** NDWC's dial is ~860 LOC of TSX across four components. `yuvomi-kiosk` is rewriting
those in Svelte 5 and had to stand up a client vitest project first, because its only vitest
project is node-environment and explicitly excludes component specs (yuvomi-kiosk#49 gates four
of its six port issues).

**Decision.** Render with plain functions that build SVG DOM nodes via
`document.createElementNS`. No framework, no build-time template language, no component
runtime.

**Consequences.**
- No framework bundle inlined into the HtmlService payload.
- The component test harness problem disappears. A function returning an `SVGGElement` is
  testable under vitest + jsdom with no special project configuration — cheaper than testing
  either React or Svelte components.
- Updates are manual and must be deliberate. The strategy: build the full tree once per data
  refresh, keep references to the three hand elements, and mutate only their `transform` on the
  per-second tick. ~~A period rollover (AM→PM) triggers a rebuild.~~ **#25 removed that trigger
  deliberately**: the window now moves continuously, so there is no rollover to key on. Arcs rebuild
  on a calendar-minute change plus three finer triggers — a change in the elapsed count, a change in
  which events the panel has named, and anything currently in progress (so a drain animates). See
  `analog-clock.ts`, which carries the replacement and the reason.
- Loses JSX's readability for nested markup. Mitigated by a small `svg(tag, attrs, children)`
  helper so builders read close to the TSX they replace.

## ADR 0005 — Browser-local time is authoritative for the 12-hour period

**Status:** accepted

**Context.** An Apps Script project has a `timeZone` in its manifest, and server code runs in
it. The browser runs in the device's zone. `getPeriodStart()` picks midnight or noon from
`Date.prototype.getHours()`, so if the two disagree the arcs and the hands are drawn against
different periods — the failure is silent and looks like a data bug.

**Decision.** The server emits **ISO-8601 timestamps with explicit UTC offsets** and never
sends a bare date-time. The client parses them and does all period maths in browser-local
time. The manifest `timeZone` is set to the household zone for tidiness but is not relied on
for correctness.

**Consequences.**
- Follows from ADR 0003 at no extra cost, and is the reason ADR 0003 is worth the discipline.
- All-day events have no offset by nature (`CalendarApp` reports them as midnight-to-midnight
  in the calendar's zone). They are excluded from the dial anyway — `filterEventsForPeriod`
  drops them — and belong in a separate aside. Their wire format needs its own decision when
  that aside is built.
- DST transition days contain a 23- or 25-hour civil day. One of that day's two periods is not
  12 hours long, so arcs on it are proportionally skewed. NDWC has the same behaviour. Noted,
  not fixed.
- The client reads "now" through a single time source (`src/shared/clock/time-source.ts`), which
  `?now=` / `?freeze=1` displace for visual review (#72). That sits **inside** this decision rather
  than beside it: the pin is browser-side, `doGet` passes the parameter through as authored and
  parses nothing, and a pinned dial labels itself on screen.

## ADR 0006 — Poll every 5 minutes, cache server-side for 60 seconds

**Status:** accepted

**Context.** A wall display runs unattended for weeks. `CalendarApp` calls consume a daily
quota, and `google.script.run` round trips are slow enough (typically 0.5–2 s) to be worth
avoiding on a hot path.

**Decision.** The client polls `getEvents` every 5 minutes ~~and on period rollover~~ (**the rollover
trigger went with #25, as in ADR 0004 — the poll is the interval alone**). The server
memoises the response in `CacheService.getUserCache()` for 60 seconds, so a reload storm or a
second open tab does not multiply calendar reads.

**Consequences.**
- ~288 calendar reads per day. Comfortably inside quota.
- Up to 5 minutes of staleness after an event is edited elsewhere. Acceptable for a wall
  display; a manual refresh affordance is cheap to add if it grates.
- ~~Failure states need designing~~ — **shipped, in `src/client/schedule-status.ts`, and with a
  distinction this ADR did not ask for.** A stale-but-rendered dial is better than a blank one, so
  the client keeps the last good payload and marks it visibly stale rather than clearing. The state
  is a four-way type — `loading | live | stale | unavailable` — whose central split is **never
  loaded** versus **loaded and now failing**: the first has nothing to show and says so, the second
  has a dial worth leaving up. On a repeated failure the status keeps the **original** failure time
  rather than advancing it, so "stale since" answers *how long has this been wrong* rather than
  *when did we last retry*, which is the question someone standing at the board is asking.

## ADR 0007 — Keep NDWC's CSS custom-property names

**Status:** accepted

**Context.** NDWC's SVG styles itself from shadcn/ui semantic tokens: `var(--card)`,
`var(--border)`, `var(--card-foreground)`, `var(--muted-foreground)`, `var(--destructive)`.
This project ships no Tailwind and no shadcn. `yuvomi-kiosk` chose to rename these to a
`--kiosk-*` set, which means every ported attribute string had to be edited.

**Decision.** Define our own values under **the same five variable names** in `Styles.html`.

**Consequences.**
- The ported SVG markup carries across without touching a single colour reference, which
  removes a whole class of transcription error from the port.
- The names read oddly outside shadcn — `--destructive` for the second hand is inherited
  vocabulary, not a description. Documented at the definition site rather than renamed.
- A dark wall-display palette is the default; ~~the token indirection leaves a light variant
  available without touching the builders.~~ **No longer true, and #81 should not be planned on it.**
  The indirection still carries *painting* — every colour reference in the ported markup is a
  `var()`. But every contrast floor added since #27 measures against a **spelled-out hex**, because a
  floor has to know the ground it is measured on and CSS variables are not readable from the geometry
  (`src/shared/` compiles without the DOM lib, per ADR 0003). There are three: `BAND_BACKGROUND`,
  `BAND_FOREGROUND` and `BLACK_TEXT` in `event-arc.ts`. A light variant therefore *does* touch the
  builders — it has to re-derive those floors against the light ground, which is most of #81's work
  and the reason it is not a stylesheet change.
- **Six colour tokens ship, not the five this ADR names.** `--page: #0c0e12` was added beside the
  shadcn five and is the ground the band is drawn on — the same value `BAND_BACKGROUND` hard-codes,
  which is exactly the duplication the bullet above is about. (`--label-frame` is a seventh custom
  property but a layout one, not a colour; it belongs to ADR 0009's frame.)

---

## ADR 0008 — Interactive controls sit in a top bar, out of small children's reach

**Status:** accepted, explicitly provisional

**Context.** Everything built so far renders a calendar nobody touches, so there were no controls
to place. Two planned features change that: a teacher-set countdown timer, and the 1h/12h scale
toggle. Both are operated by an adult, mid-lesson, on a wall-mounted touch smart board in a room
full of children — several of whom will press anything within reach, and one of whom pressing
"cancel timer" during a lesson is a real cost rather than a hypothetical one.

**Decision.** Interactive controls live in a **navigation-bar-style top bar**, along the upper edge
of the display. Height is the affordance: an adult standing at the board reaches it easily and a
five-year-old does not.

**Consequences.**

- It works, and it is close to free — no modes, no gestures to teach, no state to get wrong.
- **It trades one accessibility problem for another, and this is understood, not overlooked.** A
  teacher who uses a wheelchair, or who is simply short, is locked out by the same property that
  locks out the children. That is not acceptable as an end state; it is acceptable as a first pass
  on a pilot deployment where the affected user can say so.
- Height is a **weak lock** in any case. It stops the youngest students and nothing else. The
  durable answers are a deliberate gesture (long-press, two-finger tap) or a short PIN — hostile to
  casual pressing rather than to short people — and either would supersede this.
- **The bar is always visible.** This was recorded as unsettled — a persistent bar costs vertical
  space on a page whose dial is square and already tight for radius, against revealing on
  interaction, which keeps the radius but adds the discoverability problem a wall display can least
  afford. ADR 0009 settles it, and reverses the premise: the dial is bound by the board's *height*,
  so vertical space the bar takes converts into horizontal room rather than being lost. A 100 mm bar
  on a 4 ft 16:9 board shrinks the dial 1219 mm → 1119 mm (−8.2%) and *raises* the horizontal slack,
  measured in the dial's own units, from 466.7 to 562.0 — 95 units that ADR 0009 hands to the panel
  and the labels. It is also the only option under which a
  persistent 1h/12h switch is its own state indicator — see the placement/liveness distinction below.
- "Up high" is not one physical height. A projector screen, a wall-mounted board and a desk-height
  display put the same top bar at very different reaches. Verify on the hardware (#10).

**This ADR governs placement, not whether a control may be live.** Those get conflated, so the
distinction is worth stating: the hazard recorded in the two-time-scales brainstorm — that a person
glancing at a wall display has no way to know a mode was changed — applies only to a control that
**changes the meaning of what is already on screen**. A 1h/12h scale toggle is such a control: after
it, the same arcs mean something different and a later viewer misreads them silently.

A control that **adds or removes a self-describing element** carries no such hazard. Starting a
timer is the clear case: the timer is evidently present or absent, nothing else on the dial is
reinterpreted, and no viewer can be misled by its appearance. Live controls of that kind are fine,
and the timer's start, pause and stop are all of that kind.

**Two buckets are not enough, and a shipped control already falls between them.** Applied cold, the
test above puts `showEventDurations` (#178, shipped in #191) in the safe bucket — it removes text,
and text is evidently there or not. That is the opposite of the truth, and the counter-example is
already stated in the source that ships it: **an absent duration is indistinguishable from one that
did not fit**, which is the display's own failure mode rather than a legible setting. The element is
not self-describing, because its absence has two possible causes and the viewer cannot tell which.

So the discriminator is not *added-or-removed* versus *reinterpreted*. It is whether **the absence is
one a viewer can account for from the picture**:

- An arc too small to hold text visibly has no room — the absence explains itself.
- A card with room that simply lacks a duration reads as arbitrary, because to the viewer it *is*.

Where a channel cannot be given to every element, prefer a setting that applies to all of them over a
per-element negotiation that varies for reasons only the renderer knows — which is the rule #175 was
reverted to establish, and #178 is its first application.

**Revisit when** the pilot has real users, or as soon as anyone the top bar excludes is among them —
whichever comes first.

---

## ADR 0009 — The board's spare width, allocated once

**Status:** accepted

**Context.** The dial fills a square 600-unit viewBox on a page with nothing beside it. Three
features want the horizontal room a widescreen board has spare, and #39 records that it should be
allocated once rather than three times: the agenda panel (#36), floating-label distance (#30), and
the labels' basic margin, which #21 left at 25.7 units of usable width at nine o'clock.

The allocation could not be settled from the geometry alone, because the geometry has no opinion on
how large the dial ought to be. The missing input was the deployment: **16:9 or 16:10, about 4 ft
tall, viewed from across a classroom, and the dial may occupy between a half and two thirds of the
width and still read.**

**Decision.** The dial keeps the board's full height. It is **centred in the width that remains
after the panel**, and the panel is **180 units wide, on the right**.

**Consequences.**

- **The dial never pays.** At full height it is 56.3% of a 16:9 board's width and 62.5% of a 16:10
  board's — inside the stated range on both, with a persistent top bar and without. The legibility
  pass (#9, #14, #16, #20) is safe by construction rather than by negotiation.
- **Both label margins are equal**, because the dial is centred in the remainder rather than on the
  board. That removes the per-side semi-axis #39 worked out was necessary under a board-centred
  dial, and keeps `sin θ = 0` on centre so 12 and 6 o'clock keep vertical connectors.
- **The locus stays a circle.** Guaranteed card width — `min(labelWidthLimit, faceClearanceLimit)`
  minimised over the half-dial — saturates at **155.2 units, 13 chars a line, for any margin at or
  above 75.4**. A 180-unit panel leaves 143.3 units of margin on 16:9 and 90.0 on 16:10, both past
  the knee. Labels go from today's 8 chars a line to 13 with no change to the locus at all.
- **#88's ellipse is not needed and should not be built.** It exists to spend a margin below the
  knee, where the circle binds early; it buys 11 chars against the circle's 8 at today's 50.4-unit
  margin, and *nothing* past 75.4. Granting the margin dominates it outright, and avoids the
  band-occlusion cost (#98) that the inward optimum carries.
- **A locus that clears the band outright is available at 3 and 9 o'clock, and on 16:9 it is free.**
  Measured after the fact, prompted by looking at the board (#30, #98): a card clears the band when
  its locus is `292 + W/2` (**a three-o'clock point solution, and not a locus — see the third
  amendment**), which against `m` units of margin resolves to `W = m + 8` — **151.3 units
  at 16:9's 143.3**, holding the same 13 characters a line as the 155.2 above, so a card that never
  covers an arc carries exactly as much text as one that does. On 16:10 it costs 5 characters a line
  (98.0 units, 8 a line). It is *unavailable* at 12 and 6, where the dial fills the height and a
  band-clearing card would sit 22.5 units (one line) to 96.1 units (four) above the frame — off the
  board. So this removes #98's collisions on the sides by construction and leaves them at the top and
  bottom, which is the mirror image of the ellipse's asymmetry.

  **Three claims in that bullet are wrong, and the fourth amendment corrects them together**: the
  16:10 penalty is 2 characters and not 5, "12 and 6 are unavailable" measures against the viewBox
  rather than the frame that exists there, and the collisions on the sides are removed by the
  *locus*, which is unbuilt — not by the margin, which shipped.
- **180 is the smallest width that serves the panel's own justification.** It holds 10 characters a
  line at 26 units (**13 at the 21.2576-unit body the third amendment adopts**, 12 once #160's swatch
  is paid — but see `card-swatch.ts`: one character *a line* is the per-line cost and not the whole
  cost, because a title sitting on a wrap boundary buys a whole extra **line**, and over 251 cards
  the shipped 8 + 4 reserve costs 37 wrapped lines against a narrower 4 + 3's 14), and on a 4 ft
  board 26 units is 53 mm — comfortable reading at 8 m by the
  conventional distance/150 rule. That is the size at which the panel can carry the names of a
  three-deep cluster, whose arc titles render at 6.24 units, 12.7 mm, legible to about 2 m (#70).
  (**5.98 units** for a three-deep title that *wraps*, once the clearance cap binds — #90. Millimetres
  per the amendment below rather than this line: 7.0 mm and 1.1 m for the one-line figure as the dial
  actually renders, 6.8 mm and 1.0 m for the wrapping one. Either way this argument rests on the panel
  carrying the name the arc cannot.)
- **16:10 is the binding case and the ceiling is 209 units.** Past that the margin drops below the
  knee and the panel starts taking width from the labels one-for-one. 180 leaves 29 units of
  headroom; anything wider should be re-measured rather than assumed. (**270.7, not 209** — this
  figure is pre-#115 for the same reason the margin table below is. See the third amendment.)
- **The panel holds five cards** at 26 units over three lines, seven at two lines. That confirms the
  agenda brainstorm's estimate from the other direction, and with it that **scrolling is the general
  display mode and whole-day the special case** (#41). (**Six and eight at the 21.2576-unit body** the
  third amendment adopts and #174 shipped — and 6–7 as the fixture actually renders, since a column of
  mixed one- and two-line titles packs tighter than either pure case. The bound, and so #41's
  conclusion, is unaffected.)
- The narrow-display fallback (#39 item 4) is unchanged and still needs designing: as the board
  approaches square the margin falls below the knee and the panel has to collapse or stack.
  **Still true of the *designed* answer, and no longer true of the tree, which now has an
  undesigned one**: below a measured threshold of **1.5513** content aspect the panel is *hidden
  outright* — neither collapsed nor stacked — so a narrow board draws no agenda at all and #70's
  names have nowhere to go there. That is a shipped behaviour nobody chose; #171 owns picking
  between it, a collapse and a stack. Read "still needs designing" as "the tree took the third
  option by default", not as "nothing happens yet".

**Measured, not argued** — with one exception. Everything above is arithmetic over the dial's own
constants, and per `CLAUDE.md` none of it is evidence of *legibility* until it is rendered at board
proportions. Two figures in particular are budgets rather than measurements: the character counts
come from `CHAR_WIDTH_RATIO = 0.6`, which is deliberately crude, and the distance/150 rule is an AV
signage convention rather than a measurement of these glyphs at this contrast.

**The dial takes 85.4% of the board's height, not all of it** (#115). This ADR opens by giving the
dial the board's full height, and the page did far worse than that until #115: 600 px on any display,
because `#dial`'s percentage width resolved against a grid track sized by the SVG's own 600-unit
attribute. The sizing rule now reads the display — but implementing it showed that the frame floating
labels paint into was never accounted for. A 600 px dial centred in a 1080 px page left 240 px of
slack above itself, and that slack was the frame; a dial sized to the board has none, and a card
reaches up to 50.4 units past the 600-unit viewBox. Covering that takes 7.3% of the shorter viewport
axis, which leaves the dial 85.4% of the height.

So the millimetres here derate by **0.854**, not by the 1.0 this ADR assumed or the 0.556 it
rendered at: 26 units is 45 mm rather than 53, the distance/150 rule gives 6.7 m rather than 8, and a
180-unit panel is 313 mm rather than 366. The unit arithmetic and the 180-unit choice are unaffected.

That 14.6% is a fourth claimant on the same pot, and it was not one this ADR weighed. It is paid out
of the height rather than the width, so it does not change the panel's 180 or the label margin's
knee — but it is the dial paying, which is the one thing this ADR says must not happen, and it is
paying for the labels. #121 is the cheaper answer if there is one: bound a card's *edges* vertically
the way `labelWidthLimit` already bounds them horizontally, and the frame shrinks back toward nothing.

**The margin figures above are understated, for the same reason** (#30 item 1). This ADR computes the
board's width as `600 × aspect`, which is only the board's width in dial units if 600 units *is* the
board's height. At 85.4% it is not, so the same board is proportionally wider measured in dial units
and the margin grows with it:

| | board width, in dial units | margin per side |
| --- | --- | --- |
| 16:9, dial at full height — as stated above | 1066.7 | 143.3 |
| **16:9, dial at 85.4% — as it renders** | **1249.0** | **234.5** |
| 16:10, dial at full height | 960.0 | 90.0 |
| **16:10, dial at 85.4% — as it renders** | **1124.1** | **172.1** |

Measured off the rendered page as well as derived: at 1920×1080 the dial draws 922.3 px for its 600
units, so the viewport is 1249.0 units and `(1249.0 − 600 − 180) / 2 = 234.5`. The amendment above
says "the unit arithmetic and the 180-unit choice are unaffected", and that holds for the knee (75.4)
and the saturation ceiling (155.2) — both properties of the locus, not of the board — and for the
180-unit choice and the 209-unit ceiling, which both move further inside their headroom. It does not
hold for the margin figures, which is what this table corrects.

Nothing downstream changes: both aspects were already past the knee at the understated figures, so
labels get the same 13 characters a line either way. The correction matters for the 16:10 penalty the
ADR reports on a band-clearing locus — at 172.1 rather than 90.0 that penalty disappears — and for
anyone reading 143.3 as the number the renderer is handed.

**Three figures above are superseded, and one of them is a decision rather than a correction**
(#174, #138). Taken together after the panel was built (#173) and the fork was scoped:

**1. The ceiling is 270.7 units on 16:10, not 209.** Same cause as the margin table above — 209 was
computed from `600 × aspect`, i.e. a dial filling the board's height. Against the margin the renderer
is now handed, the panel may take 395.7 units on 16:9 and **270.7 on 16:10** before the labels fall
to the 75.4-unit knee. So the headroom past 180 is **90 units, not 29**. This is a correction to a
number, not licence to spend it: 180 was chosen for the panel's own legibility rather than as the
most it could take.

**2. The panel's body is 21.2576 units rather than 26** — the arc-title size, decided on #174 and
**shipped there**. The panel was the second-loudest text on the display, above every arc title and
above the floating-label cards it shares its styling with, which inverts the relationship between a
surface and the surface it exists to serve.

**21.2576, not the 21.26 this amendment first wrote.** A lone arc's title is
`roundCoord(75.92 × 0.28)` and `roundCoord` keeps four decimals, so 21.26 is a two-decimal shorthand
that is 0.0024 units *above* the arc title — the one relationship the change exists to invert.

**The constant is a literal, and deliberately so — #194 reversed the derivation this amendment first
described.** Written as `roundCoord(bandHeight * TITLE_FONT_SIZE_RATIO)` the expression is not
elidable by esbuild, and it drags dial geometry plus `roundCoord` into the **server** bundle through
`map-event.ts`'s barrel import — measured at +322 bytes of `Code.gs` for a value the server never
reads. So `panel-layout.ts` types `21.2576` and `agenda-panel.test.ts` asserts it against the size
`computeArcTitleLayout` returns for the ring the dial actually draws: the guard keeps the two in step
without the expression crossing the bundle boundary. See Platform constraints for the general rule.

Consequences, all of them gains except the last:

| | at 26 | at 21.2576 |
| --- | --- | --- |
| characters a line, before #160's swatch | 10 | **13** |
| characters a line, **as it ships** | 9 | **12** |
| three-line cards that fit | 5 | **6** |
| two-line cards that fit | 7 | **8** |
| `HH:MM–HH:MM` (11 chars, #169) | unaffordable | **affordable** |
| reading distance, distance/150 | 6.77 m | **5.53 m** |

The cost is 1.24 m of reading distance, and it is real — but the arc titles the panel exists to
rescue are at 21.2576 and below, so a panel at the arc-title size is still the most readable
statement of an event's name anywhere on the display, and #70's argument for the panel survives
intact.

**Measured on the rendered page, not just derived** (#174). Method, so it can be rerun: 48 pins
(every half hour across 24 hours) × 2 scales = **96 rendered states per board**, `#status` hidden, at
1920×1080 and 1920×1200. A card counts as ellipsized when any of its title lines ends in an ellipsis,
counted per *card* rather than per line. The `at 26` column is a rebuilt bundle with both
`PANEL_CARD_FONT_SIZE` and `PANEL_CARD_STROKE` at their old values — reverting the font size alone
leaves the new 1.7006 stroke in place and does not reproduce the 571.64:

| | at 26 | at 21.2576 |
| --- | --- | --- |
| cards drawn | 489 | **593** |
| of those, ellipsized | 161 (**32.9%**) | 156 (**26.3%**) |
| cards per dial | 5–6 | **6–7** |
| worst card bottom, against the 600-unit column | 571.64 | 578.78 |

**104 more events named, and fewer titles cut even in absolute terms.** 16:9 and 16:10 render
identically, which follows from the panel being a fixed 180 units — the boards differ in the *labels'*
margin, not the panel's.

`?scale=1h&now=04:15&freeze=1` is the pin that settles the looking question the arithmetic could not:
a **three-deep** cluster whose titles render at **6.2356 units** — 5.9821 for the one that wraps —
against a panel that names all three. The panel remains obviously the more readable of the two
surfaces, which is the property #70 depends on. (The fixture's **four-deep** cluster is on the 12-hour
scale, where the same `?now=04:15` renders its titles at **4.3578**, and its worst arc — the wrapping
`Swimming Group B Kit Check and Coach Handover` — at 3.2996. Both pins make the point; they are
different clusters at different depths, and an earlier draft of this amendment conflated them.)

**What it does not fix, and the width lever is the answer:** titles still ellipsize at 26.3%. One card
at `?now=03:00&freeze=1` cuts mid-word (`Staff Debrief a...`) and **two** do at the 1-hour pin
(`Reading Circle an...` and `Assembly Notes and...`). The type lever cannot reach those — the column is
180 units wide.

**The width lever is deliberately not taken.** #174 prices a panel up to 270.7 and #177 wants the
same units to grow a card rather than ellipsize its title — 21 titles a sweep truncate where the
board has room. Those are one allocation, which is the mistake this ADR exists to prevent making
three times, and how far a card may grow is #138's fork. **So the type lever ships now and the width
lever waits on #138.**

**3. `292 + W/2` is a three-o'clock point solution, not a locus.** Away from three o'clock a card's
*corner* reaches inward, so a circle at that radius re-enters the band — by 1.52 units for a one-line
card and **16.18 for a four-line one**. The curve that follows from the constraint rather than being
guessed at it is the card's own radial half-extent, offset from the band:

```
R(θ) = 292 + (W/2)·|sin θ| + (H/2)·|cos θ| + gap
```

whose closest approach is exactly 292.000 at every line count, by construction. Two things it does
**not** do, both recorded because the short version of this got them wrong:

- **It does not reduce to the 367.6 above unless `gap = 0`** — and `gap = 0` is exactly #117's
  failure, where the card's inner edge lands *on* the band and the connector has nothing to draw. It
  generalises the ADR figure or it resolves #117, not both. `gap` is an open decision.
- **It has no term for the board's outer limit.** The furthest card edge measures 444.1 against
  16:9's 443.3, and `gap` makes that worse unit for unit. `W` wants clamping against the board.

**Fourth amendment — the margin the renderer is handed is smaller than every table above says,
once the panel is drawn.** This is the correction with the most downstream reach in the document, and
it is the one a reader is most likely to act on without noticing.

The margin table above gives 234.5 on 16:9 and 172.1 on 16:10, and closes by saying the correction
matters "for anyone reading 143.3 as the number the renderer is handed". Since #173 the host divides
the **board row** rather than the viewport whenever the panel is up, because the frame on that side
*is* the panel and granting more would grant a card permission to paint over the agenda:

| | margin per side, no panel | **as handed, panel drawn** |
| --- | --- | --- |
| 16:9 | 234.5 | **183.2** |
| 16:10 | 172.1 | **120.8** |

`src/client/main.ts`'s own docstring states the transition — *"16:9 goes 234.5 → 183.2 and 16:10
172.1 → 120.8, both still saturated"*. Both rows are correct about different boards: 234.5 / 172.1
are the allocation, and are what a board below the panel threshold actually grants. **Neither is what
the labels receive on a board that draws a panel, which is every board above 1.5513.**

Nothing about guaranteed card width moves — 120.8 is still past the 75.4 knee, so labels keep their
13 characters a line either way, which is why this shipped without anyone noticing. What moves is
every figure *derived* from the margin:

- **The 16:10 penalty on a band-clearing locus is 2 characters, not the 5 this ADR states and not the
  0 the placement-fork brainstorm concluded.** At 120.8, `W = m + 8 = 128.8` gives 11 characters a
  line against the circle's saturated 13. On 16:9 at 183.2 it is 17 — still a gain, still not free.
  Both prior figures were computed at a no-panel grant.
- **A band-clearing locus is not "unavailable" at 12 and 6.** Those 22.5-to-96.1-unit figures measure
  how far the card sits past the **600-unit viewBox**, not above the frame — and `Styles.html` grants
  `--label-frame: 7.3vmin`, **51.3 dial units**, precisely so a card may paint there. One- and
  two-line cards (22.5, 47.1) fit inside it; three- and four-line ones (71.6, 96.1) do not. The
  boundary is a line count, not a hard no.
- **The margin alone does not remove #98's collisions on the sides.** That is true of the
  band-clearing *locus* this ADR pairs with the margin, and the locus is unbuilt — `analog-clock.ts`
  still draws the plain circle at 1.02 of the outer radius, and `gap` is still an open term (#117,
  #138). The margin shipped; the clearance did not.

**Any table computed from 234.5 or 172.1 for a board that draws a panel is stale**, including the
band-clearing radii and the panel-leader geometry in `docs/brainstorms/2026-08-21-label-placement-fork.md`.
Re-run them at 183.2 and 120.8 before briefing #138's spike.

**Revisit when** the pilot board is up (#10) and the panel has been looked at from the back of the
room, or if a target display falls outside 16:9–16:10.

## ADR 0010 — Staging tracks `main`, production is promoted by hand

**Status:** accepted

**Context.** `npm run push` uploads a bundle; it does not deploy one. A web app serves whatever
*version* its deployment points at, so a push on its own changes nothing anyone can see — the
board's contents were a function of who last remembered to open the UI and click Deploy.

The reason this had not been automated was a belief that a new deployment means a new URL. That is
true of `clasp create-deployment`, and fatal: the classroom board is a bookmark, and ADR 0001 already
accepts an ephemeral *iframe* origin, so the one stable address in the whole system is the `/exec`
URL. But it is not true of `clasp update-deployment` (alias `redeploy`), which clasp has had all
along and nothing here used.

Measured on 3.4.0: `create-deployment` and `update-deployment` both call the same
`clasp.project.deploy(description, deploymentId, versionNumber)`, and with `versionNumber` omitted
that function does two things — `projects.versions.create` to snapshot what was last pushed, then
`projects.deployments.update` to repoint an existing deployment at it. So "deploy the latest pushed
code to a fixed URL" is one command, and the version history is a real audit trail rather than a
side effect.

**Decision.** Two slots on one script project, driven by `.github/workflows/deploy.yml`. A push to
`main` redeploys **staging**; publishing a **release** redeploys **production**; a
`workflow_dispatch` covers what neither does. Deployment identity lives in a GitHub environment
variable, so one job body serves all three.

Releases already carried this meaning in the repo before any of it was automated — the one existing
release exists to hold the deployed URL as a bookmark. So the promotion signal was already being
produced by hand; the workflow only had to read it. Nothing new to remember, and the tag gives the
deployed version a name, which a dispatch cannot.

One script project rather than two is safe because versions are immutable: deploying staging cannot
move what production is pinned to. It also keeps `SCRIPT_ID` and the manifest single-valued.

**Consequences.**
- **The release trigger is `published`, not `released` or `prereleased`.** `published` is the only
  type that fires for both a stable release and a pre-release, including one published from a draft
  — which `prereleased` does not. This repo's releases are pre-releases, so either narrower type
  would have meant a production deploy that never ran and reported nothing. The cost is that
  "pre-release" carries no staging/production distinction here; `[released]` buys that back if the
  distinction is ever wanted, and would then require releases to stop being pre-releases.
- **A release deploys its tag, not the event's commit.** The checkout names
  `github.event.release.tag_name`, so what reaches production is what the release points at even
  when a release is cut from an older commit — which makes republishing an older tag a rollback.
- **One expression decides the slot, and it is repeated four times** — `concurrency`, the job name,
  `environment.name`, `SLOT` — because Actions has nowhere to name it once: `env` is not a context
  the first three can read, and the format has no anchors. The repetition is the risk, not the
  duplication: `environment.name` selects both the reviewers that gate the run and the
  `CLASP_DEPLOYMENT_ID` in scope, so three-of-four edited would gate on staging while redeploying
  production. `scripts/deploy-workflow.test.mjs` asserts the four are byte-identical.
- **`-d` is effectively mandatory.** clasp writes `deploymentConfig.description` on every redeploy,
  defaulting it to `''`, so a redeploy without a description does not preserve the old one — it
  blanks it. Since Apps Script has no *name* for a deployment, that description is the only label
  distinguishing the slots, and the workflow rebuilds it from the slot, ref, commit and run number.
- **Both configuration checks run before the first mutation, and they are different checks.** A
  missing variable is caught in the job's first step. A variable that is present but names a
  deployment in *another* script project is invisible until the project's deployments are listed —
  and if that is discovered at the redeploy, the push has already changed this project's content and
  left an orphan version behind. So the list runs before the push, and its error names the slot, the
  deployment, the script, and what the project actually contains. One extra API call.
- **`redeploy` is chosen over the identical `deploy -i` for its failure mode.** They call the same
  function, but `deploy` treats a falsy deployment ID as "create", so a misconfigured slot would
  quietly publish a second, unlisted web app URL. `redeploy` refuses it. A preflight step refuses
  it earlier, before anything remote is touched.
- **Deploys queue rather than cancel** — the opposite of ci.yml, where a superseded run's verdict is
  merely irrelevant. Cancelling between `versions.create` and `deployments.update` leaves the slot
  on its old version with an orphan version above it, which looks exactly like a deploy that never
  ran.
- **Authentication is a stored refresh token, not a service account**, and not for lack of trying
  the modern option. Two independent blocks:

  | ADC credential type | Resolves to | `clasp --adc` |
  | --- | --- | --- |
  | `authorized_user` | `UserRefreshClient` | works |
  | `service_account` | `JWT` | works |
  | `impersonated_service_account` | `Impersonated` | works |
  | `external_account` (keyless WIF) | `IdentityPoolClient` | **discarded** |

  clasp's ADC path ends in `if (defaultCreds instanceof OAuth2Client)`, and only the first three
  extend it; `IdentityPoolClient` extends `AuthClient`. So the credentials
  `google-github-actions/auth` writes in keyless mode are dropped and the run fails with
  `No credentials found.` — a message that reads like a missing secret. Independently, the Apps
  Script API is gated on a *per-user* setting at `script.google.com/home/usersettings`, which no
  service account principal can visit, so even a working service account could not push. Revisit
  when google-auth-library-nodejs#1677 lands, which clasp's own source cites.
- **clasp does not look for a local auth file.** `initAuth` defaults to `~/.clasprc.json` with no
  fallback, contrary to clasp's `docs/config-files.md` — a `.clasprc.json` written beside
  `.clasp.json` is invisible unless `clasp_config_auth` or `-A` names it, and naming the
  *directory* fails with `EISDIR` despite `--help` advertising folders. Cost: one workflow env var,
  and it is asserted by `scripts/deploy-workflow.test.mjs` because the failure blames the secret.
- The quality gate runs again inside the deploy job. A promotion can name a ref whose CI run
  predates a dependency change, and a green suite is cheap next to a broken dial on a wall.
- Deployment still does not prove the dial *renders*. The gate is the same one that has never caught
  a legibility defect, so a promotion to production is still a decision to be made after looking at
  staging — which is what the manual step is for.

---

## Platform constraints

Hard limits of the Apps Script + `HtmlService` runtime. These are not preferences to revisit —
they are the shape of the platform, and several ADRs above exist only to work around them.

**No ES modules server-side.** `.gs` files share a single global scope with no `import` or
`export`, and entry points must be reachable as top-level functions. → ADR 0002.

**Client JavaScript cannot be served as a file.** It has to be inlined from an `.html` file via
`HtmlService` templating; there is no path on an origin we control that serves a `.js` file.
→ ADR 0002.

**`HtmlService` templating is textual, so a scriptlet delimiter inside an HTML comment is still a
scriptlet.** `createTemplateFromFile` scans the raw bytes for `<?` … `?>` and compiles whatever
falls between into the generated function; it has no idea what a comment is. So writing
`<code>&lt;? if ?&gt;</code>` inside `<!-- … -->` to *describe* a scriptlet compiles a bare `if`
and `template.evaluate()` throws a SyntaxError — the whole page fails to render, on the deployed
app only. The local preview never shows it, because `scripts/build.mjs` strips `<?…?>` with a
regex before anything evaluates. Explain templating decisions in the TypeScript that feeds the
template, never in the template's own markup.

**The client↔server bridge is `google.script.run`, not HTTP.** Callback-based, and typically
0.5–2 s per round trip. → ADR 0006, and the first-paint ordering it forces.

**No service workers, no Notification API, no PWA manifest.** The page runs in a nested,
cross-origin, sandboxed iframe on an ephemeral `googleusercontent.com` origin that rotates
between sessions. Service worker registration requires a same-origin script at a path we
control, which Apps Script cannot provide. Independently, Chrome and Firefox both refuse
`Notification.requestPermission()` from a cross-origin iframe, and `notifications` is
deliberately excluded from Permissions-Policy delegation — so it cannot be granted via `allow=`
either, and manual permission does not survive the origin rotation.

**Browser storage is not durable either**, for the same reason. Cookies, `localStorage` and
`sessionStorage` are keyed to an origin, and this one rotates — so whether or not the APIs happen to
work inside the sandbox, nothing stored through them survives. Apps Script's own docs neither permit
nor forbid them, which makes it undocumented behaviour on a disappearing origin. Preferences
therefore belong in `PropertiesService` (#31), which is server-side and per-user; `doGet` can
template them into the page so reads cost no round trip.

Neither half can be closed from inside Apps Script, so **anything notification-shaped must be
in-page**. Post-MVP reminder work is scoped as in-page toasts for exactly this reason: named
otherwise, it would accrue a service-worker dependency it can never satisfy. Full investigation
and the workable alternatives are in issue #11.

**Execution and quota ceilings.** Six minutes per execution. Trigger runtime is capped in
aggregate per day — 90 minutes on consumer accounts, six hours on Workspace — which bounds how
often any off-device alerting can poll. → ADR 0006.

---

## Overlapping events and concentric rings

This was an open worry going in, so: **it is already solved, and the solution is optimal in
ring count.** `assignRingIndices()` — NDWC `analog-clock.tsx`, extracted and directly tested as
`ring-layout.ts` in yuvomi-kiosk#48 — walks events in start-angle order and places each on the
outermost ring whose previous occupant has already ended, opening a new inner ring only when
every existing one is still busy. `AnalogClock` then splits the arc band into `ringCount` equal
rings separated by a gap of `max(2, arcThickness × 0.06)`.

That is textbook interval partitioning. First-fit in start order provably uses exactly as many
tracks as the maximum number of mutually-overlapping intervals, so it never opens a ring it did
not need. `ring-layout.ts`'s docstring describes itself as "greedy rather than optimal — it does
not minimise ring count"; that self-assessment is too modest, and the comment should be
corrected on the way across rather than copied.

**Both "remaining gaps" below are closed, and the paragraph above is stale in a third way** — this
section is the oldest text in the document and describes the port's starting point, not the tree.
Kept because the reasoning is still the best statement of *why* the design is what it is; read the
three corrections first:

- **`AnalogClock` does not split the band into `ringCount` equal rings.** It splits into
  `min(clusterDepth, maxRings)`, per *cluster* rather than dial-wide, and `maxRings` is derived from
  `MIN_RING_THICKNESS_RATIO` so a ring can never be thinner than it can carry. A lone arc gets the
  whole band; a four-deep cluster elsewhere on the dial does not thin it.
- **Gap 1 is closed.** The cap exists, and events past it share the innermost ring — see below.
- **Gap 2 is closed.** Ring assignment is fed true angles; only drawing uses the widened ones.

The two gaps as originally written, with what actually happened:

**1. Ring count is unbounded, and thin rings cannot carry their content.** With `arcThickness`
at 48 px and five mutually-overlapping events, each ring is about 7 px. The emoji alone wants
~26 px and the title another ~18 px. NDWC never hit this because its dial aggregated sparse
calendars. Nothing in the current code caps ring count or degrades gracefully when a ring is too
thin to render what it is holding. Needs a cap plus an overflow affordance — see the plan.

  **Half shipped.** The cap is `Math.min(assigned.clusterDepth, maxRings)`, with `maxRings` derived
  from `MIN_RING_THICKNESS_RATIO` so no ring is opened that cannot carry its content. **The overflow
  affordance was never built**, and the shipped behaviour is a different answer: events past the cap
  **share the innermost ring and are drawn overlapping each other**. That is defensible — a count or
  a collapsed marker costs the ring the very text it is trying to preserve — but it is a decision,
  not the affordance this paragraph asks for, and it is recorded only as a source comment. Whether it
  stands is the unfinished half of W9 item 2.

**2. `MIN_ARC_DEGREES` manufactures overlaps that do not exist.** `calculateArcAngles()` widens
any arc narrower than 7.5° (≈15 minutes) so short events stay visible. Ring assignment then runs
on the *widened* angles. A 09:00–09:05 event is widened to span 09:00–09:15, so a genuinely
non-overlapping 09:06 event is pushed to an inner ring — and if several short events run
back-to-back, the dial can open several rings for a stretch of calendar that has no overlap at
all. Short back-to-back events are common on a single personal calendar. The fix is to assign
rings from true event times and use widened angles only for drawing, which decouples the two
concerns cleanly.

  **Shipped, exactly as proposed.** `assignRings` is handed true angles and the widened ones are used
  for drawing alone, so a 09:00–09:05 event no longer pushes a 09:06 one inward. The decoupling is
  the reason the cluster-depth cap above can be trusted: depth is a fact about the calendar rather
  than an artefact of `MIN_ARC_DEGREES`.

Neither is a design flaw in the inherited algorithm; both were consequences of pointing it at a
denser input than it was built for, and both have since been answered.

---

## Inherited work

Source for the lift is `yuvomi-kiosk` commit `ff18a19` on branch
`claude/clock-face-schedule-port-d7e91b` (yuvomi-kiosk#48), which had already stripped these
modules of React and of any Yuvomi-specific types. `ClockEventInput` is deliberately structural —
`id`, `title`, `startDate`, `endDate`, `isAllDay`, `fallbackColor` — which is precisely the shape
an Apps Script calendar adapter can produce, so no adaptation layer is needed between the two.

| Module | LOC | Spec LOC | Ports as |
| --- | --- | --- | --- |
| `clock-utils.ts` | 193 | 323 | Verbatim |
| `fit-title.ts` | 120 | 134 | Verbatim |
| `arc-title-layout.ts` | 45 | 101 | Verbatim |
| `ring-layout.ts` | 37 | 60 | Verbatim, minus the inaccurate docstring |
| `text-arc.ts` | 30 | 56 | Verbatim |
| `rect-edge.ts` | 27 | 36 | Verbatim |
| `clamp-label.ts` | 27 | 26 | Verbatim |
| `types.ts` | 47 | — | Verbatim |
| **Total** | **526** | **736** | |

The rendering layer does not lift. NDWC's four components — `clock-face.tsx` (204),
`event-arc.tsx` (218), `floating-label.tsx` (175), `analog-clock.tsx` (259) — are rewritten as
SVG DOM builders per ADR 0004. Their SVG *structure* carries over closely; only the way the
elements get created changes.

---

## Open questions

- `CalendarApp` vs. the Advanced Calendar Service. `CalendarApp` is simpler and sufficient for
  one calendar; the advanced service returns `colorId` and richer fields in one batched call and
  will likely be needed when multi-calendar support lands. Starting with `CalendarApp` behind
  the pure-mapper boundary keeps the swap cheap.
- Fallback colour resolution. `CalendarEvent.getColor()` returns a `CalendarApp.EventColor`
  ordinal (`"1"`–`"11"`) or `""` when the event inherits the calendar default, so the adapter
  needs a Google-palette ordinal→hex table plus `Calendar.getColor()` as the final fallback.
  NDWC resolved this from a Tailwind enum that does not exist here.
- ~~Web app deployment mode.~~ **Closed — and by an option this list never weighed.** Left here
  rather than deleted, because the reasoning below was the live question for long enough that a
  reader may remember it, and because acting on it now would change whose calendar the board shows.

  The question was posed as a choice between *"execute as me / access limited to me"* — called the
  safe option, at the cost of the display holding a logged-in Google session — and *"execute as me
  / anyone with the link"*, which avoids that and leaks the calendar to anyone holding the URL. In
  a classroom that second option is a different class of problem than in a kitchen, since a school
  calendar may carry student names.

  **What ships is neither.** `static/appsscript.json` declares `"executeAs": "USER_ACCESSING"` with
  `"access": "ANYONE"`, and the server reads `CalendarApp.getDefaultCalendar()` — so the app runs as
  **whoever is looking, and shows that person their own calendar**. `src/server/calendar.ts` states
  the consequence: *"each visitor's own calendar and needs no configuration — nothing to share,
  nothing to set, and no way for one visitor to read another's."*

  That dominates both options rather than compromising between them. There is no shared URL to leak,
  because the URL grants a viewer nothing but their own data; the "student names" hazard cannot
  arise. It keeps option 1's one real cost — `ANYONE` means any *signed-in* Google account, so the
  wall device still needs a persistent session, and the board shows whichever account is signed in
  on it. That is the requirement #10 has to satisfy on the pilot hardware, and the only part of the
  paragraph above that survives.

  **Do not "fix" the manifest toward the safe option.** Setting `executeAs` to the owner would
  silently swap every viewer's calendar for the owner's — a behaviour change, not a hardening.
- Whether the all-day aside (NDWC never built it; yuvomi-kiosk#58) belongs in the MVP or
  immediately after.
