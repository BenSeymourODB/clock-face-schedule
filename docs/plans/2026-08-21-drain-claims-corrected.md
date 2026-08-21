# The drain claims #150 got wrong, and the guards that would have caught them

**Status:** in progress — outstanding as [#153](https://github.com/BenSeymourODB/clock-face-schedule/issues/153)
**Issue:** [#153](https://github.com/BenSeymourODB/clock-face-schedule/issues/153), following
[#150](https://github.com/BenSeymourODB/clock-face-schedule/pull/150) (merged) and
[#76](https://github.com/BenSeymourODB/clock-face-schedule/issues/76) (closed)
**Docs:** `README.md`'s pin table and the paragraph under it, `CLAUDE.md`'s "The fixture is the
stress case", #152 (the first-paint double drain this turned up), #104 (the pin table's rows), #146
(arcs that name their event nowhere), `src/client/clock-pin.test.ts`'s `readmeSays` harness

## What this is

#150 closed #76 by showing the fixture already drains at load, rewrote the three documents that said
otherwise, and added a guard. It was merged. Reviewing it afterwards found that **four of its own
claims were unchecked, and three of them are false** — in a PR whose entire thesis is that a
documented claim rotted because nothing checked it, and two of the three went into README, where
this repo already built a prose-checking harness.

That is the defect to fix, and it is not "be more careful": every false claim below is one a
`readmeSays` assertion or a tighter spec would have caught. So this is the corrections plus the
guards, not the corrections alone.

## What is wrong, measured

### 1. "The unpinned picture is the `03:00` one, at any time of day" — false

`README.md`, added by #150. Rendered at 1920×1080, 4 s settle:

| | floating labels | arcs | drains (settled) |
| --- | --- | --- | --- |
| unpinned | `x`, `w`, `j`, `f` — **4** | 16 | `n` |
| `?now=03:00&freeze=1` | `z`, `x`, `w`, `j`, `f` — **5** | 16 | `n` |

⚪ Breakfast Club carries a card reading "Breakfast Club / 1 hr 10" when pinned and is an unlabelled
outline when not. The angle origin is the period's start, so the whole dial rotates with the wall
clock and card promotion follows angular position — the frame is tightest at 3 and 9, which
`CLAUDE.md` already records.

**And the unpinned side of that table is not stable either**, which is worse than a wrong figure and
was found by measuring rather than by reasoning. Sampling one unpinned load as it runs: five cards
(`z, x, w, j, f`) at 400 ms, five different ones (`k, x, w, j, f`) at 2 s, four (`x, w, j, f`) at
6 s. Across pins the spread is wider still — five cards at `03:00`, four at `04:15`, three at
`08:30`, three at `00:00`. So "unpinned the fixture draws four cards" would have been a fresh
unchecked claim of the same kind; the honest statement is that **the unpinned card set drifts and is
not quotable at all**, and a pinned dial is the only reproducible one.

**What is actually invariant**, unpinned and at any time of day: the 16 arcs, their ids, the state
partition (5 elapsed, 1 draining), and every ring thickness. `?now=03:00` reproduces exactly that —
asserted now in `clock-pin.test.ts` on ids and partition rather than on a count, since a count passes
on two dials carrying the same number of different arcs. Claim the invariant; say plainly that the
picture is not one.

### 2. "Always draws one draining arc" — false for the first second

Sampling the unpinned gradient list as the page settles: `arc-drain-b-drain` **and**
`arc-drain-n-drain` at 150, 300 and 600 ms; `arc-drain-n-drain` alone from ~1,200 ms. `b` 🔴 Deadline
ends exactly at `anchor + 3h`, and the anchor is read later than the clock the first frame draws
with, so it is briefly in progress. Filed as **#152** with the diagnosis; this plan only has to stop
README overstating it.

#150's "Unpinned and `03:00` are byte-identical in arc set and gradient set" — the strongest phrase
in its body — is true of the settled state and false of the frame a screenshot at 500 ms captures.

### 3. "Passed all 1,489 tests before this — verified by doing it" — false, and I did do it

Setting `"n"`'s end to `at(3, 0)` fails **two** specs, not one:

```
× sample-events.test.ts › has an arc in progress at load, so an unpinned look sees a drain
× clock-pin.test.ts › the fixture figures README states in prose ›
    counts the same arcs at each hour README names
  AssertionError: README says 12 arcs at 06:00: expected 11 to be 12
```

`n` then ends exactly at the `06:00` pin's `windowStart`, where `filterEventsForPeriod` is exclusive.
#150's PR body said "the other 41 specs *in the file* pass", which is correct; its test comment said
"every other spec in this repo", its plan doc said "all 1,300-odd tests", and the comment closing #76
said "passed all 1,489 tests — verified by doing it". The last asserts a verification that disproves
it.

The reading that matters is not the arithmetic: a later reader told "nothing else guards this" who
moves a fixture time gets a red `clock-pin.test.ts` they were told could not happen, and the cheap
way to green is editing README's count list — which is exactly the guard #127 added.

### 4. `hasEventInProgress` is not what decides a drain

#150's spec and PR body both justify the choice with "the function `analog-clock.ts` itself uses to
decide whether to draw a drain". It is not: `analog-clock.ts:452` uses it for the **rebuild cadence**,
and its own docstring says so. The drain is decided by `computeDrainFraction`, which is strict where
`hasEventInProgress` is inclusive:

| | at `now === start` |
| --- | --- |
| `hasEventInProgress` (`start <= nowMs && nowMs < end`) | **true** |
| `computeDrainFraction` (`nowAngle <= trueStartAngle → undefined`) | **no drain** |

So the guard is one strict inequality short of the property its own title names. Move the fixture's
only in-progress event to start exactly at `now` — the mirror of the 🔴 Deadline near-miss the fixture
has already sat a millisecond from twice — and the spec is green with no drain on the dial.

### 5. Three new README figures, no guard, in the repo that built the harness

#150 put `15.56`, `75.92`, `35.68` and a new state claim into README prose and extended none of
`clock-pin.test.ts`'s `readmeSays` block — whose own docstring says why it exists: "*README states the
same coverage facts in prose, and prose is the copy nothing checks … That was the second time in two
days.*" Move `ARC_BAND_RATIO`, `RING_GAP_RATIO` or `MIN_RING_THICKNESS_RATIO` and all 1,501 tests stay
green while README tells reviewers to reach for a 35.68-unit ring that no longer exists.

### 6. Smaller, all confirmed

- **`CLAUDE.md`'s fixture inventory** — the list ending "*do not quietly make it easier*" — still
  omits the straddle, while `sample-events.ts`'s own header gained it. Someone rebuilding the fixture
  from the canonical list drops the straddle and hits a spec with no documented reason.
- **The second new spec oversells.** With `"n"` shortened it passes; it costs 179 ms of the file's
  211. Not vacuous — a seam opening a gap would bite — but its docstring implies a bound at an hour,
  and the bound is derived from the very gaps it bounds, so widening a gap raises it in lockstep.
- **Plan-doc statements false to a cold reader:** "rewrites one row" (two); "no spec in
  `sample-events.test.ts` reads an event's running state" (contradicted by the sentence before it);
  "the yellow arc at roughly five o'clock" (a wall-clock artefact of one session — at `?now=03:00`,
  which the same doc calls the identical picture, it is near half past two); "the fixture's four
  floating labels" (five when pinned).
- **README's `11:00` row is wrong, and predates #150.** It says 🟢 Aftercare drains "and running past
  the window's end, with every other event already finished". Measured at that pin: `arc-drain-y-drain`
  yes, but there is no `arc-fade-y-end` — the arc clamped at the window end is `d@1` — and thirteen
  other arcs are drawn, mostly from copy 1. Aftercare crosses the dial's noon seam, not the window's
  end.

## Phases

1. **README and `CLAUDE.md`** — claim the invariant rather than the picture, stop overstating the
   single drain (pointing at #152), add the straddle to the canonical inventory, correct the `11:00`
   row.
2. **The guards.** Extend `readmeSays` to the three ring figures and the `03:00` drain claim; tighten
   the load spec to a strictly-interior straddle asserted through `computeDrainFraction`'s own rule;
   correct the two oversold docstrings.
3. **The shipped plan doc.** Correct #150's four false statements in place. Its `**Status:**` stays
   `done — shipped in #150`, which is still true; these are factual corrections to a document written
   to be picked up cold, not a status change.

## Not in scope

- **#152's fix.** The load-order race is a runtime change with its own remedies and costs, and this
  plan is the corrections. README stops overstating the drain count; it does not stop the second drain.
- **#104's parse.** Still open, and this adds two more hand-checked rows to what it will eventually
  read.
- **#146.** ⚪ Breakfast Club's arc names its event nowhere unpinned — which is how finding 1 was
  found, since pinning gives it a card and that is the difference.
