# Tie README's pin table to the states the dial renders

**Status:** in progress — the guard and the vocabulary rewrite are outstanding as [#104](https://github.com/BenSeymourODB/clock-face-schedule/issues/104)
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
| `clamped` | — | — | `arc-fade-<id>-start` or `-end` present |

`live` covers an arc with nothing spent, which on this dial means one that has not begun: an event
spanning `now` always drains (`computeDrainFraction` is defined for any `now` strictly inside it), so
there is no fourth "in progress but not draining" state to name.

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
- **A cluster claim** is `the <n>-deep cluster:` followed by claims for its members. It asserts
  `assignRings`' reported depth **and** membership: the arcs the dial puts in a cluster of that depth
  are exactly the events named after the colon. Both halves of what went stale — #67's fourth member
  was an absence, which no per-event claim can catch.

## Verification

- The guard renders at each pin under jsdom and reads the arcs back — the same pipeline
  `analog-clock.ts` runs (`eventsToClockEvents` → `assignRings`), not a re-derivation of it.
- The parser is unit-tested against synthetic cells, including the failing side: an unknown name, an
  ambiguous prefix, a cell whose claim states the wrong state.
- The table is checked for having been read at all: every `?now=` row parsed, a floor on the number
  of claims, and every word of the vocabulary exercised somewhere in the table. A parser that matched
  nothing would otherwise leave a green test asserting nothing.
- Rendered: `build/preview.html` at each of the five pins, to confirm the rewritten cells describe
  what is on screen.

## Not in scope

- **The counts paragraph** is #103's and stays as it is.
- **A README build step** — rejected above.
- **The 1-hour fixture's own pins.** README's table is the 12-hour one; the 1-hour fixture has its
  own figures and no pin table.
