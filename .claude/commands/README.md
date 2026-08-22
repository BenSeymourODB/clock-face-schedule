# Claude Code commands

Project slash commands for agentic maintenance of this repo. Run them in Claude
Code from the repo root.

| Command            | What it does |
| ------------------ | ------------ |
| `/implement-issue` | Picks one eligible open GitHub issue and delivers it end-to-end: plan → phased implementation (in an isolated git worktree, where the run created its own branch) → tests → **visual verification** → draft PR → self-review → ready-for-review. Designed to run unattended; safe to invoke manually too. |
| `/review-issues`   | Grooms the open-issue backlog: analyses blockers, synergies and readiness, writes a dependency analysis to `docs/`, and cross-references + labels issues so `/implement-issue` sequences work sensibly. |

Read `CLAUDE.md` at the repo root before either. It carries the conventions
these commands assume — in particular that **a claim about the rendered dial is
not credible until it has been measured or looked at**, which is the single
lesson this project has re-learned the most.

## Backlog shape

Work is organised as **epics with native GitHub sub-issues** (#32 the two-time-scales
problem, #36 the agenda panel, #42 the class timer), plus standalone issues. Every
sub-issue states in its body whether it is **ready to build** or **blocked on named
decisions** — treat that line as authoritative when triaging.

## Automation

**`/implement-issue` is driven unattended as well as by hand**, by something
outside this repo: nothing in `.github/workflows/` runs it, and an Actions-based
version would still need an `ANTHROPIC_API_KEY` secret and an opt-in repo
variable. Either way it only ever opens draft PRs for a human to merge.

One consequence is worth knowing before reading either command: **a driven run
does not choose its own branch.** It is handed one — `claude/funny-curie-…`,
`claude/focused-cray-…` — with an instruction not to push anywhere else. Measured
2026-08-22 over the 54 branches on the remote, excluding `main` and the branch
that measurement was taken on: 1 of the 39 pushed since 2026-08-19 matches the
`claude/issue-<n>-<slug>` pattern the workflow documents, against 12 of the 15
before it — and 6 of those 39 *were* named by the run, none of them conforming.
So anything that wants to find a run's branch reads it from the run's claim
comment; nothing derives it from the issue number (#133).

That also makes step 3's worktree the minority case rather than the norm: a run
whose branch is already checked out for it works in the tree it was given.

Ported from the `yuvomi-kiosk` command set, which in turn came from
[`rbcministries/clickup-todo-cli`](https://github.com/rbcministries/clickup-todo-cli/tree/main/.claude/commands),
adapted from `BenSeymourODB/next-digital-wall-calendar` and
`BenSeymourODB/linux-parental-controls-toolkit`. SvelteKit, Yuvomi and Playwright
specifics have been replaced with this project's Apps Script stack.
