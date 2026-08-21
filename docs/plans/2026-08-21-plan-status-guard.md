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

The status each of the 24 plans on `main` at `f2a19b3` carried **at the merge that landed it** — the
first-parent commit on `main` that added the file, not the branch commit that drafted it. That
distinction matters and was got wrong first time round: six plans were drafted with one status and
updated before their PR merged, so the drafting commit is not what shipped.

| status at the merge that landed it | plans | since corrected |
| --- | --- | --- |
| `in review` | **16** | 15 of 16 |
| `in progress`, naming nothing outstanding | **4** | 4 of 4 |
| `done` | 3 | 0 of 3 — none needed it |
| no status header | 1 (the mvp plan) | — |

```bash
for f in docs/plans/*.md; do
  land=$(git log --first-parent f2a19b3 --diff-filter=A --format=%H -- "$f" | tail -1)
  echo "$(basename "$f") $(git show "$land:$f" | grep -m1 '^\*\*Status:\*\*')"
done
```

So **20 of 24 plans landed carrying a status that a later PR had to correct**, and the 3 that did not
are the 3 that wrote `done` in the shipping PR — `2026-08-17-wrap-aware-arc-geometry.md`,
`2026-08-18-rolling-window.md` and `2026-08-18-inline-emoji-title.md`. The convention below already
exists in this repo and already works; it is simply not the default.

The single uncorrected one is `2026-08-21-unify-the-blend-search.md`, whose PR (#109) merged at
`7271004` and which still reads `in review` on `main`. #111's body tabulates ten plans by name and
predates this file, so it is a thirteenth instance of the mechanism rather than one of the ten the
issue lists — worth stating precisely, because the count belongs to the mechanism and not to the
issue.

The 4 bare `in progress` cases carry as much weight as the 16. They are the reason the guard cannot
key on the word `in review` alone: a plan reading `in progress` after its work shipped is stale in
exactly the same way, and all 4 were later corrected to `done`.

## The vocabulary

Three states, each of which stays true through a merge:

- **`done`**, optionally `done — shipped in #NN`. The plan describes what shipped. Written in the
  shipping PR, once its number exists.
- **`in progress — … #NN`**, which **must cite an issue or PR reference**. The plan describes work
  not finished by the PR carrying it, and the reference is what says which work. The mvp plan is the
  real case: `W10 outstanding as #10`.
- **`superseded by #NN`**, same requirement. The plan describes an approach that was abandoned or
  reversed.

`in review` is gone. It was the only status whose truth had an expiry date — it means "a PR is open",
and the merge that ends the review is the one edit that cannot update it.

`superseded` is here because without it a reversed plan can only open with `done`, and the guard
would *enforce* that: `superseded by #99` would be rejected while `done — abandoned, see #99` passed.
A cold reader takes `done` to mean "this describes what shipped", so leaving the state out would
reintroduce exactly the harm the rule exists to stop, in the one case the vocabulary could not
express, and make CI insist on it. This is not anticipation — this project reverses decisions on
measurement, and ADR 0009 retired #88's ellipse outright ("not needed and should not be built") after
it had been derived and rendered.

Requiring the reference on `in progress` and `superseded` is what makes the check offline.
Distinguishing a plan legitimately in progress from one left behind needs to know whether work is
outstanding; demanding the plan *name* it turns that into something a parser can see, and it is the
same demand `CLAUDE.md` already makes of brainstorms — "state the constraints any answer must keep,
name what is still undecided". `done` carries no such requirement, since there is nothing left to
point at.

The reference has to be a reference rather than any `#` followed by a digit, or a link's own fragment
satisfies the one thing the plan is being asked to state. The boundary admits `[` as well as
whitespace and `(`, because every reference in this repo's plans is written as a markdown link —
`[#10](…)`, which is the form the mvp plan uses.

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
2. **The convention, written down, and the outstanding instance retired.** `CLAUDE.md` and
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
conventions files and one plan header. No module under `src/` changes, so there is no rendered output
for a screenshot to disagree about. Confirmed rather than assumed: `main` and this branch were both
built and the whole of `build/` — `preview.html` included, generated footer included — is
byte-identical, `3abd827c0c52615e99a690a148c8b1f59dd1c361280f7626db16d2f702f8ad65` either side.

## Also in scope, and worth naming

The guard checks the filename against `YYYY-MM-DD-<slug>.md` as well as the status. That is one
assertion and it is what makes the directory sort by date, but it is a second rule in a change about
statuses, so: it means a non-plan `docs/plans/README.md` would fail the suite. Left strict rather
than exempted — a plan directory holding only plans is the assumption the retire pass was always
written against, and an unused exemption is a road not taken.

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
