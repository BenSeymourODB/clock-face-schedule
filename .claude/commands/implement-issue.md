# Implement issue

You are an implementation agent for the `clock-face-schedule` repo
(`BenSeymourODB/clock-face-schedule`). You can be invoked manually as
`/implement-issue` or by a scheduled driver. Each run picks one eligible GitHub
issue and delivers it end-to-end. Think deeply with extended thinking before
non-trivial decisions — this is a high-effort run.

**Read `CLAUDE.md`, `README.md` and `docs/DESIGN.md` first.** They document what
this is (a Google Apps Script web app drawing an analog dial whose outer band
carries one arc per calendar event), who it is for (classrooms and wall displays,
especially people who find clock arithmetic hard), the accepted ADRs, and the
platform's hard limits. The rules below are non-negotiable.

## Hard rules

- **Verify anything you draw by looking at it.** This project's entire defect
  history is legibility bugs that passed every test: white titles at 1.9:1 on
  yellow, an emoji colliding with a two-line title, titles reading bottom-up, a
  label lying across the numerals, an elapsed outline thinner than the separator
  it replaced. For any change to rendered output: `npm run build`, serve
  `build/preview.html`, screenshot it, and *look*. Numbers extracted from the DOM
  are a good cross-check but do not replace the screenshot.
- **When looking finds a defect, add the test that missed it.** Every one of the
  above had passing tests. The fix is not "test harder" in general — it is one
  targeted assertion per defect, capturing the specific property that was wrong.
- **Measure before asserting.** A claim about geometry, contrast or legibility is
  not credible until computed. `node -e` is cheap and has reversed several
  recommendations in this repo's history. See `CLAUDE.md`.
- **The server is a calendar adapter and nothing else** (ADR 0003). No geometry,
  no angles, no markup server-side. Everything derived is computed in the browser.
- **The build footer is generated, never hand-maintained** (ADR 0002). It is
  derived from the bundle's export list; adding an `export` to
  `src/server/main.ts` is the whole of the work. Forgetting an entry fails
  *silently in the browser*, which is why it is generated.
- **Never hand-edit `build/`.** It is generated output and `clasp push --force`
  overwrites it. Do not commit it either.
- **Browser-local time is authoritative** (ADR 0005). Do not derive the display
  window server-side; the script's timezone and the display's disagreeing is a
  silent failure that looks like missing events.
- **Keep the five CSS custom-property names** (ADR 0007). The ported SVG carries
  across untouched because of it.
- **Secrets never land in git.** `.clasp.json` holds the script id and is
  gitignored; `.clasp.json.example` is the template. Never commit a real id or
  token, never print one into logs or PR text.
- **Tests required.** Land tests with the code, preferably test-first. Put logic
  in small pure modules under `src/shared/` and unit-test with **vitest** (two
  projects: node for `shared/` + `server/`, jsdom for `client/`). Tests needing
  credentials or a live service must be **skippable** so CI stays green without
  them. NEVER weaken or delete a test to make it pass — if a test reveals a real
  design problem, fix the design.
- **`src/shared/` must compile under both tsconfigs.** The server config has no
  DOM lib and the client config has no Apps Script types; that split is the
  enforcement mechanism for ADR 0003 and must not be relaxed.
- **Target is ES2019.** No `matchAll`, no `replaceAll`, no optional-chaining
  assignment. `npm run check-types` catches it; the failure mode is a build that
  looks fine and breaks on the board.
- **Git hygiene:** never `--no-verify`, never force-push, never amend a published
  commit. Don't commit `node_modules/`, `build/`, `.clasp.json`, or
  `.claude/worktrees/`.

Where this guide shows `gh ...`, use the GitHub MCP tools (`mcp__github__*`)
instead when your environment provides them; fall back to the `gh` CLI locally.

## Source of truth for sequencing

Work is sequenced by the **open GitHub issues list**, organised as epics with
native sub-issues. Ordering signals, in priority order:

- A `priority` label if present (`p0` → `p2`), then **issue number ascending**.
- GitHub's native **"Blocked by"** relationships and any `blocked` label.
- **The readiness line in the issue body.** Sub-issues filed from the brainstorms
  state either *"Fully implementable as specified — no open decisions"* or
  *"Not ready to build — open decisions"* followed by a list. **Treat the latter
  as `needs-decision`** and skip it, unless the decision has since been recorded
  in an issue comment, an ADR in `docs/DESIGN.md`, or a brainstorm in
  `docs/brainstorms/`.
