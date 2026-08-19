# clock-face-schedule

An analog clock dial whose outer band carries one coloured arc per calendar event in the
current 12-hour period — implemented as a **Google Apps Script web app** against a single
Google Calendar.

12 o'clock is the start of the period (midnight or noon); 720 minutes map to 360°. Each arc
carries the event's emoji and a curved title. Overlapping events stack onto concentric inner
rings. Titles too long for their arc are promoted to a floating label outside the dial with a
connector line back to the arc.

## Purpose

This is a **visual aid for tracking time**, not a calendar app.

A conventional agenda answers "what is on today" but says nothing about *how much of the day is
left*, or *how long until the next thing*. Both of those require holding an abstraction — clock
arithmetic — that many people cannot do quickly, and some cannot do at all. Rendering the day as
occupied and unoccupied space on a dial removes the arithmetic: the gap you can see is the time
you have.

Intended for:

- **Classrooms** — projector screens and smart boards, as a shared reference the whole room reads
  at a glance
- **Home wall displays** — the same view for a family, on a screen nobody has to interact with

It is aimed particularly at **students with learning disabilities, and anyone who finds tracking
time difficult** — which includes a lot of people who would never describe themselves that way.

Three consequences that outrank feature count:

1. **Legibility at distance beats information density.** The dial is read from across a room, off
   a projector, often at poor contrast. Every layout decision resolves toward "readable from the
   back row", not "fits more on screen".
2. **No interaction required.** The display must be correct and complete standing still. Nothing
   is behind a hover, a tap, or a menu.
3. **Do not encode meaning in colour alone.** Colour distinguishes events; position, text, and
   emoji carry the meaning. This matters for colour vision deficiency and for washed-out
   projectors in equal measure.

The scope is deliberately small — the simplest possible version of the clock face designed for
`next-digital-wall-calendar`, doing one thing legibly.

## Why Apps Script

The two prior versions of this interface each needed infrastructure the display itself did not
justify:

