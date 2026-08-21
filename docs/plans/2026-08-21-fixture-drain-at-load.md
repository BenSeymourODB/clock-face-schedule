# The drain in the default picture, and the guard that was missing

**Status:** done — shipped in [#150](https://github.com/BenSeymourODB/clock-face-schedule/pull/150)
**Issue:** [#76](https://github.com/BenSeymourODB/clock-face-schedule/issues/76)
**Docs:** `CLAUDE.md` ("Render before you believe it works", which restates the stale claim), README's
pin table, #71 (the drain that never drained), #28 / #27 (the two releases it shipped through), #104
(the pin table's rows, which this rewrites one of), #62 (the tiling this measures across)

## What is decided, and by whom

#76's decision comment settles the fork: **nudge 🔴 Deadline's end past `now`**, so the default
picture carries a draining arc, and rewrite README's `03:00` row in the same PR.

**The first half is already built, by a different means, and it landed before the issue was filed.**
`e6a7dc0` — the PR closing #71, "make the drain masks actually hide the side they mask" — added
`"n" 🟡 Tidy Up and Line Up`, `at(2, 30)` → `at(3, 14)`. The fixture's `now` is always offset
`+3:00`, so that event straddles it at every time of day. `e6a7dc0` is timestamped
2026-08-18 20:14 and #76 was filed 2026-08-18 20:57: the issue's partition table was **43 minutes
stale when it was written**, and every argument built on it since inherits that.

So the decision's *goal* is met and its *mechanism* is not the one chosen. Nudging 🔴 Deadline now
would add a second in-progress arc to satisfy a requirement one already satisfies — deepening the
cluster's concurrency for nothing. What is actually outstanding is the other half of the decision
(the README row) plus the thing that let the claim rot: **nothing asserts the 12-hour fixture has an
event in progress at load.**

## Measured, on this branch

Partition of `sampleEvents` at load, `now = windowStart + 3h` (`node -e`, offsets in minutes from
`now`):

| Event | start | end | state at load |
| --- | --- | --- | --- |
| ⚪ Breakfast Club | −230 | −160 | elapsed |
| 🟢 🎮 Game Time | −150 | −60 | elapsed |
| 🔴 Deadline | −120 | **0** | elapsed — ends exactly at `now` |
| 🟣 Study Skills… | −90 | −30 | elapsed |
| 🟠 Swimming Group B… | −75 | −15 | elapsed |
| **🟡 Tidy Up and Line Up** | **−30** | **+14** | **in progress** |
| ⚫ Assembly | +15 | +60 | future |
| … | | | nine more, all future |

**5 elapsed, 1 in progress, 10 future.** The issue's table records 4 / 0 / 9 and does not contain
`"n"` at all.

Confirmed end to end rather than inferred, on the built `build/preview.html` with no pin at
1920×1080: 16 arcs drawn, and the gradient list is
`arc-fade-z-start`, **`arc-fade-n-drain`**, **`arc-drain-n-drain`**, `arc-fade-y-end` — so the drain
gradient and its feather both exist in the default DOM. Screenshotted and looked at: the yellow
`Tidy Up and Line Up` arc at roughly five o'clock carries the seam, filled on one side and outline
only on the other, beside the four-deep cluster's elapsed outlines.

Across the tiling (`recurringSampleEvents`, three whole periods = 2,535 minutes, one sample per
minute):

| | |
| --- | --- |
| arcs drawn at load | 16 |
| in progress at load | 1 |
| elapsed at load | 5 |
| minutes with something in progress | 2,238 of 2,535 (88.3%) |
| minutes with something elapsed | 2,535 of 2,535 |
| longest stretch with nothing in progress | **55 minutes** |
| fewest arcs drawn at any minute | 10 |

The 55-minute stretch is not incidental: it is the fixture's own deliberate empty span between
`"d" 🟡 🍽️ Lunch` and `"j" 🔵 Yoga`, which `sample-events.ts` documents as the stress case the
window-track exists to distinguish from the gap. So the number is a property of the fixture's design
rather than a hole in it, and the guard has to be written to allow it.

## Why the guard is the deliverable

The 1-hour fixture already has this assertion — `"keeps every state reachable, not just present at
load"`, which checks `{ elapsed: 1, running: 1 }` at load and then samples three periods. It was
written *citing #76*. The 12-hour fixture, the one the default preview draws and the one #76 is
about, has nothing equivalent: no spec in `sample-events.test.ts` reads an event's running state,
and `hasEventInProgress` is unit-tested only against hand-built events.

That is the same shape as the lesson in `CLAUDE.md`: the fixture's mid-flight event is load-bearing
for review coverage, and it is held in place by one comment. Moving `"n"`'s end back fourteen
minutes would take the drain out of every unpinned look again and pass all 1,300-odd tests — which
is exactly how #71 survived #28 and #27.

## Phases

1. **Docs.** README's `03:00` row and the paragraph under the table; `CLAUDE.md`'s restatement of
   the same claim. Both currently assert the fixture never has anything in progress unpinned.
2. **The guard.** A 12-hour counterpart to the 1-hour fixture's state spec, keyed to the measured
   figures above and allowing the 55-minute gap.
3. **Render and compare.** The unpinned preview is unchanged by this PR — no fixture times move — so
   the render is evidence for the claim rather than a before/after of a change.

## Not in scope

- **Nudging 🔴 Deadline.** It would add a second concurrent arc to a cluster the fixture authored at
  four deep, to buy a state already present. Recorded here so the decision comment is not read as
  outstanding.
- **#104's parse of the pin table.** This PR rewrites one row by hand, which is what #104's own
  decision asks to happen first ("that row is rewritten by that work whichever way this goes"). The
  vocabulary normalisation and the parser stay with #104.
- **⚪ Breakfast Club's unnamed arc**, the pale outlined shape at three o'clock in the unpinned
  render. `elementFromPoint` identifies it as `event-arc-z` rather than a card — the fixture's four
  floating labels are `x`, `w`, `j` and `f` — so it is an arc carrying no identification, which is
  #146's territory and not this change's.