- Skip issues carrying `needs-decision` / `question`, or body text explicitly
  asking the maintainer to choose. Comment that it is deferred and move on.

Prefer issues marked ready that unblock the most downstream work. Several are
prerequisites for whole epics — wrap-aware geometry and the shared card component
are both like this.

## 0. Pre-flight

```bash
git fetch --prune origin
git checkout main && git pull --ff-only origin main
```

If `git status -s` shows uncommitted state on `main` or the checkout fails, a
previous run left local state dirty. Post a comment on the most recent
in-progress issue describing what was found, then exit cleanly.

Then prune stale worktrees:

```bash
git worktree prune
git worktree list
```

If a listed worktree's branch has a merged PR, remove it:
`git worktree remove <path>`.

## 1. Unblock pass

"Blocked by" links and `blocked` / `needs-decision` labels go stale after PRs
merge and decisions land. For each open issue with a blocker, check whether all
blockers are now `CLOSED`. For issues whose body lists open decisions, check
whether those decisions were since recorded — several in this repo were settled
in issue comments rather than in the original body. This pass is fast; always run
it before triage.

You no longer have to retire shipped plans by hand. `docs/plans/` holds dated
files (`YYYY-MM-DD-<slug>.md`) each carrying a status header, and the two states
a plan may claim are both still true after its own PR merges, so nothing is left
for a later run to correct — `npm test` checks it, and `npm run check-plans`
reports it on its own. Asking each run to do it was tried and missed twice, for
a structural reason rather than a careless one: a PR cannot record its own merge
(#111).

What that asks of *you*, in step 7, is to set your plan's status before the merge
rather than after — see step 4.

## 2. Pick the next ticket

```bash
gh issue list --state open --json number,title,url,labels,body --limit 100
```

Filter:

1. Issue is `OPEN` and is not itself an `epic` (epics are containers; work their
   sub-issues).
2. Body does not declare open decisions — or the decisions have since been made.
3. Every "Blocked by" issue is `CLOSED`.
4. No open PR already closes it:
   `gh pr list --state open --search "in:body Closes #<n>"`.
5. No claim comment from `implement-issue` newer than 6 hours.

**Resume case:** a worktree under `.claude/worktrees/issue-<n>-…` with no open PR
is a crashed run. Pick that issue back up and reuse the worktree
(`git fetch && git rebase origin/main` inside it).

**Nothing eligible?** Pick the highest-priority blocked / decision-bound item,
post a comment summarising exactly which decision would unblock it, and exit.

Once selected, comment:
`🤖 implement-issue claiming this for the next session.`

## 3. Worktree

```bash
slug=$(echo "<issue-title>" | tr 'A-Z' 'a-z' | tr -cs 'a-z0-9' '-' | sed 's/^-//;s/-$//' | cut -c1-30)
worktree=".claude/worktrees/issue-<n>-${slug}"
branch="claude/issue-<n>-${slug}"

git worktree add -b "$branch" "$worktree" origin/main
cd "$worktree" && npm ci
```

If the branch exists from a crashed run, reuse it: `git worktree add "$worktree"
"$branch"` (no `-b`). `.claude/worktrees/` is gitignored — leave it intact on
exit.

## 4. Read the plan and the brainstorm

Look in `docs/plans/` for a dated file matching the issue. Many issues also
descend from a **brainstorm** in `docs/brainstorms/` — read it, because it
carries the reasoning and the constraints the issue only summarises. If no plan
exists and the work is non-trivial, produce one grounded in the issue's
acceptance criteria, the brainstorm, and `docs/DESIGN.md`, and save it as
`docs/plans/<YYYY-MM-DD>-<slug>.md` with `**Status:**`, `**Issue:**` and
`**Docs:**` headers before implementing. **All three are checked** (#126); the
last two only for being there, so a plan for work nobody filed writes
`**Issue:** none — <why>` rather than omitting the line.

**The status header has a checked vocabulary**, and only two states, because both
have to stay true through the merge that lands them:

- `in progress — … #NN`, citing the issue or PR that says what is outstanding.
  This is what a plan carries while you are writing it, before its PR exists.
- `done — shipped in #NN`. Write this **in the shipping PR itself**, as soon as
  the draft PR exists and you know its number — not after it merges, which is the
  one moment nobody can edit it.

`in review` is retired. `npm test` fails on it, naming the file and quoting the
line to write instead.

## 5. Phases

Break the work into 2–4 phases — typically shared geometry → client renderer →
tests → visual pass. Commit and push at the end of each. The first push opens a
draft PR; later pushes update it.

## 6. Tests

Unit-test every non-visual behaviour. Pure geometry belongs in `src/shared/` and
is testable in node; renderers are tested under jsdom by asserting on **rendered
SVG attribute names** — camelCase spellings silently do nothing, which is the
easiest mistake when porting from TSX.

Truth-table cases belong in `it.each`, not six near-identical blocks. Test a pure
function once at the function; consumers assert only that they call it.

## 7. Implement, validate, push (per phase)

```bash
npm run build        # esbuild bundles + generates the footer — must be clean
npm run check-types  # both tsconfigs; catches ES2019 and the shared/ split
npm test             # vitest, all green
```

Then commit and push. Standard footer:

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

On the first push, open a draft PR:

```bash
gh pr create --draft \
  --title "<type>(<scope>): <summary> (#<n>)" \
  --body "$(cat <<'EOF'
## Summary

<1-3 bullets>

## Test plan

- [ ] ...

## Visual verification

<screenshot or measured before/after, for anything that changes the dial>

Closes #<n>

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

## 8. Visual verification — required for anything drawn

Not optional, and not satisfiable by tests. For any change to rendered output:

```bash
npm run build
```

Then open `build/preview.html` — straight from disk, no server needed; it
resolves the HtmlService includes and always runs the fixture schedule in
`src/client/sample-events.ts`. The deployed app shows the same fixture behind
`?demo=1`.

- **Screenshot it and look.** Check the change you made *and* the things near it
  — several defects here were collisions with a neighbouring element.
- **Cross-check numerically** by querying the DOM for the attributes you changed.
  Useful, but it is a complement to looking, not a substitute: measurement is how
  you confirm what you intended, screenshots are how you find what you did not.
- **Exercise the hard cases the fixture already contains**: a four-deep overlap
  cluster, an isolated arc beside it, a ten-minute event held open by the minimum
  span, an overflowing title, a two-line title carrying an emoji, an event
  crossing each end of the period, and a `⚫` event whose colour measures 1.21:1
  on the dial background.
- **Add a fixture case** when your change has a stress case none of those covers.
- Put the screenshot or the measured before/after in the PR body.

**For the "before" half, and for reviewing someone else's branch, CI has already
built it.** Every run attaches `build/` as an artifact — `preview-pr-<n>` on a
pull request, `preview-main-<sha>` on `main`, kept 14 days — uploaded before the
checks that can fail, so even a red run leaves the picture. Grab it with
`gh run download <run-id> -n preview-main-<sha>`, or via
`mcp__github__actions_list` (`list_workflow_run_artifacts`), instead of building
`main` in a second worktree.

## 9. Finalize

```bash
npm run build && npm run check-types && npm test
gh pr ready <num>
```

## 10. First-pass review via subagent

Launch a review subagent (`subagent_type=general-purpose`). Instruct it to run
`/code-review` against the diff, or do a manual deep review: read the full diff
(`gh pr diff <num>`), check tests, and check the hard rules above — **especially**
that the footer was not hand-edited, that no geometry leaked server-side, that
`src/shared/` still compiles under both tsconfigs, that no ES2020+ syntax crept
in, that no script id was committed, and that visual verification actually
happened. It should post comments via the GitHub MCP review tools or
`gh api repos/BenSeymourODB/clock-face-schedule/pulls/<num>/comments`, or return
them verbatim — do not paraphrase.

## 11. Address review

For each comment: if valid, change/commit/push; if no change is needed, post a
threaded reply explaining why. Reply to every first-round comment so nothing is
left mid-conversation.

## 12. Cleanup & exit

- **PR ready and pushed:** leave the worktree intact.
- **Exiting early:** comment on the issue summarising what is blocked and what
  would unblock it, replace your claim marker with a status update, leave the
  worktree intact, exit cleanly.
- **Delete any scratch artefacts you created outside the repo.** Screenshot and
  temp-server output belong in the scratchpad, not in the parent directory.

## Scope & guardrails

- If the issue is too large for one session, ship a meaningful slice and note
  deferred work in the PR body. Better a clean slice than a broken feature.
- Keep PRs small and focused on one issue.
- Never `--no-verify`, never force-push, never amend a published commit.
- Never hand-edit generated output; never commit a script id.

Begin.
