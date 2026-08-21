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
  per-second tick. A period rollover (AM→PM) triggers a rebuild.
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

**Decision.** The client polls `getEvents` every 5 minutes and on period rollover. The server
memoises the response in `CacheService.getUserCache()` for 60 seconds, so a reload storm or a
second open tab does not multiply calendar reads.

**Consequences.**
- ~288 calendar reads per day. Comfortably inside quota.
- Up to 5 minutes of staleness after an event is edited elsewhere. Acceptable for a wall
  display; a manual refresh affordance is cheap to add if it grates.
- Failure states need designing — a stale-but-rendered dial is better than a blank one, so the
  client should keep the last good payload and mark it visibly stale rather than clearing.

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
- A dark wall-display palette is the default; the token indirection leaves a light variant
  available without touching the builders.

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
  its locus is `292 + W/2`, which against `m` units of margin resolves to `W = m + 8` — **151.3 units
  at 16:9's 143.3**, holding the same 13 characters a line as the 155.2 above, so a card that never
  covers an arc carries exactly as much text as one that does. On 16:10 it costs 5 characters a line
  (98.0 units, 8 a line). It is *unavailable* at 12 and 6, where the dial fills the height and a
  band-clearing card would sit 22.5 units (one line) to 96.1 units (four) above the frame — off the
  board. So this removes #98's collisions on the sides by construction and leaves them at the top and
  bottom, which is the mirror image of the ellipse's asymmetry.
- **180 is the smallest width that serves the panel's own justification.** It holds 10 characters a
  line at 26 units, and on a 4 ft board 26 units is 53 mm — comfortable reading at 8 m by the
  conventional distance/150 rule. That is the size at which the panel can carry the names of a
  three-deep cluster, whose arc titles render at 6.24 units, 12.7 mm, legible to about 2 m (#70).
  (**5.98 units** for a three-deep title that *wraps*, once the clearance cap binds — #90. Millimetres
  per the amendment below rather than this line: 7.0 mm and 1.1 m for the one-line figure as the dial
  actually renders, 6.8 mm and 1.0 m for the wrapping one. Either way this argument rests on the panel
  carrying the name the arc cannot.)
- **16:10 is the binding case and the ceiling is 209 units.** Past that the margin drops below the
  knee and the panel starts taking width from the labels one-for-one. 180 leaves 29 units of
  headroom; anything wider should be re-measured rather than assumed.
- **The panel holds five cards** at 26 units over three lines, seven at two lines. That confirms the
  agenda brainstorm's estimate from the other direction, and with it that **scrolling is the general
  display mode and whole-day the special case** (#41).
- The narrow-display fallback (#39 item 4) is unchanged and still needs designing: as the board
  approaches square the margin falls below the knee and the panel has to collapse or stack.

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

**Revisit when** the pilot board is up (#10) and the panel has been looked at from the back of the
room, or if a target display falls outside 16:9–16:10.

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

Two real gaps remain, and both get **worse** in this project than in either predecessor —
because the MVP targets a single calendar, and a single busy calendar is exactly the input that
produces deep overlap:

**1. Ring count is unbounded, and thin rings cannot carry their content.** With `arcThickness`
at 48 px and five mutually-overlapping events, each ring is about 7 px. The emoji alone wants
~26 px and the title another ~18 px. NDWC never hit this because its dial aggregated sparse
calendars. Nothing in the current code caps ring count or degrades gracefully when a ring is too
thin to render what it is holding. Needs a cap plus an overflow affordance — see the plan.

**2. `MIN_ARC_DEGREES` manufactures overlaps that do not exist.** `calculateArcAngles()` widens
any arc narrower than 7.5° (≈15 minutes) so short events stay visible. Ring assignment then runs
on the *widened* angles. A 09:00–09:05 event is widened to span 09:00–09:15, so a genuinely
non-overlapping 09:06 event is pushed to an inner ring — and if several short events run
back-to-back, the dial can open several rings for a stretch of calendar that has no overlap at
all. Short back-to-back events are common on a single personal calendar. The fix is to assign
rings from true event times and use widened angles only for drawing, which decouples the two
concerns cleanly.

Neither is a design flaw in the inherited algorithm; both are consequences of pointing it at a
denser input than it was built for.

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
- Web app deployment mode. "Execute as me / access limited to me" is the safe option, but it
  requires the display to hold a logged-in Google session; "execute as me / anyone with the link"
  avoids that and leaks the calendar to anyone holding the URL. The classroom setting raises the
  stakes on the second option considerably — a school calendar may carry student names, which
  makes a shared URL a different class of problem than it would be in a kitchen.

  Narrowed, not yet closed: the smart boards at the intended pilot school appear to be Android TV
  or ChromeOS based, so a persistent per-device session is plausible rather than out of the
  question. That points at the safe option. **Needs verifying against the actual hardware** before
  it is treated as settled.
- Whether the all-day aside (NDWC never built it; yuvomi-kiosk#58) belongs in the MVP or
  immediately after.
