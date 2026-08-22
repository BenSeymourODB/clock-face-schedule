# Claude Code commands

Project slash commands for agentic maintenance of this repo. Run them in Claude
Code from the repo root.

| Command            | What it does |
| ------------------ | ------------ |
| `/implement-issue` | Picks one eligible open GitHub issue and delivers it end-to-end: plan → phased implementation (in an isolated git worktree) → tests → **visual verification** → draft PR → self-review → ready-for-review. Designed to run unattended; safe to invoke manually too. |
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

**`/implement-issue` runs on a schedule as well as by hand**, and has since
2026-08-19. It still only ever opens draft PRs for a human to merge.

One consequence is worth knowing before reading either command: a scheduled run
does not choose its own branch. The driver hands it one — `claude/funny-curie-…`,
`claude/focused-cray-…` — with an instruction not to push anywhere else, so 1 of
the 39 branches pushed since that date matches the `claude/issue-<n>-<slug>`
pattern the workflow documents, against 12 of the 15 before it. Anything that
wants to find a run's branch reads it from the run's claim comment; nothing
derives it from the issue number (#133).

Ported from the `yuvomi-kiosk` command set, which in turn came from
[`rbcministries/clickup-todo-cli`](https://github.com/rbcministries/clickup-todo-cli/tree/main/.claude/commands),
adapted from `BenSeymourODB/next-digital-wall-calendar` and
`BenSeymourODB/linux-parental-controls-toolkit`. SvelteKit, Yuvomi and Playwright
specifics have been replaced with this project's Apps Script stack.
