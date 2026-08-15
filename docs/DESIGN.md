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
| `src/server/main.ts` | IIFE | `build/Code.gs` | Needs a footer re-exporting the Apps Script entry points as top-level `function` declarations |
| `src/client/main.ts` | IIFE | `build/Client.html` | Bundle wrapped in `<script>…</script>` by a post-build step |

Static files (`appsscript.json`, `Index.html`, `Styles.html`) are copied into `build/`, which
is `rootDir` in `.clasp.json`. `clasp push` therefore uploads only generated output.

**Consequences.**
- One build step between editing and seeing a change. Acceptable; `esbuild --watch` plus
  `clasp push --watch` keeps it short.
- The Apps Script online editor becomes read-only in practice — edits there are overwritten by
  the next push. This is the normal clasp trade and is worth stating in the README when the
  scaffold lands.
- **To verify on the first spike:** whether `google.script.run` and the editor's function
  picker resolve entry points assigned onto the global object, or whether they require literal
  top-level `function` declarations. The footer approach above assumes the latter, which is the
  conservative choice; if assignment works, the footer can be simplified.

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

## Platform constraints

Hard limits of the Apps Script + `HtmlService` runtime. These are not preferences to revisit —
they are the shape of the platform, and several ADRs above exist only to work around them.

**No ES modules server-side.** `.gs` files share a single global scope with no `import` or
`export`, and entry points must be reachable as top-level functions. → ADR 0002.

**Client JavaScript cannot be served as a file.** It has to be inlined from an `.html` file via
`HtmlService` templating; there is no path on an origin we control that serves a `.js` file.
→ ADR 0002.

**The client↔server bridge is `google.script.run`, not HTTP.** Callback-based, and typically
0.5–2 s per round trip. → ADR 0006, and the first-paint ordering it forces.

**No service workers, no Notification API, no PWA manifest.** The page runs in a nested,
cross-origin, sandboxed iframe on an ephemeral `googleusercontent.com` origin that rotates
between sessions. Service worker registration requires a same-origin script at a path we
control, which Apps Script cannot provide. Independently, Chrome and Firefox both refuse
`Notification.requestPermission()` from a cross-origin iframe, and `notifications` is
deliberately excluded from Permissions-Policy delegation — so it cannot be granted via `allow=`
either, and manual permission does not survive the origin rotation.

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

- Whether Apps Script entry points survive an IIFE bundle via global assignment, or need
  literal `function` declarations in a footer (ADR 0002).
- `CalendarApp` vs. the Advanced Calendar Service. `CalendarApp` is simpler and sufficient for
  one calendar; the advanced service returns `colorId` and richer fields in one batched call and
  will likely be needed when multi-calendar support lands. Starting with `CalendarApp` behind
  the pure-mapper boundary keeps the swap cheap.
- Fallback colour resolution. `CalendarEvent.getColor()` returns a `CalendarApp.EventColor`
  ordinal (`"1"`–`"11"`) or `""` when the event inherits the calendar default, so the adapter
  needs a Google-palette ordinal→hex table plus `Calendar.getColor()` as the final fallback.
  NDWC resolved this from a Tailwind enum that does not exist here.
- Web app deployment mode. "Execute as me / access limited to me" is the safe default for a
  personal calendar, but it requires the wall device to hold a logged-in Google session.
  "Execute as me / anyone with the link" avoids that and leaks the calendar to anyone holding
  the URL. Needs a decision before the display goes on a wall.
- Whether the all-day aside (NDWC never built it; yuvomi-kiosk#58) belongs in the MVP or
  immediately after.
