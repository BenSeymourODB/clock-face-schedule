# Suppressing a floating label the agenda panel already names

**Status:** in progress — #172
**Issue:** #172 (the suppression half only; the leader half stays open on the issue)
**Docs:** `docs/DESIGN.md` ADR 0009 — the panel this rule treats as a naming surface. No ADR is
amended: this adds a rule about *floating labels*, and the panel's own allocation is untouched.

## What ships

A floating label whose event the agenda panel already names is **dropped when it is in collision**,
and kept otherwise. The name is not lost — it is on the panel, at 21.2576 units on a plain ground,
where the card would have carried it at 17.52 on the band.

[The owner's decision](https://github.com/BenSeymourODB/clock-face-schedule/issues/172#issuecomment-5378276492)
is option 2 composed with option 3. This is option 2. The leader half is left on the issue, for the
reason that comment gives it: it needs the sliding-window test, it reaches roughly one panel card in
three, and it is *"worth rendering before it is accepted"* — a looking question of its own, and one
that would make this change reviewable only alongside a new visual channel.

## Why this can be built before #98 settles, when the issue body says it cannot

#172's body puts option 2 *"behind #30's mechanism rather than ahead of it"*, because it *"needs the
collision detector #98 does not have yet"*. That is true of the detector but not of the **threshold**,
and the threshold is the part of #98 that is open:

> when a card and an arc's content collide, which one moves?

For a panel-named card **the question does not arise.** #98 is hard because every mechanism it prices
spends something — a duration line, title characters, or distance from the arc — so how much
coverage is worth how much text is a real trade needing a real threshold. Dropping a card whose name
is already rendered larger a few hundred units to the right spends **nothing** on that axis, so *any*
overlap is sufficient reason and no threshold has to be picked. That is the whole of why this is
buildable now, and it is the argument the issue makes in prose (*"the only proposal on the table where
the information is not lost, moved, or shrunk"*) without noticing it also dissolves its own blocker.

## The collision predicate, and what it deliberately excludes

**Ships: a card overlapping another card**, measured at its natural position — before
`planOptionalLines` offers a duration line and before `stackLabels` displaces anything. That ordering
is the point rather than an implementation detail: measured *after* the resolver, only 6 of 251 cards
still overlap, because the resolver has already paid for the rest in declined duration lines and
displacement. Suppressing first is what makes the relief free instead of retrospective.

**Excluded, with the measured cost of excluding it:**

| predicate | why not here |
| --- | --- |
| **#98's band text** — a card over another arc's title, duration or emoji | Needs rendered text boxes, and `renderEvents` runs while the dial is still detached from the page, so `getBBox` is not available where the decision is made. Restructuring the render into a post-attach measuring pass is #98's own work, not this rule's. **Costs nothing on the severe class:** see the measurement below — suppressing *every* panel-named card clears 0 of the 11 catastrophic covers. |
| **#135's status line** | 18 of 251 cards are panel-named and reach past the dial's box. But #121 records that the page *pays* for that frame so cards may use it, and what counts as landing on the status line rather than sitting in the frame is #135's own open question. |
| **#171's panel column** | Structurally impossible since #173: the labels' grant is measured off the row, and a 288-pin sweep per board measured 0 px of intrusion. |

## Measured, on `main` at `8fe7679`

96 pinned states (every half hour × both scales), 1920×1080 and 1920×1200, `#status` hidden, both
surfaces read off the rendered DOM.

| | |
| --- | --- |
| floating labels drawn | **251** |
| also named in the panel | **66 (26.3%)** |
| worst single dial | 3 of 5, at `?now=03:00&freeze=1` |

Those three reproduce #172's headline figures exactly, independently of its sweep. **16:9 and 16:10
render identically** — same cards, same wraps — which is #138's finding on this surface too: both
margins are above ADR 0009's 75.4-unit knee, so the face binds and card width saturates.

### What suppression actually buys, and one thing it does not

Union coverage of every piece of band text by all card rects, recomputed with the panel-named cards
removed:

| | with every card | with panel-named cards dropped |
| --- | --- | --- |
| band text covered ≥2% | **116** | **96** |
| band text covered **≥90%** — the event loses its identity | **11** | **11** |
| elements improved at all | — | 20 |

**Suppression clears 20 covers and not one of the catastrophic ones.** The cards doing the severe
covering are not the cards the panel names — #98's own measurement says the worst offenders are
`Staff Debrief and Planning` and `Reading Circle and Quiet Reflection…`, which are long titles on
lone arcs, and a lone arc's title is exactly the case that does *not* need the panel to be read.

That is worth stating plainly because this issue's title calls it *"the cheapest relief #98 and #135
will ever get"*. It is cheap, and it is real at 17.2% of covers — but it is relief on the graze class
only, and #98's decision is not advanced by it.

### The owner's option 2 is strictly better than option 1, and that was not obvious

| | cards dropped | covers cleared | anchors kept |
| --- | --- | --- | --- |
| **option 1** — suppress unconditionally | 66 (26.3%) | 20 | 0 of 66 |
| **option 2** — suppress on collision, every predicate | 25 (10.0%) | 20 | 41 of 66 |
| **option 2 as shipped** — card-on-card only | **8 (3.2%)** | see below | **58 of 66** |

The first two clear the **same 20 covers**, because a card in no collision is by definition covering
nothing and crowding nothing — so the 41 that option 2 keeps were contributing none of the 20. Option
2 buys back two-thirds of the angular anchors this issue's counter-argument is about, for nothing.
Worth recording, since the issue prices option 1 as the headline and option 2 as "the cautious one".

### What the shipped predicate actually fires on — measured, not projected

Both builds swept over the same 96 pins and the label sets diffed:

| | |
| --- | --- |
| labels drawn | 251 |
| named by the panel | 66 (26.3%) |
| **dropped by this rule** | **8 (3.2%)**, across **5 pins** |
| card text lines across the sweep | 578 → 572 |

**This is far below the 26.3% the issue's title leads with, and the reason is worth having.** On this
fixture the panel-named cards and the *colliding* cards are largely disjoint populations: at
`?now=11:00&freeze=1`, where #134 measured the three-card pile, the panel names **none** of the five
labels drawn; at `?now=03:00&freeze=1`, where 3 of 5 labels are panel-named, none of the three
collides with another card. The overlap is one run of pins, `16:30`–`18:30` on the 12-hour scale.

That the net text falls by only 6 lines while 8 cards' worth of text is removed is the relief showing
up: the survivors re-wrap wider and keep duration lines the pile had made them decline.

**So the ceiling on this mechanism is set by the collision predicate, not by the redundancy.** The
26.3% is real and the relief available from it is real; reaching more of it needs the predicates this
PR leaves out — which is a decision for #98 and #135 rather than a tuning knob here. The numbers for
each are in the exclusions table above.

## Phases

1. **`src/shared/clock/suppress-labels.ts`** — pure, node-testable: given the cards' natural rects,
   their ids and the set the panel names, return the indices to drop. Tests first.
2. **`agenda-panel.ts`** grows `namedIds()`, so the set has **one** derivation and the dial consumes
   the panel's answer rather than re-deriving it from the same events.
3. **`analog-clock.ts`** takes the set as a callback read at render time, suppresses before
   `planOptionalLines`, and keys its rebuild on the set so a card cannot outlive the panel row that
   discharged it. `main.ts` wires it and ticks the panel first.
4. **Render and look** — the pins below, at 16:9 and 16:10, `#status` hidden.

## The staleness hazard, and why it gets its own assertion

The dial rebuilds on a calendar-minute change, on an event ending, and every tick while anything is
in progress. The panel rebuilds whenever its **card set** changes — a different trigger, and it can
fire when the dial's does not, because the column holds only what fits and an event entering the top
of it can push the last one out.

If that happens between dial rebuilds, a label suppressed because the panel named its event stays
suppressed after the panel has dropped the row — and the event is named **nowhere**. That is the
exact failure #146 is filed about, arriving as a race rather than as a policy.

So the named set is part of the dial's rebuild trigger, and `analog-clock.test.ts` asserts the
property directly: change the set, tick, and the card comes back.

## Verify by rendering

**`?now=17:00&freeze=1` is the pin this change is visible at**, and it was found by sweeping rather
than guessed — the pins #172 nominates turn out to be exactly the ones where the rule does nothing:

- `?now=17:00&freeze=1` — **two cards dropped**, `⚫ Staff Debrief and Planning` and `⚫ Assembly`,
  which on `main` stack at six o'clock with the second hanging below the dial's own box. Both are in
  the column. This is the case to judge: the band's bottom edge is clean afterwards, and the question
  is whether the two grey arcs there read as anonymous.
- `?now=17:30&freeze=1` — the same pair; `16:30` and `18:30` drop one each.
- `?now=03:00&freeze=1` — 3 of 5 labels panel-named and **nothing dropped**, because none of them
  collides. The check that the rule keeps the anchor in the common case.
- `?now=11:00&freeze=1` — #134's three-card pile, where the panel names none of them and the
  displacement pass is left to do exactly what it did before.
- Unpinned, which is what a board renders.

At 16:9 **and** 16:10, `#status` hidden per `CLAUDE.md`. The two boards render identically here, as
they do everywhere the face binds.

## Deliberately not here

| | why not |
| --- | --- |
| **The leader from a panel card to its arc** | The other half of #172's decision. Needs the sliding-window test, reaches about one panel card in three, and wants its own render. Stays on the issue. |
| **#98's band-text predicate** | Above — needs a post-attach measuring pass, and buys 0 of the 11 catastrophic covers here. |
| **#146's promotion rule** | This issue argues the two are the same rule stated twice. Suppression makes that testable; acting on it is #146's. |
