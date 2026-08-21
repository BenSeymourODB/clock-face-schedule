# All three plan headers, required rather than customary

**Status:** done — shipped in [#159](https://github.com/BenSeymourODB/clock-face-schedule/pull/159)
**Issue:** [#126](https://github.com/BenSeymourODB/clock-face-schedule/issues/126)
**Docs:** [`2026-08-21-plan-status-guard.md`](2026-08-21-plan-status-guard.md) (the `**Status:**` half,
and the parser this extends), #111 / #124 (why the vocabulary is checked at all), #103 / #104 (prose
in a doc that nothing reads — the class of rot a missing `**Issue:**` header belongs to)

## What this changes

`scripts/plan-status.mjs` grows from checking one header to checking three. A plan in `docs/plans/`
must carry `**Status:**`, `**Issue:**` and `**Docs:**` — the three
`.claude/commands/implement-issue.md` step 4 has always asked for, of which one was enforced.

`docs/plans/2026-08-15-mvp-clock-face.md`, the one plan predating the convention, is backfilled with
the two it lacks.

## The decision this implements

#126 listed four options and the maintainer settled it in a comment: **backfill the mvp plan's two
headers, then require all three of every plan.** The three rejected options and their reasons are on
the issue; the one that matters for a later reader is why a date-keyed rule was turned down — it puts
a literal in the check that reads as arbitrary in six months, to avoid a two-line edit.

Offline, the way #124's rule is. Nothing here needs the network, unlike #125.

## The rule, precisely

**Presence and a non-empty value.** That is what #126 measures ("plans carrying it") and it is as far
as the rule should go, because the repo already contains the case that decides it:
`2026-08-21-soft-halo-edge.md` carries `**Issue:** none — a follow-up asked for directly, on the back
of #113`. A plan can legitimately implement no issue; what it cannot do is leave a reader guessing
which of the two it is. So a stated `none` passes and an absent header does not, and the rule stays
one sentence.

Requiring `**Issue:**` to *name* a `#NN` was considered and rejected for that reason: it would fail
on a real, correct plan, and the reference rule already exists where it earns its keep — in
`checkStatus`, where an `in progress` plan has to say what is outstanding.

## Shape of the change

- `readStatus` becomes one caller of a general `readHeader(markdown, name)`. The pattern it holds is
  already the right one — anchored to a line start so a header *discussed* further down is not read as
  the document's own claim, and first-match-wins.
- `checkHeader(name, value)` returns prose naming the header and what to write, matching
  `checkStatus`'s existing style: the reader needs the fix, not a code.
- `checkPlan` reports every missing header rather than the first, so one run of `npm run check-plans`
  is enough to fix a plan.
- `check-plans.mjs`'s verdict stops saying "status" — it now speaks for three headers.

## Tests

In `scripts/plan-status.test.mjs`, against the node project:

- `readHeader` reads each of the three, and ignores a mention that is not at a line start.
- `checkPlan` on a plan carrying only `**Status:**` reports **both** missing headers, not one.
- The message names the header and what to write, so the fix does not need the source file.
- `**Issue:** none — …` passes, pinned as the case the repo actually contains.
- The existing repo-wide guard covers the backfill: it reads every plan through `checkPlans`, so the
  mvp plan's two new headers are asserted by the same spec that asserts every status.

## Not in scope

- **Whether an `in progress` reference is still open** — #125, decided as *nothing, and say so*,
  because it needs the network and would put a twelve-instance guard behind a token.
- **The `**Date:**` and `**Goal:**` headers** the mvp plan carries and nothing else does. Two plans'
  worth of convention is not a convention; no rule is proposed for them.

## Verify

`npm run check-plans`, `npm run check-types`, `npm test`. Nothing here renders, so there is no visual
pass to run — the change touches `scripts/` and two markdown files only.
