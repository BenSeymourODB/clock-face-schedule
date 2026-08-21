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
`google.script.run` round trip, a calendar read, and the viewer's stored preferences with a
write-and-echo check on them. Off by default, because the display itself carries no chrome.

**Preferences persist in `PropertiesService`, not in the browser** (#31). The page's origin rotates
between sessions, so cookies and `localStorage` outlive nothing here; a user-scoped property store
does. `doGet` templates the resolved values into the page, so reading them costs no round trip, and
only a change writes one. A user property wins over a script property, which wins over the code's
default — so a forked school instance sets deployment-wide defaults in the script store.

Nothing on the display sets a preference yet — that arrives with the timer's control surface (#47) —
so today they move only from the Apps Script property editor, which needs both the `pref.` prefix and
the stored encoding to have any effect:

| Property | Values | Default |
| --- | --- | --- |
| `pref.showSeconds` | `1` / `0` | `1` |
| `pref.timerMuted` | `1` / `0` | `0` |
| `pref.timerDurationSeconds` | whole seconds, 60–43200 | `300` |

Anything else is ignored rather than rejected: an unprefixed key is not a preference, and
`showSeconds = false` is not `0`. Both fall back silently, which is deliberate — a store written by
an older version of the code must not be able to blank the display.

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

**A push is not a deployment.** A web app serves whichever *version* its deployment points at, so
`npm run push` changes what the editor holds and nothing that anyone watching the board can see.
Redeploying a slot is what publishes it — see "Continuous deployment" below, which does that for
`main` automatically.

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

**A notice costs the dial a row of height** (#115). The dial is sized from the display, so a notice no
longer changes its width — a 439.8 px notice and a 1021.7 px one give the same dial where they used to
give 600 px and 950. It is still a grid row, though, so a page carrying one draws the dial at 807.9 px
against a healthy board's 922.3 at 1920×1080. On the preview that is every state, pinned or not, since
demo mode posts a notice of its own: screenshots are to the right proportions and about 12% down on
scale; hide `#status` to see what the wall gets.

**The times below exercise the demo fixture's states**, and are what the fixture's offsets mean once
a pin anchors them to midnight — measured by rendering, not predicted:

| `?now=` | What it shows |
| --- | --- |
| `03:00` | The unpinned *states*, exactly: ⚪ Breakfast Club elapsed and crossing the leading edge, the four-deep cluster elapsed, and 🟡 Tidy Up and Line Up **draining** beside it. Not the unpinned *picture* — see below. |
| `01:30` | The cluster mid-drain — 🎮 Game Time and 🔴 Deadline draining, 🟣 Study just starting, 🟠 Swimming Group B still to come. |
| `04:15` | ⚫ Staff Debrief and 🟤 ⚽ draining, ⚫ Assembly elapsed: the two palette colours that fail contrast on the dial, in both treatments at once. |
| `08:30` | 🟣 Free Play draining, with 📚 Reading — the ten-minute event held open by the minimum span — elapsed beside it. |
| `11:00` | 🟢 Aftercare draining and crossing the dial's noon seam, with copy 1 of the fixture already filling most of the band — the arc clamped at the window's end here is that copy's 🍽️ Lunch, not Aftercare. |

**The first row is a claim about arcs and their states, not about pixels** — the distinction matters
and cost a review. The fixture is anchored to the rolling window's own start, so every event's offset
from "now" is a constant: unpinned, the dial always draws the same 16 arcs, five of them elapsed and
one draining, at the same ring thicknesses, whatever the wall clock says. `?now=03:00` is the pin
that reproduces exactly that.

**The picture is not the same, and unpinned it is not even stable.** The angle origin is the period's
start, so the dial rotates continuously and which titles overflow to a floating label follows angular
position — the frame is tightest at 3 and 9 o'clock. Measured across pins: five cards at `03:00`,
four at `04:15`, three at `08:30`, and unpinned the set drifts from one minute to the next as the
dial turns. **So judge anything about label placement or crowding on a pinned dial, and say which
pin** — an unpinned screenshot of a card collision is not reproducible, including by you.

That constant offset is what puts a drain in the default look: 🟡 Tidy Up and Line Up spans `now`
whatever the wall clock says, so an unpinned preview draws one draining arc — from the first frame,
not once it has settled (#152). **It is the thin one.** It joins the four-deep cluster through
🔴 Deadline, so it renders at that cluster's 15.56-unit ring rather than a lone arc's 75.92 — the
thinnest ring the dial opens. Reach
for `?now=04:15` when you want a drain without the ring-thinning confound: ⚫ Staff Debrief draws it
at 35.68 units, clear of the cluster.

**The load frame is the settled frame** (#152), and it took a fix to be. The fixture's anchor and the
dial's first frame come from one clock read, so a screenshot at 150 ms and one at 2 s carry the same
drain. They did not before: 🔴 Deadline ends exactly on the anchor boundary, the anchor was read a few
milliseconds later than the clock the first frame drew with, and the arc had therefore not finished
yet — so the load frame carried *two* drains for about a second, and a capture taken inside it showed
a seam that was gone afterwards. Sampled on the built preview at 150, 300, 600, 1,200 and 2,500 ms,
the gradient list now reads the same four entries at every one of them — `arc-fade-z-start`,
`arc-fade-n-drain`, `arc-drain-n-drain`, `arc-fade-y-end` — so exactly one of them is a drain.

Two consequences of that anchoring worth knowing before you pin something:

- **`?freeze=1` on its own does not move the fixture.** It holds the real clock still, so the dial
  keeps the picture it already had. Only `?now=` re-anchors.
- **A displaced pin lands on a full dial at any hour, because the fixture recurs** (#62). The app
  tiles copies of the fixture end to end, against a window of `[now − 3h, now + 8h]`, so a pin never
  walks off it: the dial carries a full count at every hour: **16** arcs at 03:00, 12 at 06:00, 12
  at 09:00, 13 at 12:00, 15 at 15:00, 16 at 17:00, 15 at 19:00, and 12 at 21:00. The counts are not
  monotonic and never reach zero. The fixture spans 23:10 the previous day to 13:15, so a single
  copy *would* drain away by evening — falling from 16 arcs at 03:00 to none from 17:00 — but the
  next copy has already arrived, so `?now=19:00` shows fifteen arcs rather than the empty dial one
  copy would leave.

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

## Continuous deployment

`main` deploys itself to a **staging** slot; **production** is promoted by hand. Both are
deployments of the same script project, and `.github/workflows/deploy.yml` runs the same two clasp
calls against a different deployment ID:

```bash
npx clasp push --force                        # upload the built bundle
npx clasp redeploy "$DEPLOYMENT_ID" -d "…"    # version it, and repoint the slot
```

**Omitting `-V` is the whole mechanism.** clasp then creates an immutable version from whatever was
just pushed and repoints the *existing* deployment at it, so the slot's web app URL never changes —
which is what makes a bookmarked classroom URL safe to deploy behind. ADR 0010 has the reasoning.

Because versions are immutable snapshots, deploying staging cannot disturb production: it stays
pinned to whichever version it was last promoted to, however many times `main` moves.

| Trigger | Effect |
| --- | --- |
| Push to `main` | Builds, runs the full gate, redeploys **staging** |
| Publish a release | Redeploys **production**, from the commit the release's tag points at |
| Actions → Deploy → Run workflow | Redeploys the slot you choose, from the ref you choose |

**Publishing a release is the promotion.** That is what a release already meant here — the tag is
the thing worth pointing a wall display at — so production moves when one is published and at no
other time. The tag is checked out by name rather than trusting the event's default commit, so a
release deploys exactly what it points at; the deployed version's description records the tag, which
makes `clasp deployments` and the Apps Script version list both readable as a release history.

The trigger is `release: types: [published]`, deliberately not the narrower `released` or
`prereleased`. `published` is the only type that fires for a stable release *and* a pre-release,
including a pre-release published from a draft, which `prereleased` misses. Since this repo's
releases are pre-releases, either narrower type would mean a production deploy that silently never
ran. Change it to `[released]` if pre-releases should stop short of production.

The manual dispatch stays for what neither trigger covers: redeploying a slot without a new release,
and rolling production back by pointing it at an older ref.

The gate — `build`, `check-types`, `test` — re-runs inside the deploy job rather than trusting the
commit's earlier CI run, because a release or a dispatch can name any ref, including one whose CI
predates a dependency change.

### One-time setup

1. Create the two deployments once, and keep the IDs they print:

   ```bash
   npx clasp create-deployment -d "staging"
   npx clasp create-deployment -d "production"
   npx clasp deployments   # every ID, with its version and description
   ```

   Leave the implicit `@HEAD` deployment alone — that is the `/dev` URL, not a slot.

2. Log in locally, and take the credentials clasp writes:

   ```bash
   npx clasp login
   cat ~/.clasprc.json
   ```

3. Populate the repository's Actions configuration:

   | Where | Name | Value |
   | --- | --- | --- |
   | Repository secret | `CLASPRC_JSON` | the whole contents of `~/.clasprc.json` |
   | Repository variable | `SCRIPT_ID` | the Apps Script project ID |
   | Environment `staging` → variable | `CLASP_DEPLOYMENT_ID` | the staging deployment ID |
   | Environment `production` → variable | `CLASP_DEPLOYMENT_ID` | the production deployment ID |

`CLASP_DEPLOYMENT_ID` is **environment-scoped**, which is what lets one job body serve both slots —
and it means production can carry required reviewers (Settings → Environments) without the workflow
knowing anything about it. `SCRIPT_ID` is repository-wide because both slots live on one script
project; defining it on an environment overrides it, should the slots ever need to be separate
projects. Neither ID is secret: the deployment ID *is* the public web app URL.

A missing value fails the job's first step with a message naming what to add, before anything is
built or uploaded. A value that is *present but wrong* fails just before the push, for the same
reason: a deployment ID can be valid and still belong to a different script project — nothing
requires the two slots to share one — and that pairing is only visible by listing the project's
deployments. The job lists them first and names both halves of any mismatch, so it never gets as far
as changing the wrong project's content.

### Why a stored refresh token rather than a service account

`clasp --adc` looks like the keyless answer and is not. Two independent obstacles, both measured
against clasp 3.4.0:

- **Workload Identity Federation is silently discarded.** clasp's ADC path ends in
  `if (defaultCreds instanceof OAuth2Client)`, and the `external_account` credentials that
  `google-github-actions/auth` writes in keyless mode resolve to an `IdentityPoolClient` — which
  extends `AuthClient`, not `OAuth2Client`. clasp drops it and reports `No credentials found.`
  (`authorized_user`, `service_account` and `impersonated_service_account` all pass that check.)
- **The Apps Script API is gated per user**, at <https://script.google.com/home/usersettings> — a
  page no service account principal can visit. Domain-wide delegation impersonating a real user is
  the only way round it.

One consequence worth knowing if you ever move off clasp's built-in OAuth client with `--creds`:
refresh tokens issued by an app in "Testing" publishing status expire after seven days, so CD would
break weekly. Keep the consent screen in production, or internal to the Workspace domain.

Note also that clasp resolves its auth file to `~/.clasprc.json` and **does not fall back to a local
one**, contrary to its own `docs/config-files.md`. The workflow sets `clasp_config_auth` for exactly
this reason; without it a perfectly good `.clasprc.json` sitting beside `.clasp.json` still yields
`No credentials found.` It has to name the file, too — pointed at a directory, clasp dies with
`EISDIR` despite `--help` advertising folder support.

## Relationship to the prior implementations

This is a **third implementation, not a fork**. It reuses the part that is worth reusing:
roughly 550 LOC of framework-free TypeScript — arc geometry, 12-hour period maths, emoji and
colour parsing, curved-title fitting, ring stacking — which `yuvomi-kiosk` already extracted
from React into plain modules with tests (yuvomi-kiosk#48, commit `ff18a19`). That layer lifts
across essentially verbatim.

The rendering layer does not lift. NDWC's ~860 LOC of TSX becomes plain functions that build
SVG DOM nodes, which is less work here than in the Svelte port: no component framework, no
reactivity model, and no component test harness to stand up first.
