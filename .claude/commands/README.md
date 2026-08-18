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

These commands are **manual today**. Wiring them to a schedule would need an
`ANTHROPIC_API_KEY` secret and an opt-in repo variable, and should only ever open
draft PRs for a human to merge.

Ported from the `yuvomi-kiosk` command set, which in turn came from
[`rbcministries/clickup-todo-cli`](https://github.com/rbcministries/clickup-todo-cli/tree/main/.claude/commands),
adapted from `BenSeymourODB/next-digital-wall-calendar` and
`BenSeymourODB/linux-parental-controls-toolkit`. SvelteKit, Yuvomi and Playwright
specifics have been replaced with this project's Apps Script stack.
