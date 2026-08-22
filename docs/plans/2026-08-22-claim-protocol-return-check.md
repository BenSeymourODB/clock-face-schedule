# A return check before the PR, and a branch a later run can actually find

**Status:** done — shipped in [#165](https://github.com/BenSeymourODB/clock-face-schedule/pull/165)
**Issue:** [#133](https://github.com/BenSeymourODB/clock-face-schedule/issues/133)
**Docs:** `.claude/commands/implement-issue.md` steps 2, 3, 7 and 12 (the claim protocol),
`.claude/commands/README.md` (which said these commands were manual),
`scripts/deploy-workflow.test.mjs` (the idiom this plan's guard copies), #114 (the duplicate PRs),
#124 / #111 (the argument that a guard belongs where the author is)

## What this changes

The claim protocol gains the cheap half of a liveness signal and loses its most expensive failure.
Four edits to `.claude/commands/implement-issue.md` — steps 2, 3, 7 and 12 — one to
`.claude/commands/README.md`, and a `scripts/implement-issue-workflow.test.mjs` guard over the
properties whose violation is silent.

Step 12's is the one that is easy to miss and matters anyway: *"replace your claim marker with a
status update"* was free while the branch was derivable from the issue number, and this plan is
what removes that derivability. Left alone, it instructs a run that pushed two phases and then
exited early to **delete the only pointer to its own work.** The status update has to keep the
`Branch:` line.

## The decision this implements

#133 measured the failure — #114 carried **two complete, green, mutually-conflicting PRs** (#129 and
#131) because a six-hour timeout cannot tell an abandoned run from a slow one, and run A took 7h56m
from claim to PR. The owner
[settled it](https://github.com/BenSeymourODB/clock-face-schedule/issues/133#issuecomment-5372363084)
as **option 3 plus option 1's prerequisite**:

1. **Step 7 gains a return check** — before opening a PR, re-check the issue for a take-over comment
   or an open PR closing it; if one exists, do not open a second, name both branches on the issue and
   stop.
2. **Step 3's branch name becomes binding**, so `git ls-remote` liveness is available later.
3. **The six-hour window stays**, because lengthening it without a liveness signal converts dead
   claims into blocked issues.

Point 1 is implemented as decided. Point 3 is implemented by writing down *why* it stays, so the next
run does not tune it. Point 2 is implemented against its own premise, which measurement reverses —
argued below rather than worked around.

## Point 2's premise does not hold, and the fix is better without it

#133's reasoning is that #131's branch was `claude/funny-curie-ff235c` rather than the documented
`claude/issue-<n>-<slug>`, and that this is *"the single reason `git ls-remote` cannot be leaned on
today"*. True. But it reads as one run's slip, and it is not. Every branch on the remote as of
2026-08-22, by the date its head was committed — excluding `main` and the branch this was measured
on, which is why the counts are one below what a re-run on 08-22 will report:

| period | branches | matching `claude/issue-<n>-<slug>` |
| --- | --- | --- |
| 2026-08-17 → 08-18 | 15 | **12 (80%)** |
| 2026-08-19 → 08-22 | 39 | **1 (2.6%)** |
| **all** | **54** | **13 (24%)** |

35 of the 54 are `claude/<adjective>-<name>-<hash>` — `funny-curie`, `focused-cray` — which is not a
slug any run composes from an issue title. It is the shape a **driver** hands a session, along with
an instruction not to push anywhere else. The convention did not decay gradually; it stopped being
the run's decision on 08-19 — 80% conformance before that date, **2.6% after** — and
`.claude/commands/README.md` said *"These commands are manual today"*, which is where the assumption
survived.

**The 08-19 break is about who names the branch, not about a schedule**, and the repo cannot show a
schedule: there is no `cron`, no `schedule:` and no `ANTHROPIC_API_KEY` anywhere in the tree, and
`claude/funny-curie-…` is the shape any driven session is given. So the README says driven, and
names the Actions-based version as still absent, rather than asserting a cron nobody can find.

The sharper version of the argument is in the 39: **32 were driver-assigned and 6 were named by the
run — and not one of the 6 conforms.** `claude/clasp-named-deployment-slots-2ry0c5`,
`claude/trim-derived-count-docstring` (no hash at all), `claude/unblock-open-issues-069rup` and three
more are hand-composed descriptive slugs. So the runs that *were* free to choose did not follow the
pattern either, which is the counter to "then just tell them to". A rule that says *"name your branch
`claude/issue-<n>-<slug>`"* cannot be made binding by asking, and a later
`git ls-remote claude/issue-133-*` would find nothing for 38 of the last 39 runs — while reading, to
whoever wrote it, as if it had a signal. That is the same class of defect as the pin table and the
plan headers: a claim about the repo that nothing checks.

**The signal that works is a declared branch rather than a derived one.** The claim comment names the
ref the run will push to. Then:

- it is correct whoever chose the name, driver or run;
- it cannot drift from the pattern, because there is no pattern to drift from;
- it is checkable directly — `git ls-remote --heads origin <the named ref>` — with no dependency on
  slug arithmetic (which has already produced `claude/issue-90-67-title-stack-clearance-cap`, a
  branch whose number and slug name different issues);
- and the documented pattern survives as the default for a run that *is* free to choose, so nothing
  is lost for a manual invocation.

This is strictly more available than what the decision asked for, and available now rather than
later, which is why it is worth arguing rather than quietly implementing the literal instruction.

## A resume has to announce itself, and the first draft did not make it

Found in review, and it is the sharpest thing here. The resume path — stale claim, branch exists,
continue the work on it — was written with no marker of its own, and step 7's return check fires on
an open PR or the take-over marker. So:

| t | event |
| --- | --- |
| T | run A claims, `Branch: claude/x` |
| T+1h | run A pushes phase 1 (step 5 asks for 2–4 phases, each ending in a push) |
| T+6h | run B finds the claim stale and `claude/x` present → **resumes it** |
| T+7h56m | run A returns, finds no PR and no marker → **opens one** |

7h56m is this document's own datapoint for a slow run, so a live run sits in that trigger state for
about a quarter of its life, and step 5's per-phase push makes it the *normal* state of a slow run
rather than an edge case. The outcome is worse than #114's: two runs on one ref (and A may not
force-push, with no recovery documented), or two PRs whose diffs share commits — where #114 at least
had two independent branches a reviewer could diff.

So the protocol carries **three** markers, not two: claim, take-over, resume. Each names its branch,
because a take-over or a resume *replaces* the claim rather than adding to it — which also closes the
hole where filter 5 grepped only for the claim marker and a third run read a taken-over issue as
unclaimed. Filter 5 reads all three; the return check reads the two that mean someone else moved in.

#133's other half — bounding the branch test by head-commit recency — is still not built, and is
part of what #166 has to settle: recency is a *release* rule, and this plan releases nothing.

## What is deliberately not built

- **The window stays six hours.** The decision says so, and this plan adds nothing that would justify
  shortening it: a *declared* branch makes "alive" provable, not "dead". Point 2's own 30-minute rule
  is recorded as available, not adopted — adopting it is a release rule, and releasing wrongly is the
  expensive direction (#133 measures the asymmetry as two sessions against one). Filed as #166, with
  the measurement a decision there would need: run A on #114 was silent and branchless for 5h57m and
  still alive, so a 30-minute rule would have declared it dead seven hours early.
- **No heartbeat.** Rejected on the issue: most correct, most expensive, and a run that dies between
  beats still burns the full window.
- **Nothing runs the check.** The return check is a step a run performs, not a script. There is no
  offline artefact to check it against — the issue's comments and the open-PR list are both network —
  so the guard covers the *protocol document's* structure, which is the part that can silently rot.

## Phases

1. **The guard, test-first.** `scripts/implement-issue-workflow.test.mjs` under the `tools` vitest
   project, in `deploy-workflow.test.mjs`'s idiom: each assertion names the silent failure it
   prevents, not the rule it enforces. Written before the edits, so each one is seen to fail.
2. **The doc edits.** Steps 2, 3, 7 and 12 of `.claude/commands/implement-issue.md`, plus the stale
   automation paragraph in `.claude/commands/README.md`.

## The properties the guard pins

Each is silent when violated — the document still reads as though the protocol held.

| property | what its violation costs |
| --- | --- |
| The return check **tells the run not to open the second PR**, and names the command that gathers the evidence | The property this whole change is for. A check that finds the collision, reports it and opens the PR anyway is #114 with a paragraph in front of it — and an earlier draft of this guard pinned the check's existence, position and vocabulary while leaving the instruction itself free to be inverted. Found in review, not by reasoning. |
| The return check appears **before** the `gh pr create` snippet | A run reads the check after it has already opened the duplicate PR. Order-sensitive in the same way as the deploy guard's "checks the slot exists before the push can mutate anything". |
| The return check reads the **resume** marker as well as the take-over one | The resume is the collision that shares a branch, so a PR opened over it publishes someone else's commits and the two runs then race for one ref. A take-over at least leaves the branches separate. |
| All three markers are **byte-identical** where they are written (step 2) and where they are read (step 7 / filter 5) | A reader greps for a string no writer produces, finds nothing, and reports "unclaimed" or "no take-over" for every issue. A check that always passes is worse than no check. |
| **Every** marker template names its branch, not just the claim's | A take-over or a resume *replaces* the claim, so it becomes the only pointer there is. Liveness otherwise falls back to elapsed time, which is the thing #133 exists about — while the document still reads as if a branch signal existed. |
| Exactly one window figure | Step 2 filtering on one number while the return check reasons about another is undetectable by reading either half. |
| The liveness lookup does not glob the naming pattern | `'claude/issue-<n>-*'` is the obvious implementation and finds nothing for 38 of the last 39 runs, reporting every live claim dead — the two-session direction. |

**What it deliberately does not pin:** the `claude/issue-<n>-<slug>` pattern's own spelling. An
earlier version of this table claimed it did, and review showed it did not — mutating step 3's
`branch=` line left the suite green. The row is gone rather than backfilled, because the pattern is
now a *default* that nothing reads programmatically; the one assertion that touches it is the
negative one, that a liveness lookup must not be built from it.

## Related

- #114 — the two PRs, and the diff showing they are the same change
- #124 / #111 — the plan-status guard, and the argument that a rule nothing checks is a rule that
  decays
- #126 — the plan headers, the other convention that was followed by hand until it was not
