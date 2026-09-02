# Three source comments that contradict the code they document

**Status:** in progress — [#209](https://github.com/BenSeymourODB/clock-face-schedule/issues/209)
is the whole of the work and nothing here outlives it.
**Issue:** #209 (from the 2026-08-23 doc sweep)
**Docs:** `docs/DESIGN.md` ("Overlapping events and concentric rings"), `CLAUDE.md` ("Comments
explain decisions, not code")

No behaviour changes. Three comments, one exported function so a test can reach the renderer's own
cap, and one assertion that was missing.

## 1. The fixture's 🟡 Tidy Up comment names the wrong overlap

`src/client/sample-events.ts` says of `"n"`:

> Overlaps only "b", which ends at +3:00, so it opens no fifth ring and the cluster above keeps its
> thickness.

Measured from the fixture's own offsets — `n` is 150–194, `b` is 60–180, `k` is 105–165:

| overlaps `n` | shared span |
| --- | --- |
| `b` 🔴 Deadline | 150–180, **30 minutes** |
| `k` 🟠 Swimming Group B Kit Check and Coach Handover | 150–165, **fifteen minutes** |

So "only `b`" is false. **The conclusion survives and the reason does not**: no fifth ring opens
because peak concurrency anywhere in the fixture is 4 — `a`, `b`, `c`, `k` together at +1:45 — and
4 is `maxRings`. That is a property of the fixture, not of this event's overlaps, and it stays true
however many things `n` runs alongside.

The comment is corrected to state the invariant that holds. Two sentences further down the same
block already say `n` joins the four-deep cluster and renders at 15.56 units, which is only
consistent with the corrected reading.

## 2. `ring-layout.ts` calls `windowStartAngle` a backstop; its only caller passes it and says why

The docstring calls the parameter *"a backstop for a caller that instead hands in angles
independently normalised per event"* and its default of 0 *"a no-op … today's only caller"*.
`analog-clock.ts:377` passes `angleForTime(windowStart, …)` explicitly and documents that the
default *"stopped being true when the window started rolling (#25) and is never true on the 1-hour
scale, where 10:45 gives 240°–570°"*.

The caller is right: `relativeAngle` takes `% 360`, so with the default the 380° event becomes 20°
and sorts before one at 30°. Interval partitioning walked out of order stacks two overlapping
events onto one ring, the later drawn at identical radii and hidden beneath the earlier. The
docstring is rewritten to describe the parameter as required in practice, with the failure named.

## 3. The "greedy rather than optimal" self-assessment — already corrected in source, stale in DESIGN.md

`DESIGN.md` has instructed since the port that the comment *"should be corrected on the way across
rather than copied"*, and the issue reports it was copied. **It was not.** `ring-layout.ts` has
carried the optimality result since it landed (#105); `git log -S "greedy rather than optimal"`
over that path returns nothing. What is stale is DESIGN.md's own paragraph, which still describes
source text that does not exist and sends a reader looking for it — as this issue did. Corrected to
record that the port took the instruction.

`docs/plans/2026-08-15-mvp-clock-face.md` also names the correction as a task. Left alone: a plan is
a record of what was planned, and that line is accurate about the plan.

## The test that was missing

`CLAUDE.md`'s rule is one targeted assertion per defect. Both fixtures already assert their depth
against `AUTHORED_CLUSTER_DEPTH` / `AUTHORED_DEPTH`, which are **derived from the fixture itself** —
deliberately, so the bound tracks the fixture when it is deepened. The cost is that nothing ties
either figure to the renderer's cap: deepen the fixture to five and every existing assertion still
passes while the fifth event is quietly folded onto the innermost ring, drawn on top of a
neighbour.

So: export the cap's derivation from `analog-clock.ts` as `maxRingsForBand`, on the precedent
`EDGE_MARGIN`, `ARC_BAND_RATIO` and `RING_GAP_RATIO` already set in that file — exported so a suite
models the ring the dial actually divides rather than restating the numbers — and assert both
fixtures' authored depth against it.
