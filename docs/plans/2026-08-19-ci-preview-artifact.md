# Keep CI's `build/preview.html` instead of throwing it away

**Status:** in review
**Issue:** [#100](https://github.com/BenSeymourODB/clock-face-schedule/issues/100)
**Docs:** [#92](https://github.com/BenSeymourODB/clock-face-schedule/pull/92) (the quality gate this
extends), [#72](https://github.com/BenSeymourODB/clock-face-schedule/issues/72) (the `?now=` /
`?freeze=1` pins that make a downloaded preview show a *chosen* state), `CLAUDE.md` — "render before
you believe it works"

## What this ships

One `actions/upload-artifact` step in `.github/workflows/ci.yml`, so every CI run leaves the built
`build/` behind for 14 days. A reviewer who wants to look at what a PR draws downloads one zip and
opens `preview.html`, instead of fetching the branch, `npm ci`, `npm run build`, and serving.

## Three decisions, and what settled them

### 1. The upload sits directly after `npm run build`, not at the end of the job

Steps after a failed step do not run, so an upload placed after `npm test` would be missing exactly
when it is most wanted: a red suite is a reason to look at the dial, not a reason to be denied it.
Placed immediately after the build, the artifact exists whenever the build itself succeeded,
whatever `check-types` and `test` go on to say — and it needs no `if:` condition to do it.

This is the load-bearing ordering property of the change, so it is commented in the workflow.

### 2. Uploaded on `push: main` too, not `pull_request` only

The issue left this open. PR-only is cheaper and covers the stated use, but this repo's review
culture is a **measured or rendered before/after** — and without a `main` artifact the "before" half
still costs a checkout, which is the whole thing being removed. `build/` is ~167 KB, so a per-push
copy for 14 days is not a storage question worth having.

Artifacts are named per source (`preview-pr-<n>` / `preview-main-<sha>`) so a reviewer holding two
downloads can tell which is which. `github.sha` on a `pull_request` run is the ephemeral merge
commit, which is why the PR branch uses the number instead.

### 3. `build/` whole, not `preview.html` alone

`Code.gs` carries the generated entry-point footer (ADR 0002), whose failure mode is silent in the
browser. Having it in the same zip means a reviewer can eyeball what the build actually declared
without a checkout either. The rest of `build/` is three small files.

## Verified, not assumed

The issue asks for confirmation that a downloaded `preview.html` actually renders, since a zip gives
you `file://` and not a server. Measured rather than asserted — the same page screenshotted at
1280×800 from both origins, pinned to `?now=13:00&freeze=1` so the two runs are comparable:

| Origin | Screenshot SHA-256 |
| --- | --- |
| `file:///…/build/preview.html?now=13:00&freeze=1` | `8948733670865c2b…` |
| `http://localhost:8765/preview.html?now=13:00&freeze=1` | `8948733670865c2b…` |

**Byte-identical.** No server is needed, and `README.md` and the `/implement-issue` step-8
instructions to "serve `build/`" were overcautious; both now say what is true.

The mechanism behind that is worth a test rather than a note: everything the page needs arrives
through `include()`, which is what makes the resolved preview one self-contained file. A
`<script src>`, a `<link href>`, or a webfont `@import` would keep working on the deployed app and
keep every existing test green, while quietly making the downloaded artifact depend on a network the
reviewer's laptop may not be giving it. `src/client/preview-template.test.ts` — already the home for
"what the preview inherits from the template" — now pins that.

## Deliberately not here

- **No `main`-branch "what does the dial look like today" page.** The deployed app behind `?demo=1`
  already serves that, and a published page is a different kind of artefact than review scaffolding.
- **No screenshot diffing in CI.** Worth having and much larger than this: it needs a browser in the
  runner, a baseline store, and a tolerance policy. Filed separately rather than smuggled in here.
