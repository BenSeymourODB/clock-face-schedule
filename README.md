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

Planning. Nothing is implemented yet.

- [docs/DESIGN.md](docs/DESIGN.md) — architecture and ADRs
- [docs/plans/2026-08-15-mvp-clock-face.md](docs/plans/2026-08-15-mvp-clock-face.md) — MVP work breakdown

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
| `npm run build` | esbuild → `build/` (`Code.gs`, `Client.html`, statics) |
| `npm run build:watch` | rebuild `src/` and `static/` on change |
| `npm test` | vitest — node project for `shared/` + `server/`, jsdom for `client/` |
| `npm run check-types` | tsc over both tsconfigs |
| `npm run push` | build, then `clasp push --force` |

`build/` is generated and gitignored; it is also clasp's `rootDir`, so a push only ever uploads
generated output. Edits made in the Apps Script online editor are overwritten by the next push.

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
