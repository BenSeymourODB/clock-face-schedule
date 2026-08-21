# A plan status that is true at merge, and the guard that keeps it so

**Status:** done — shipped in [#124](https://github.com/BenSeymourODB/clock-face-schedule/pull/124)
**Issue:** [#111](https://github.com/BenSeymourODB/clock-face-schedule/issues/111)
**Docs:** `.claude/commands/implement-issue.md` step 1 (the retire pass this replaces), `CLAUDE.md`
(the brainstorm/plan conventions), #99 and #109 (the chore, done by hand twice), #101 (advisory
versus blocking, argued for the visual diff)

## What this changes

`docs/plans/` gains a checked vocabulary for its `**Status:**` header, and a vitest spec that reads
every plan and enforces it. `in review` is retired.

Nothing rendered moves. No file under `src/client/` or `src/shared/` is touched, so there is no dial
to look at — see "Visual verification" below, which is not a skipped step but an inapplicable one.

## Why the chore cannot be a chore

#111's body offers three answers (leave it manual; a skippable test; a CI step that comments) and its
comments add a fourth (a `push: main` job that files an issue). All four **detect** the stale status
after the fact, because of a premise the thread establishes and then accepts:

> the last thing a PR can do is not update its own status

That is true, and it is the whole problem: if the correction can only be made by somebody other than
the author, then every one of the four answers carries at least one run of lag and a hand-off. The
premise has a second reading. If a status can only be corrected by a third party, **stop requiring a
correction** — let the header say something that is still true after the merge.

The author has what that needs. A PR's number exists the moment the PR is opened, which is before the
merge and inside the author's own branch, so `done — shipped in #NN` can be written by the run that
ships the plan. Nothing is left for anyone to remember.

## Measured, over every plan in the repo

For each of the 24 plans on `main` at `f2a19b3`, the status in the commit that **added** the file
against the status the file carries **now**:

| status when it landed | plans | since edited by a later PR |
| --- | --- | --- |
| `in review` | **12** | 11 of 12 |
| `in progress` | 9 | 8 of 9 |
| `done` | 2 | 0 |
| no status header | 1 (the mvp plan) | — |

So **21 of 24 plans required a post-merge status edit by somebody other than the PR that shipped
them**, and the two that did not are the two that wrote `done` in the shipping PR — the convention
below already exists in this repo, it is simply not the default. The remaining `in review` is
`2026-08-21-unify-the-blend-search.md`, whose PR (#109) merged at `7271004`; it is the twelfth
instance the issue counts and this plan retires it.

The 9 `in progress` cases matter as much as the 12. They are the reason the guard cannot key on the
word `in review` alone: a plan reading `in progress` after its work shipped is stale in exactly the
same way, and 8 of the 9 were later corrected to `done`.

## The vocabulary

Two states, each of which stays true through a merge:

- **`done`**, optionally `done — shipped in #NN`. The plan describes what shipped. Written in the
  shipping PR, once its number exists.
- **`in progress — … #NN`**, which **must cite an issue or PR reference**. The plan describes work
  not finished by the PR carrying it, and the reference is what says which work. The mvp plan is the
  real case: `W10 outstanding as #10`.

`in review` is gone. It was the only status whose truth had an expiry date — it means "a PR is open",
and the merge that ends the review is the one edit that cannot update it.

Requiring the reference on `in progress` is what makes the check offline. Distinguishing a plan
legitimately in progress from one left behind needs to know whether work is outstanding; demanding
the plan *name* what is outstanding turns that into something a parser can see, and it is the same
demand `CLAUDE.md` already makes of brainstorms — "state the constraints any answer must keep, name
what is still undecided".

## Why a vitest spec and not a workflow step

The guard is offline, so every argument for CI machinery falls away:

- **No network, no token, no `issues: write`.** `ci.yml`'s quality-gate job is documented as
  `contents: read`, "nothing here writes to the repository", and this keeps it that way.
- **Nothing skippable.** #111's option 2 needs the issue's state, so it has to be skippable, "and a
  skipped guard on CI is not a guard". The offline rule has no such escape.
- **Zero lag, and it lands on the author.** A `push: main` check reports after the merge, to whoever
  reads the next run. A spec fails in the PR that introduced the wrong header, which is where the
  author and the one-line fix both are.
- **No workflow edit at all.** `npm test` already runs on `pull_request` and on `push: main`.

#101's "advisory beats blocking" does not transfer. That argument is about a legibility heuristic
with a tolerance to tune — "a blocking check on a legibility heuristic will be overridden routinely,
which trains people to override it". A status header against a two-word vocabulary has no tolerance
and no judgement in it, so there is nothing to override and nothing to train.

## The cost, stated

`done — shipped in #NN` written while the PR is open says *done* before the merge, where `in review`
was true when written. That is a real inaccuracy and it is the one thing to weigh against the twelve.

It is the cheaper of the two. The pre-merge version is visible only to that PR's reviewers, who can
see the PR's state from the very link in the header; the post-merge version misleads every cold
reader, which is the harm #111's body names — "a reader picking one up cold cannot tell which". If
the trade is judged the other way, the difference is one assertion and one line of vocabulary.

## Where it lives

`scripts/` already holds this repo's tooling as untyped `.mjs` outside both tsconfigs (`build.mjs`),
and that is the right shelf for a check about `docs/`. It is not app logic, so it does not belong in
`src/shared/` — where the tsconfig split exists to enforce ADR 0003 — and it is not client code, so
it does not belong in the jsdom project either.

That needs a third vitest project, `tools`, running `scripts/**/*.test.mjs` under node. The two
existing projects keep their exact includes, so the tsconfig split and ADR 0003's enforcement
mechanism are untouched.

## Phases

1. **The rule, as a pure module and its tests.** `scripts/plan-status.mjs` parses a status header and
   checks it; `scripts/plan-status.test.mjs` covers the vocabulary as a truth table, then reads the
   real `docs/plans/` and asserts every plan passes. The third vitest project, and
   `npm run check-plans` for a one-command local answer.
2. **The convention, written down, and the twelfth instance retired.** `CLAUDE.md` and
   `.claude/commands/implement-issue.md` — whose step 1 currently asks each run to do the chore by
   hand, which is the instruction this replaces. `2026-08-21-unify-the-blend-search.md` to
   `done — shipped in #109`.

## Verify

`npm run build`, `npm run check-types`, `npm test`. The load-bearing check is negative and worth
doing deliberately: mutate a plan's status to `in review` and to a bare `in progress`, confirm the
spec goes red for each, and restore. A guard over real repo files passes trivially if its glob
resolves to nothing.

## Visual verification

**Inapplicable, not skipped.** The diff touches `scripts/`, `vitest.config.ts`, two markdown
conventions files and one plan header. No module under `src/` changes, so `build/preview.html` is
byte-identical apart from the bundle's own hashing, and there is no rendered output for a screenshot
to disagree about. Confirmed by building before and after and diffing `build/`.

## Deferred

- **#125 — whether a plan's `in progress` reference is actually open.** Needs the issue's state, so it
  needs the network, so it would have to be skippable — the trap #111's option 2 names. The reference
  being *present* is what this guard can prove offline; whether it is still open is what a human
  reading the plan is for.
- **#126 — the `Issue:` and `Docs:` headers**, which `.claude/commands/implement-issue.md` step 4 also
  requires and which nothing checks either. 24 of 25 plans carry both; the mvp plan carries neither,
  so requiring them means first deciding whether it is an exception or a gap.

## What this plan demonstrates

Its own status was `in progress — … outstanding as #111` while it was being written and became
`done — shipped in #124` in the same PR, once the draft existed. Nothing is left for a later run to
correct, which is the whole of the claim.
