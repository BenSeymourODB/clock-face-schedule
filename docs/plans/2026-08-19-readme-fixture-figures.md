# Tie README's fixture figures to the fixture

**Status:** done — shipped in [#105](https://github.com/BenSeymourODB/clock-face-schedule/pull/105)
**Issue:** [#103](https://github.com/BenSeymourODB/clock-face-schedule/issues/103)
**Docs:** #77 (where this surfaced — one edit needed twice, found separately), #73 (the earlier
instance), `4caec7d` (the derived unpinned assertion this extends the reasoning of),
`src/client/preview-template.test.ts` (the precedent for asserting on a repo file through `?raw`)

## The defect

Copies of the same fact, and only one of them is checked.

`src/client/clock-pin.test.ts` asserts what a pinned hour leaves on the dial as literal counts.
`README.md` states the same counts in prose, one screen below the pin table. #77 added a fixture
event: the test went red, correctly, and README did not, because nothing reads it. The figure
would have shipped wrong if the reviewer had stopped at green — and this is the second time in two
days that these literals went stale across a merge.

## There were three copies, not two, and two of them were already wrong

Found by building the guard rather than by reading, which is the point. `fixtureAnchor`'s own doc
comment in `src/client/clock-pin.ts` is a **third** copy, and nothing has ever read it either:

| Copy | Said | Is |
| --- | --- | --- |
| `clock-pin.ts`, arcs at 03:00 | 15 | **16** — never updated for #77 |
| `clock-pin.ts`, arcs a bare `?freeze=1` costs | "from fifteen arcs to one" | **16 to 1** |
| README + `clock-pin.ts`, fixture span start | 22:50 the previous day | **23:10** — wrong when written |

The span figure is the sharper of the two. `b4c5028` introduced "22:50" reading the fixture's
`at(-1, 10)` as an hour and ten minutes before the anchor; the helper computes `hours * 60 +
minutes`, so `at(-1, 10)` is **−50** minutes. `at(-1, 10)` has not moved since #22, so that figure
was never right — a by-eye reading of arithmetic, which is the failure `CLAUDE.md` opens with.

README's counts (16 / 11 / 6 / 3 / none) are all correct, now measured rather than trusted.

## What this ships

Not a derivation, and not a rewrite of README. **A link between the two copies**, so README cannot
be the one that goes quietly stale: one test that reads `README.md` and checks the figures in it
against what the fixture actually produces.

Three facts in that paragraph are duplicated from code, and all three get checked:

| README says | Checked against |
| --- | --- |
| 16 arcs at 03:00, 11 at 06:00, 6 at 09:00, 3 at 12:00, none from 17:00 | `drawnArcs`, the existing helper |
| the fixture spans 23:10 the previous day to 13:15 | `sampleEvents`' own earliest start and latest end |
| a window of `[now − 3h, now + 8h]` | `ROLLING_WINDOW_LOOKBEHIND_HOURS` / `_LOOKAHEAD_HOURS` |

The counts are the fact #77 broke. The other two sit in the same sentence, are stale in exactly the
same way, and cost one regex each.

## The literals stay

`4caec7d` derived the *unpinned* assertion — the property there is that the filter drops nothing,
so a literal was only today's encoding of it. The pinned assertion is not that. It is about the
fixture's **coverage boundary** (23:10 the previous day to 13:15), and deriving it would compare
`drawnArcs` against itself and assert nothing. So the pinned literals are left exactly as they are;
this adds a reader of README beside them, it does not replace them.

Nor does it add a third copy of the numbers: the new test carries no expected counts of its own —
it reads them out of README and computes the other side.

## Reading prose from a test

Ugly, and deliberately chosen over the alternatives in the issue. Moving the table out of README's
prose costs a reader the one thing that told them the fixture goes empty in the afternoon, and
dropping the figures entirely costs the same. README's value here is exactly that the numbers are
visible without running anything.

The file arrives through `import readme from "../../README.md?raw"`, the route
`preview-template.test.ts` already uses for `static/Index.html` — `tsconfig.client.json` carries no
node types on purpose and a test is not a reason to relax that.

**A regex that matches nothing is not a guard**, and that is the whole hazard of parsing prose: a
reworded sentence would leave a green test asserting on an empty list. So each pattern is asserted
to have matched before anything is derived from it, and the count list is asserted to have found
every hour, with a failure message that says which side to change.

Parsing runs against a whitespace-normalised, emphasis-stripped copy so that README's line wrapping
and its `**bold**` markers are not load-bearing — the sentence can be rewrapped or re-emphasised
freely, and only rewording past the anchor phrase trips the guard.

## Reducing three copies to two

The two stale figures in `fixtureAnchor`'s comment are not fixed in place. Restating measured
counts in a source comment is a copy nothing checks, and `CLAUDE.md` is explicit that comments
carry decisions rather than facts a reader can look up. So the comment keeps its reasoning — why a
bare `?freeze=1` must not re-anchor, why midnight anchoring is not unconditional — and loses the
figures, pointing at README and the test instead.

That leaves exactly two copies, and the test holds them in step. Adding a parser for a third would
have been the wrong shape.

## Verified by mutation, not by green

A guard that parses prose can rot into a green test asserting on an empty match, so each assertion
was checked against a deliberately broken README. Five mutations, and the fifth found a hole worth
closing:

| Mutation | |
| --- | --- |
| a count changed (`11` → `12` at 06:00) | red |
| the span changed (`23:10` → `22:50`) | red |
| the window changed (`+ 8h` → `+ 9h`) | red |
| the anchor phrase reworded | red, with the "asserting nothing" message |
| **a figure deleted from the list** | **green** — fixed |

The last one mattered: deleting the offending hour was the cheap way past a red count. Closed with
a floor on how many figures the sentence must name, plus the sentence's own two claims asserted —
the counts must be non-increasing ("drop away through the afternoon") and must end at zero ("empty
by the evening"). Both are derived, so neither adds a literal.

## Phases

1. The test, mutation-checked against a deliberately wrong README before being trusted green.
2. The three stale figures the test found: one in README, two in `clock-pin.ts`'s comment — the
   latter removed rather than corrected.

## Not done here

- **The state table** at README lines 151–157 (`?now=01:30` shows the cluster mid-drain, and so on)
  is duplicated prose of the same class, but checking it needs a render rather than a count, and
  the pinned-count guard is what #77 actually needed. Filed separately rather than widened into
  here.
