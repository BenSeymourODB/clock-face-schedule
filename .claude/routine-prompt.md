# The hourly driver's prompt

The unattended driver described under "Automation" in `.claude/commands/README.md` is a
**Claude Code Routine** named `Clock-Face-Schedule Hourly (Cloud)`
(`trig_01VjvqvQhmqADznY3YmkdTRA`), firing at `39 * * * *`. Its prompt is what turns
`/implement-issue` from a command into a policy — how a session picks its work, what it
does when it cannot pick any, and what it is forbidden to do.

**This file is a mirror, not the source of truth, and it can drift.** The Routine lives in
the maintainer's Claude Code account and is edited through the web UI; an agent cannot
update it (the API refuses: *"Agents can only update routines they created"*). So editing
this file changes nothing on its own — someone has to paste it across. By this repo's own
standard that makes it an unchecked copy of a fact, the thing #103, #104 and #163 exist to
stop, and nothing offline can guard it because the live value is behind an authenticated
API.

It is still worth keeping, for the reason the maintainer asked for it: the prompt is
substantial project configuration that decides how every unattended session behaves, and
without this file a change to it has no diff, no review and no history. A copy that can
drift beats a decision nobody can see. **If you change the Routine, update this file in the
same breath, and say in the PR that you did.**

## The prompt, as of 2026-08-22

```
Run /implement-issue against this repository. The issue list may be large, so start by
looking at sub-issues of any whose titles mark them as Epics. Check the issue comments
and any PRs linked to it to confirm no other agent has claimed the issue for work before
beginning your own with a comment claiming the issue. Comments may also indicate
resolutions to questions that Issue bodies mark as blocking issue implementation.
Implementation instructions call for planning - write plan docs in directory docs/plans.

YOU NEVER MERGE. Never merge a PR, never enable auto-merge, never approve one. The
maintainer is the only merge gate and that is deliberate - he catches errors and
deviations from his goals that the automated review process misses. Your job is to make
the decision to merge as cheap as possible for a human, not to make it for them. Mark a
PR ready-for-review and stop there.

PICK THE SESSION'S MODE BY QUEUE DEPTH. Count the open PRs, including drafts.

- Three or more open: do NOT start new implementation work. A further PR spends
  maintainer review time, which is the scarcest resource in this project, and lengthening
  that queue slows everything down rather than speeding it up. Go to review mode, then
  decision mode.
- Fewer than three open: implement one issue. Prefer a `p0` label, then `p1`, then issue
  number ascending. Prefer the smallest well-scoped issue that unblocks the most
  downstream work - a PR a human can review in ten minutes is worth more than one that is
  twice as complete.

REVIEW MODE. Take the open PR where a session of your time removes the most of the
maintainer's. Skip any PR whose head SHA has not changed since an agent last reviewed it -
re-reviewing an unchanged head is waste. Age is NOT the filter: a PR opened ten minutes
ago is a good candidate if nothing has scrubbed it yet, and it arriving pre-scrubbed is
the point.

For any PR that changes rendered output, the highest-value thing you can do is
`npm run build`, render the pins its body names, LOOK at them, and attach the screenshots
to the PR. Per CLAUDE.md this project's entire defect history is legibility bugs that
passed a full green suite, so this is the part of review the test suite cannot do and the
maintainer currently does by hand.

Then run the full quality gate, verify every figure the PR body claims rather than
trusting it, fix what is broken, tighten the body so a reader can judge it without a
checkout, and mark it ready-for-review if it is a draft. Stop there - do not merge.

DECISION MODE. If every open PR has already been reviewed at its current head, spend the
session on the single decision-bound issue with the largest downstream fan-out. Do the
measurement the decision needs, post it as a comment, and state the options with what each
one costs. Do NOT decide it yourself. The aim is that the maintainer can settle it in one
sitting without doing arithmetic.

CAPTURE CORRECTIONS. If maintainer review comments on any PR reveal a preference or an
aesthetic judgement that is not written down in CLAUDE.md, docs/DESIGN.md or
docs/brainstorms/, propose adding it. This is the work that shortens the review loop
permanently rather than once, and it is worth interrupting anything else for.

For any work you defer to a later date / separate effort when writing a PR, ensure an
Issue exists for the work being deferred (creating a new Issue if one does not) and link
to it from your PR. Do NOT schedule a check-in on the PR's status - rely on webhooks and
the maintainer to keep it moving forward.
```

## Why each clause is there

Written down because the previous prompt's two failure modes were both invisible until
they were measured, and a later reader should not have to rediscover them.

### The merge prohibition

The previous prompt ended its fallback with *"If a PR selected this way is ready to merge,
merge it and end session."* The maintainer's position is that he cannot afford to let
agents merge — he catches errors and deviations from his goals often enough that the
automated review is not a sufficient gate, at least until agent teams and his aesthetic
preferences are more codified. So the clause was dead instruction inviting exactly the
behaviour he had ruled out, and it is now an explicit prohibition rather than an omission.

### The queue-depth gate

This is the change that matters most, and it follows from one observation: **under a
human-only merge gate, maintainer review capacity is the binding constraint, not agent
throughput.** Every PR an agent opens spends that capacity. So past three open PRs the
right move is to make the existing queue cheaper to clear rather than to add to it.

Measured 2026-08-22, which is what prompted it: five PRs open (#164, #165, #168, #173,
#179), and both merges that morning were made by hand by the maintainer, not by any run.

### Head SHA, not age

The old rule was *"PRs more recent than 24 hours are not good candidates."* Its purpose was
to give the maintainer first look — which mattered while agents could merge, and stopped
mattering when they could not.

What it did instead was deadlock the driver. Measured 2026-08-22 at 05:45Z, all five open
PRs were between 0.2 and 4.9 hours old, so **zero of five were reviewable** while every
issue was decision-bound or waiting on #173's code. Neither path had a candidate, so the
run took the "Nothing eligible?" exit and stopped. That is why that morning's output was a
run of measurement issues rather than merged code.

The useful filter is whether a PR has been scrubbed at its current head. It also inverts
the incentive the right way: a PR opened ten minutes ago becomes a *good* candidate, so
work arrives on the maintainer's desk pre-reviewed.

### Rendering first in review mode

`CLAUDE.md`'s central claim is that this project's entire defect history is legibility bugs
that passed a full green suite, and the maintainer's stated reason for reviewing by hand is
catching exactly that class. So the single most valuable thing a review session can do for
him is take the pictures. Left to initiative it was being skipped.

### Capturing corrections

The merge gate is framed as temporary — it relaxes once more of the maintainer's aesthetic
preferences are written down. Nothing in the previous prompt did any of that writing down,
so the gate had no path to getting cheaper. This clause is the one that converts a review
comment into a durable rule instead of a one-off correction.

### What ordering assumes

`p0` / `p1` are only meaningful because they are applied. Before 2026-08-22 no `priority`
label had ever been used in this repo, so `/implement-issue`'s documented ordering —
priority label, then issue number ascending — was in practice issue-number-ascending,
walking up from #10 through the post-MVP backlog every hour before reaching current work.
If priority labels stop being maintained, that clause should be removed rather than left
to read as though it were doing something.
