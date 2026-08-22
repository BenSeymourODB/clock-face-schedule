# Tie README's pin table to the states the dial renders

**Status:** done — shipped in [#162](https://github.com/BenSeymourODB/clock-face-schedule/pull/162)
**Issue:** [#104](https://github.com/BenSeymourODB/clock-face-schedule/issues/104)
**Docs:** [#103](https://github.com/BenSeymourODB/clock-face-schedule/issues/103) / #105 (the numeric
half of the same paragraph, and the `?raw` reader this extends), #110's review comment on #104 (the
two rows that were already stale when the issue was filed), `CLAUDE.md` ("README has the parameters
and a table of which times show which fixture states" — the sentence that makes this table
load-bearing)

## The defect

`README.md`'s "Pinning the clock" section carries two duplicated paragraphs. #103 linked the
**numeric** one — arc counts per hour — to the fixture, and deliberately stopped there. The other is
the five-row pin table, and it is the more load-bearing of the two: the counts tell a reader the
dial empties in the afternoon, but the pin table is **the map a reviewer uses to reach a state at
all**. A wrong row sends them to a pin that does not show what they came to look at, and they cannot
tell that from a fixture that changed.

Nothing read it. It went stale twice without anyone noticing — #67 added a fourth member to the
cluster and two rows went on calling it three-deep for a month (found while reviewing #110, not by
anyone reading README).

## The decision, and the objection it has to answer

Settled on the issue: **parse the rows as prose, matching #103 — but normalise the cells to one
state vocabulary first.** The objection to a prose parser is real and this is the answer to it, not
an acceptance of it: *"still live"*, *"elapsed beside it"* and *"running past the window's end"* are
three vocabularies for a state, and a parser guessing between them is worse than no parser. So the
work is two steps, in one PR, in this order:

1. **Rewrite the cells against a fixed vocabulary** — `live` / `draining` / `elapsed` / `clamped`.
2. **Assert each named event is in the state its cell claims**, by rendering at each pin and reading
   the arcs back, the way #103's guard reads `drawnArcs`.

Rejected, with the reasons recorded on the issue: generating the table (gives README a build step it
does not have, for five rows), and dropping the descriptions (costs the reviewer the thing that told
them which pin to reach for).

## What the states are, read off the rendered arc

Measured, not assumed — from `event-arc.ts`, which draws the separator when the event is not elapsed
and the elapsed outline when it is elapsed *or* draining. So the three temporal states are a
partition of two booleans, and `clamped` is orthogonal to all three:

| state | separator | elapsed outline | window feather |
| --- | --- | --- | --- |
| `live` | ✔ | — | either |
| `draining` | ✔ | ✔ | either |
| `elapsed` | — | ✔ | either |
| `clamped` | any | any | `arc-fade-<id>-start` or `-end` present |

`live` covers an arc with nothing spent, which on this dial means one that has not begun: an event
spanning `now` always drains, so there is no fourth "in progress but not draining" state to name.
**Strictly** inside, though — `computeDrainFraction` is interior — so an event starting exactly at
`now` renders `live` rather than draining, which is why the `01:30` row can say 🟣 Study Skills is
`live` at the very minute it starts.

## The grammar the cells are rewritten into

One claim is *a subject, then a state word*. The parser finds each state word and resolves the
subject from the text before it, so ordinary prose may sit around a claim without the parser having
to understand it:

- **A subject is a unique prefix of a fixture title** — `⚫ Staff Debrief` for
  `⚫ Staff Debrief and Planning`. Resolved by taking the longest suffix of the preceding text that
  prefixes exactly one fixture title, which is why a claim can follow prose. Ambiguous or
  unresolvable subjects **throw**, naming the cell: a guard that quietly matched nothing is the
  failure mode one level down (#103's `readmeSays`).
- **`(copy 1)`** after the name reaches that copy of the recurring fixture (`d@1`), since a pin in
  the afternoon draws copy 1 rather than copy 0.
- **`clamped` takes a direction** — `at the leading edge` or `at the trailing edge` — because the two
  ends are different claims and a bare `clamped` would pass on either.
- **A cluster claim** is `the <n>-deep cluster[ …]:` followed by claims for its members, to the end
  of that sentence. It asserts `assignRings`' reported depth **and** membership: the arcs the dial
  thins to that many rings are exactly the events named. Both halves of what went stale — #67's
  fourth member was an absence, which no per-event claim can catch. Two or more deep only: at one
  deep every arc with the band to itself would be "in" it.

## Verification

- The guard renders at each pin under jsdom and reads the arcs back — the same pipeline
  `analog-clock.ts` runs (`eventsToClockEvents` → `assignRings`), not a re-derivation of it.
- The parser is unit-tested against synthetic cells, including the failing side: an unknown name, an
  ambiguous prefix, a cell whose claim states the wrong state.
- The table is checked for having been read at all: every row parsed to at least one claim, one row
  per pin, a floor on the number of claims, a floor on the number of cluster claims, and every word
  of the vocabulary plus both window edges exercised somewhere in the table. A parser that matched
  nothing would otherwise leave a green test asserting nothing.
- Rendered: `build/preview.html` at each of the five pins, to confirm the rewritten cells describe
  what is on screen.

## Not in scope

- **The counts paragraph** is #103's and stays as it is.
- **A README build step** — rejected above.
- **The 1-hour fixture's own pins.** README's table is the 12-hour one; the 1-hour fixture has its
  own figures and no pin table.
- **The card counts two paragraphs below the table**, which are the third copy of the same class.
  Deferred to #163 rather than folded in, and for a reason this plan's approach does not cover: a
  card count is not fixture-invariant the way an arc's state is — it follows angular position, the
  granted label margin and the wrap budget, so pinning the three integers would go red on changes
  that are working as intended.

## What building it changed about the design

Everything in this section was found by mutating README or by reviewing the guard against its own
mutations — none of it by reasoning about the design, and all of it in the cluster claim, which is
the one part with no per-event fallback.

- The phrase was `the <n>-deep cluster:` until a mutation run found the `01:30` row reading *"The
  four-deep cluster mid-drain:"* and matching nothing — so that row carried **no membership claim**
  and deleting a member from it stayed green. Fixed twice over: the phrase may carry a word of its
  own before the colon, and a cell that mentions a cluster the parser cannot read now **throws**.
- Rewording *both* phrases out of the table left every per-event claim intact, every floor satisfied,
  and no membership assertion anywhere on the dial — the #67 shape exactly. So the table now has to
  keep at least two cluster claims, each at the **deepest** cluster its pin opens; naming a shallower
  one would otherwise be a way past the check.
- The member list had no terminator, so a row going on to claim something about an arc *outside* the
  cluster failed on a cell that was true. It now ends at the sentence's end.
- The claimed depth is `assignRings`' — the divisor the dial is handed — and the dial caps that at
  `maxRings`. The fixture sits exactly at the cap, so nothing would have said if the two diverged.
  The membership check is now paired with the members' **drawn radii**: the arcs of an `n`-deep
  cluster have to land on `n` distinct rings.
