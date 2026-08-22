# A return check before the PR, and a branch a later run can actually find

**Status:** in progress — the guard and the doc edits for [#133](https://github.com/BenSeymourODB/clock-face-schedule/issues/133)
**Issue:** [#133](https://github.com/BenSeymourODB/clock-face-schedule/issues/133)
**Docs:** `.claude/commands/implement-issue.md` steps 2, 3, 7 and 12 (the claim protocol),
`.claude/commands/README.md` (which still says these commands are manual),
`scripts/deploy-workflow.test.mjs` (the idiom this plan's guard copies), #114 (the duplicate PRs),
#124 / #111 (the argument that a guard belongs where the author is)

## What this changes

The claim protocol gains the cheap half of a liveness signal and loses its most expensive failure.
Three edits to `.claude/commands/implement-issue.md`, one to `.claude/commands/README.md`, and a
`scripts/implement-issue-workflow.test.mjs` guard over the properties whose violation is silent.

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
today"*. True. But it reads as one run's slip, and it is not. Every branch on the remote, by the date
its head was committed:

| period | branches | matching `claude/issue-<n>-<slug>` |
| --- | --- | --- |
| 2026-08-17 → 08-18 | 15 | **12 (80%)** |
| 2026-08-19 → 08-22 | 39 | **1 (2.6%)** |
| **all** | **54** (excluding `main`) | **13 (24%)** |

35 of the 54 are `claude/<adjective>-<name>-<hash>` — `funny-curie`, `focused-cray` — which is not a
slug any run composes from an issue title. It is the shape a **scheduled driver** hands a session,
along with an instruction not to push anywhere else. The convention did not decay gradually; it
stopped being the run's decision on 08-19, when the runs became scheduled ones — 80% conformance
before that date, **2.6% after**. `.claude/commands/README.md` still says *"These commands are manual
today"*, which is where the assumption survived.

So a rule that says *"name your branch `claude/issue-<n>-<slug>`"* cannot be made binding by asking,
and a later `git ls-remote claude/issue-133-*` would find nothing for 38 of the last 39 runs — while
reading, to whoever wrote it, as if it had a signal. That is the same class of defect as the pin
table and the plan headers: a claim about the repo that nothing checks.

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

## What is deliberately not built

- **The window stays six hours.** The decision says so, and this plan adds nothing that would justify
  shortening it: a *declared* branch makes "alive" provable, not "dead". Point 2's own 30-minute rule
  is recorded as available, not adopted — adopting it is a release rule, and releasing wrongly is the
  expensive direction (#133 measures the asymmetry as two sessions against one).
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
| The return check appears **before** the `gh pr create` snippet | A run reads the check after it has already opened the duplicate PR — #114's outcome exactly. The one genuinely order-sensitive property here, and the same shape as the deploy guard's "checks the slot exists before the push can mutate anything". |
| The take-over marker is **byte-identical** where it is written (step 2) and where it is read (step 7) | The return check greps for a string no take-over run writes, finds nothing, and reports "no take-over" for every issue. A check that always passes is worse than no check. |
| The claim template **names the branch** | Liveness falls back to elapsed time alone, which is the thing #133 exists about — and the doc would still read as if a branch signal existed. |
| The claim template is byte-identical wherever the doc quotes it | Two spellings mean the step-2 filter searches for one and the claiming run writes the other, so every claim looks unclaimed. |
| Exactly one window figure | Step 2 filtering on one number while the return check reasons about another is undetectable by reading either half. |
| One spelling of the `claude/issue-<n>-<slug>` pattern | A run pushes one form and a later `ls-remote` looks for the other. |

## Related

- #114 — the two PRs, and the diff showing they are the same change
- #124 / #111 — the plan-status guard, and the argument that a rule nothing checks is a rule that
  decays
- #126 — the plan headers, the other convention that was followed by hand until it was not