| Project | Stack | Calendar access |
| --- | --- | --- |
| [`next-digital-wall-calendar`](https://github.com/BenSeymourODB/next-digital-wall-calendar) | Next.js 16 / React 19 | NextAuth + Google OAuth, server-side refresh tokens, PostgreSQL |
| [`yuvomi-kiosk`](https://github.com/BenSeymourODB/yuvomi-kiosk) | SvelteKit static PWA | Yuvomi REST API, kiosk token provisioning |

Apps Script removes that layer entirely: `CalendarApp` reads the owner's calendar under the
script's own authorisation, and `HtmlService` serves the page from Google's infrastructure. No
host, no OAuth client, no token storage, no database.

The trade is a constrained runtime — no ES modules server-side, client code inlined into HTML,
and a `google.script.run` bridge in place of ordinary HTTP. See [docs/DESIGN.md](docs/DESIGN.md).

## Status

**MVP complete.** Deployed as an Apps Script web app, it draws the current 12-hour period from the
viewer's own default calendar: coloured arcs with emoji and curved titles, concentric stacking for
overlapping events, floating labels for titles too long for their arc, live hands, and a five-minute
poll that keeps the last good schedule on screen — marked with when it was last fresh — rather than
blanking when a fetch fails.

Adding `?check=1` to the URL shows bring-up diagnostics: colour emoji rendering, the
`google.script.run` round trip, and a calendar read. Off by default, because the display itself
carries no chrome.

What remains is mostly **legibility tuning for the intended viewing distance** — the ported
proportions were designed for a kitchen wall at a few feet, not a classroom projector. See the open
issues.

- [docs/DESIGN.md](docs/DESIGN.md) — architecture and ADRs
- [docs/plans/2026-08-15-mvp-clock-face.md](docs/plans/2026-08-15-mvp-clock-face.md) — the MVP work
  breakdown, kept as written for the record

Sketches for work not yet costed, each written to be picked up cold:

- [Two time scales](docs/brainstorms/2026-08-17-two-time-scales.md) — the dial cannot distinguish
  "this lasts minutes" from "this lasts hours"
- [Agenda panel](docs/brainstorms/2026-08-17-agenda-panel.md) — a card list beside the dial, with a
  playhead tracking the day
- [Class timer](docs/brainstorms/2026-08-17-class-timer.md) — a teacher-set countdown drawn on the
  face, and the point where this becomes a tool rather than a display

## Local development

Requires Node ≥ 20.

```bash
npm install
```

### One-time Google setup

The **Apps Script API must be enabled** for the account that will own the script. clasp can
neither create nor push a project without it, and the error it returns does not appear until you
try:

1. Visit <https://script.google.com/home/usersettings> and turn on the Apps Script API
2. `npx clasp login`
3. `npx clasp create-script --type standalone --title "clock-face-schedule" --rootDir build`

`--type standalone` is correct even though this is a web app. `webapp` is **not** a container
type in clasp 3 — it was dropped, the `--help` text still advertises it, and the resulting error
(`Invalid container file type`) does not say why. Web-app deployment comes from the `webapp`
block in `static/appsscript.json`, not from the container type.

### Everyday commands

| Command | Does |
| --- | --- |
| `npm run build` | esbuild → `build/` (`Code.gs`, `Client.html`, statics, plus `preview.html`) |
| `npm run build:watch` | rebuild `src/` and `static/` on change |
| `npm test` | vitest — node project for `shared/` + `server/`, jsdom for `client/` |
| `npm run check-types` | tsc over both tsconfigs |
| `npm run push` | build, then `clasp push --force` |

`build/` is generated and gitignored; it is also clasp's `rootDir`, so a push only ever uploads
generated output. Edits made in the Apps Script online editor are overwritten by the next push.

**`build/preview.html`** resolves the HtmlService `include()` templating into a standalone page,
so the UI can be opened straight from disk — `file://` renders it pixel-identically to serving it,
because every asset it needs is inlined. This is the fast loop for visual work — no push, no
deployment. Nothing server-side runs, so anything behind `google.script.run` shows its failure
state; it is a complement to checking the deployed app, not a replacement. `.claspignore` keeps
it out of the pushed project.

**CI keeps that page**, so looking at what a branch draws costs no checkout: every run attaches
`build/` as an artifact — `preview-pr-<n>` on a pull request, `preview-main-<sha>` on `main`, kept
14 days. Download it from the run's summary page, unzip, open `preview.html`, and add `?now=` from
the table below to reach the state you want. The `main` copy is the "before" half of a rendered
comparison. The artifact is uploaded immediately after the build, so a run that goes red on
`check-types` or `npm test` still leaves you the picture.

### Pinning the clock, to see a state that depends on the time

Most of what is worth looking at depends on what time it is — an arc that has already happened, one
draining as it runs, the window's leading edge. Two parameters set the dial's clock, on the preview
and on the deployed app alike:

| | |
| --- | --- |
| `?now=04:15` | The dial reads 04:15 and **runs on** from there, so the tick loop still rebuilds. |
| `?now=2026-08-18T04:15` | The same, on a named day. `HH:MM`, `HH:MM:SS`, and a full date-time are all accepted, with an optional `Z` or `±HH:MM` offset. |
| `&freeze=1` | The clock holds still, so a screenshot is reproducible. Works alone, to stop the real clock where it stands. |

`build/preview.html?now=04:15&freeze=1` needs no server. A pinned clock says so on screen, and an
unreadable time falls back to the real clock rather than inventing one.

**The times below exercise the demo fixture's states**, and are what the fixture's offsets mean once
a pin anchors them to midnight — measured by rendering, not predicted:

| `?now=` | What it shows |
| --- | --- |
| `03:00` | The unpinned picture exactly: ⚪ Breakfast Club elapsed and crossing the leading edge, the three-deep cluster elapsed, **nothing draining**. |
| `01:30` | The three-deep cluster mid-drain — 🎮 Game Time and 🔴 Deadline draining, 🟣 Study still live. |
| `04:15` | ⚫ Staff Debrief and 🟤 ⚽ draining, ⚫ Assembly elapsed: the two palette colours that fail contrast on the dial, in both treatments at once. |
| `08:30` | 🟣 Free Play draining, with 📚 Reading — the ten-minute event held open by the minimum span — elapsed beside it. |
| `11:00` | 🟢 Aftercare draining and running past the window's end, with every other event already finished. |

Note the first row: **unpinned, the fixture never has an event in progress**, at any time of day.
It is anchored to the rolling window's own start, so every event's offset from "now" is a constant.
That is why the preview had never drawn a draining arc before this existed.

Two consequences of that anchoring worth knowing before you pin something:

- **`?freeze=1` on its own does not move the fixture.** It holds the real clock still, so the dial
  keeps the picture it already had. Only `?now=` re-anchors.
- **A pinned time is useful in the morning, and empty by the evening.** The fixture spans 23:10 the
  previous day to 13:15, against a window of `[now − 3h, now + 8h]`, so arcs drop away through the
  afternoon: **16** arcs at 03:00, 11 at 06:00, 6 at 09:00, 3 at 12:00, and **none from 17:00**.
  That is what the fixture covers, not a fault in the pin — `?now=19:00` correctly shows an empty
  dial, because the fixture has nothing at seven in the evening.

### The manifest is the source of truth

`static/appsscript.json` carries the web app's deployment configuration — `executeAs` and
`access` — and the Apps Script UI **writes back to the same file**. Change deployment settings
here, not in the UI, or the next push reverts them.

`--force` is deliberate, not laziness. Without it, clasp prompts before overwriting a differing
remote manifest and **declining skips the entire push, not just the manifest**. Worse, with no
TTY it auto-declines, prints `Skipping push.`, and exits 0 — so a scripted push would silently
upload nothing whenever the manifest had drifted.

> **If you are deploying a fork, change `access` first.** The committed value is `ANYONE`, which
> suits a proof of concept and nothing else. An organisation deploying its own instance almost
> certainly wants `"access": "DOMAIN"`, which also avoids Google's unverified-app review entirely,
> since that only applies to users outside the owning domain. See issue #13.

## Relationship to the prior implementations

This is a **third implementation, not a fork**. It reuses the part that is worth reusing:
roughly 550 LOC of framework-free TypeScript — arc geometry, 12-hour period maths, emoji and
colour parsing, curved-title fitting, ring stacking — which `yuvomi-kiosk` already extracted
from React into plain modules with tests (yuvomi-kiosk#48, commit `ff18a19`). That layer lifts
across essentially verbatim.

The rendering layer does not lift. NDWC's ~860 LOC of TSX becomes plain functions that build
SVG DOM nodes, which is less work here than in the Svelte port: no component framework, no
reactivity model, and no component test harness to stand up first.
