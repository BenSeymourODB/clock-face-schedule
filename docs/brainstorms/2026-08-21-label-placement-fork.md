# Brainstorm: where a floating label is allowed to sit

**Status:** the reasoning behind #30's placement decisions and #138's proposal; the issues carry the
work and record which parts are ready to build. The margin hand-off below **shipped** in #148 — which
closed #30 carrying its item 2, now held in #180. The ring-vs-sides question is still deliberately
**not** decided here, and as of 2026-08-22 the owner's call is that it is settled by **building the
comparison spike and looking**, per "Why the fork is being resolved by looking" below. Nothing about
it has been rendered yet.

## Why there is a fork at all

The dial's two budgets are mismatched, and the mismatch is the whole of the argument. Usable card
width is `min(labelWidthLimit, faceClearanceLimit)` at the card's own position, on a **four-line
budget** (104.11 units, #35's duration line included) — that assumption binds one row of the table and
no other. Separability is how fast a card's centre moves vertically with angle: `dy/dθ = R·sin θ` **per
radian**, so the per-degree column below is `R·sin θ·π/180`.

| position | usable width | chars a line | `dy/dθ` |
| --- | --- | --- | --- |
| 12 / 6 o'clock | 700.8 (face unbounded) | **65** | **0.00 u/deg** |
| 1 / 5 / 7 / 11 | 403.0 | 37 | 2.60 |
| 2 / 4 / 8 / 10 | 155.9 | 13 | 4.50 |
| 3 / 9 o'clock | 105.1 | **8** | **5.20 u/deg** |

The 2/4/8/10 row is the one that depends on the four-line budget: at three lines it is 170.2 and 15
characters. The other three rows are frame-bound and identical at any line count.

**The dial offers 65 characters a line exactly where two cards cannot be separated at all, and 8
characters where they separate fastest.** Width is available where vertical room is not, and vertical
room where width is not.

That single table explains both live symptoms without appealing to either: cards pile at twelve and
six (#134 measured three there, one invisible), and titles truncate at three and nine. It also answers
the question that prompted #138 — why `Staff Debrief and Planning` gets a wide card while other titles
wrap to nothing. At `?now=11:00&freeze=1` it sits near six o'clock, where the ceiling is 700.8 units, so
26 characters fit on one line at 285.3. The same title at three o'clock has a 105.1-unit ceiling.
**Position, not content.**

The pin matters and is not decoration: the 12-hour dial's angle origin is the period start, so an
event's bearing rotates with the wall clock. That same event is at 7.5° at `?now=11:00` and 67.5° at
`?now=13:00`. Any claim here about *where* a fixture event sits needs a `?now=` to be reproducible.

## Settled, and required by both branches

### The margin hand-off comes first

ADR 0009 allocates the board's width: a 180-unit panel on the right, the dial centred in the remainder.

**The margin that allocation actually grants is larger than the ADR states, and this is a correction to
it rather than a restatement.** ADR 0009 computed the board's width in dial units as `600 × aspect`,
which assumes the dial fills the board's *height* — so 600 units is the full height. Under the sizing
#115 shipped the dial takes **85.4%** of it, so the same board is proportionally wider measured in dial
units, and the margin grows with it:

| | board width, in dial units | margin per side |
| --- | --- | --- |
| 16:9, dial at full height (ADR 0009's premise) | 1066.7 | 143.3 |
| **16:9, dial at 85.4% (as shipped)** | **1249.0** | **234.5** |
| 16:10, dial at full height | 960.0 | 90.0 |
| **16:10, dial at 85.4% (as shipped)** | **1124.1** | **172.1** |

Cross-check at 1920×1080: 1.5372 px per unit (`CLAUDE.md`), so 1920 px is 1249.0 units. Against the
**50.4** the renderer assumes today, either row is a large grant.

ADR 0009's #115 amendment says *"the unit arithmetic and the 180-unit choice are unaffected"*. That
holds for the knee (75.4) and the saturation ceiling (155.2) — both properties of the locus — but **not
for the margin figures**, which depend on the dial's share of the height. The 180-unit choice and the
209-unit ceiling are unaffected, and both move further inside their headroom. Worth correcting in the
ADR; recorded on #39.

The renderer does not know. `analogClock` derives its allowance from `OVERFLOW_RATIO`, so the margin
has to arrive as a host-measured `labelMargin` parameter — the mechanism #30 item 1 has recommended
since it was filed. The geometry stays pure and node-testable; the host owns the layout question.

What it buys, on the existing circular locus with no shape change at all:

| | guaranteed card width | chars a line |
| --- | --- | --- |
| today | 105.1 | 8 |
| #88's ellipse, at today's margin | 132.3 | 11 |
| **today's circle, at the granted margin** | **155.2** | **13** |

**This is not optional for either branch.** #138 is explicit that side placement built before the
margin is granted is a *regression*: every card lands where the frame binds, so at today's allowance
the sides would truncate everything to four characters a line — worse than what ships. The ordering is
#120 (done) → `labelMargin` → the fork.

Decided ordering, 2026-08-21: **grant the margin now with the panel's 180 units reserved but unbuilt.**
The panel drops into a gap already held for it, and labels get 13 characters a line immediately rather
than waiting on #36.

### Two things a locus must not be

- **An ellipse.** ADR 0009: *"not needed and should not be built."* It exists to spend a margin below
  the 75.4-unit knee, buys 11 characters against the circle's 8 there and **nothing** above it, and
  its optimum is *inward* — which costs #98's band occlusion (⚽ 100% covered, `50 min` reading
  `0 min`). #88 is superseded, not deferred.
- **Off-centre.** An offset ellipse reaches the same widths but moves twelve o'clock off the vertical
  axis, turning that connector from vertical to **81° from vertical** — a card pointing sideways at the
  top of the dial. ADR 0009's centre-in-the-remainder keeps `sin θ = 0` on centre instead.

### The band-clearing locus, and where it is available

Solving "clears the band" and "stays on the board" together at three o'clock gives `W = m + 8`, so
`R = 292 + W/2`:

| margin | locus | card width | chars a line |
| --- | --- | --- | --- |
| 90.0 (16:10, ADR 0009's premise) | 341.0 | 98.0 | 8 |
| 143.3 (16:9, ADR 0009's premise) | 367.6 | 151.3 | 13 |
| **172.1 (16:10, as shipped)** | **382.1** | **180.1** | **15** |
| **234.5 (16:9, as shipped)** | **413.3** | **242.5** | **21** |

On both boards a card that never covers an arc carries **at least as much text** as one allowed to sit
on it — the circle saturates at 155.2 units and 13 characters, and the band-clearing card beats that on
either aspect. Clearing the band is not a trade at all under the shipped sizing.

Note this **removes the 16:10 penalty**. Against ADR 0009's premise, 16:10 cost five characters a line
(8 against 13) and was the binding case; corrected, it holds 15. That was the stated reason for judging
the fork at both aspects, so the verification plan below rests on the other reason — the *shape* of the
board changing where cards land — rather than on a width penalty that does not exist.

At twelve and six the picture is different but **not** "unavailable", which is what ADR 0009's premise
implied. The dial does not fill the height: `Styles.html` grants a 7.3vmin frame, **51.3 dial units per
side** (its own comment says so), and a band-clearing card at twelve sits `292 + H` from centre:

| card | top edge, past the 600-unit viewBox | vs the 51.3-unit frame |
| --- | --- | --- |
| 1 line | 22.5 | **inside** |
| 2 lines | 47.1 | **inside** |
| 3 lines | 71.6 | off the board |
| 4 lines | 96.1 | off the board |

So a band-clearing locus is available at twelve and six for one- and two-line cards and not for taller
ones. The sides are an allocation problem and the top and bottom are a **height** problem — which is
still the shape of the fork, but the boundary is a line count rather than a hard no.

Note ADR 0009's `292 + W/2` is a **three-o'clock point solution being read as a curve**. Away from
three o'clock a card's *corner* reaches inward and a circle at 367.6 re-enters the band — by 4.85 units
for a two-line card, and more for taller ones, which is what the generalisation exists to fix:

| card on the R = 367.667 circle | closest approach | inside the band by |
| --- | --- | --- |
| 1 line | 290.48 | 1.52 |
| 2 lines | 287.15 | **4.85** — the figure #138 quotes |
| 3 lines | 282.17 | 9.83 |
| 4 lines | 275.82 | **16.18** |

The generalisation is the card's own radial half-extent, offset from the band:

```
R(θ) = 292 + (W/2)·|sin θ| + (H/2)·|cos θ| + gap
```

Measured over the sweep, its closest approach is exactly **292.000 for every line count** — it clears by
construction, because `R` minus the rectangle's support function in the radial direction is a valid
lower bound on the rect's distance from the centre.

Two things it does **not** do, both of which the shorter version of this section got wrong:

- **It does not reduce to ADR 0009's 367.6 unless `gap = 0`.** At three o'clock it is `292 + W/2 + gap`.
  And `gap = 0` is exactly #117's failure — the card's inner edge lands *on* the band's outer edge and
  the connector has nothing to draw. So the formula generalises the ADR figure or it resolves #117, not
  both; `gap` is an open decision and not a free parameter to fold in.
- **It does not respect the board's outer limit.** #138 measured the furthest card edge at 444.1 against
  a 16:9 limit of 443.3 — 0.8 units over — and `gap` makes that worse unit for unit: 448.2 at `gap = 4`,
  452.2 at `gap = 8` for a two-line card, and about 2 units more again at four lines. So `W` wants
  clamping against the board, which is a constraint the formula has no term for.

### Decided on the ring branch, and reusable on the sides

Recorded on #30 and costed there; none of it is invalidated by a move to side arcs:

- **Displacement is vertical.** Shipped in #134 (`25af2ff`). This was #30 item 2's first question and it
  is answered by implementation, not by argument.
- **The terminator is a merged list-label**, one card naming several arcs, when adjustment cannot
  separate them. Adjust first, merge as the fallback.
- **The merge pass iterates to a fixed point.** A merged card demands *more* clearance than the pair it
  replaced (+2.4° at k=2 to +7.1° at k=4), so one pass is unsound by construction. Termination is free:
  every merge strictly reduces the card count.
- **Connectors terminate at the band's outer edge (292)**, and each entry carries an 8-unit vertical
  colour swatch with a 4-unit gap. The swatch costs **one character a line** — and 4 units costs the
  same integer as 8, so take the wide one.
- **No halo on connectors.** At the decided locus the connector provably never enters the band out to
  **37.4° on 16:9 and 31.1° on 16:10** — the envelope is `acos(292/R)`, so the binding case is the
  narrower board. Every merge the collision rule can produce spans 5.88° to 20.13°, so the worst of them
  sits inside the 16:10 envelope by 1.55× and inside 16:9's by 1.86×. It has no defect to separate.
- **A card's entry budget is per-position in *width* and derived in *height*, and the two do not agree.**
  A merged card at twelve o'clock has 65 characters a line, so width imposes no truncation rule there —
  but the connector's own condition (#117) caps the card's *height* at `h < 8 + m`, which at twelve and
  six is **2 entries at today's 50.4-unit margin, 3 at 16:10's 90, 5 at 16:9's 143.3** (#134). Past that
  cap nothing ties the card to its arcs. So the top of the dial is generous on characters and the most
  constrained on entry count — recording only the character figure inverts #134's finding.

## A third card position: the panel, and what a leader from it can reach

Added 2026-08-22, when the owner decided #172's relief (suppress a redundant card on collision, and
give a panel card a leader to its arc). The panel is a card position neither branch of the fork
contemplated, and **the connector arithmetic above does not transfer to it.**

**#172 quotes 289.8 — a 2.19-unit graze crossing nothing — from Branch B's correction below. That is
a side-card figure.** A side card sits at R ≈ 365; a panel card's left edge sits **540.5 units** from
the dial centre on 16:9 as shipped (`M + 600 + M + padding` against a centre at `M + 300`). Swept
over five card slots × 360 bearings, leaders terminating at the band's outer edge:

| arc's mid-bearing | worst approach to the dial centre | |
| --- | --- | --- |
| **right half** | **207.64** | inside the band's inner edge (216.08) |
| **left half** | **0.53** | essentially through the dial centre |

A left-half leader is not grazing the band — it is a line across the whole face, over the hands and
the numerals. That is #112's defect at much larger scale, and "the right half is elapsed" does not
excuse it, because the hands and the numerals are neither elapsed nor upcoming.

### The condition that does govern, and it is derivable

A leader terminating on the band edge clears the band **iff the card lies outside the tangent line at
its termination point** — `(P − B)·n̂ ≥ 0`, where `n̂` is the outward radial at `B`. That resolves to a
**~115° window of bearings that slides with the card's slot in the column**:

| card slot | bearings whose leader clears |
| --- | --- |
| top (y = 62) | 6°–126° |
| middle (y = 302) | 33°–147° |
| bottom (y = 542) | 54°–174° |

Two things fall out, and the second is why the owner's stated rule wants amending rather than
implementing:

- **Every window lies inside the right half**, so "the arc's mid is on the right" is **necessary**.
- **It is not sufficient**: 316 of the 905 right-half (slot, bearing) pairs still cut the band.

Stable across aspects, so this is not a 16:9 artefact — 32.7% of pairs clear at the ADR's 234.5-unit
margin, 30.9% and 27.9% at the margins #173 actually grants on 16:9 and 16:10, windows 94°–121°
throughout.

For comparison, a **side** card on the [45°, 135°] arc at R = 365 clears only **20.3%** of bearings —
worse, because it sits nearer the band and the tangent condition tightens. The difference is what
happens when it fails: a side card's leader is short and dips 2.19 units, a panel card's reaches the
centre.

**So the rule to build is the window test**, which subsumes both of the owner's clauses and is one
line of arithmetic. What it costs is honesty about coverage: roughly two panel cards in three get no
leader, which is worth rendering before it is accepted — a leader on a third of the column may read
as arbitrary rather than as helpful.

**Not measured here, and it is the obvious next question:** whether the leader should terminate on
the *card's* bearing rather than the arc's (#138's "point rather than join"), which never enters the
band by construction but points at roughly three o'clock for every card, and so may not distinguish
arcs at all.

## The fork itself

### A. Keep the ring

Finish #30's mechanism: vertical displacement and the duration fixed point are both shipped (#134,
then #136 in #142, which put both in one `planOptionalLines` pass), so what remains on this branch is
**the merge fallback alone**, at the granted
margin and the band-clearing locus on the sides.

- Cards stay near the arcs they name; a connector points a short distance.
- #98 resolves on the sides by construction and **survives at twelve and six**, where no locus helps.
  It still needs an answer there — the cheapest is the existing precedent, drop the card's duration
  line, and #98's own analysis is that the narrower class of case makes that far more defensible than
  it first looked.
- #121's frame (10% of the dial's height, of which about **5.0%** buys coverage the fixture never draws
  — 10% × (50.4 − 25.4)/50.4, against the renderer's bound and the fixture's worst pinned card) and
  #135's status-line overlap both survive and both need their own answers.

### B. Two side arcs (#138)

Confine cards to θ ∈ [45°, 135°] and its mirror. Twelve and six stop being label positions.

- **Capacity stops binding.** 14 two-line cards against a fixture that peaks at five.
- **Whether the vertical span stays inside the box depends on which locus, and #138's figure is for the
  wrong one.** Its sweep — no overhang at all — is computed at the *shipped* locus (297.84), where a
  four-line card reaches y 562.7. On the band-clearing locus this document decides for the sides, it
  does not hold:

  | locus | worst card bottom over θ ∈ [45°, 135°] | |
  | --- | --- | --- |
  | shipped, 297.84 (what #138 costed) | 562.7 (4-line) | inside the box |
  | ADR circle, 367.667 | **612.0** (4-line) | past the box |
  | generalised, `gap = 0` | **604.0** (3-line), 622.4 (4-line) | past the box |
  | generalised, `gap = 4` | 606.8 (3-line), **625.2** (4-line) | past the box |

  `#status` starts at 600, so **#135 is not removed by construction and #121's frame is not made
  unnecessary** — not at the locus that buys the width. Both are removed only if the sides keep a locus
  near today's, which gives up the band clearance that is Branch B's other attraction. That trade is
  unpriced and is the first thing to measure.
- **#98 is removed on the sides. It is *not* meaningfully reintroduced at twelve and six** — and this
  reverses what #138 says and what an earlier draft of this document repeated. #138 derives the
  connector's crossing as `365 × cos 45° = 258`, which is the projection of the card's centre onto the
  anchor's bearing, not the segment's minimum radius. The minimum radius of the segment itself:

  | separation between card and anchor | connector's closest approach | inside the band by |
  | --- | --- | --- |
  | **45° (the actual worst case)** | **289.8** | **2.19** |
  | 60° | 276.5 | 15.5 |
  | 73° | 258.6 | 33.4 |
  | 90° | 228.7 | 63.3 |

  A card at 45° serving an event at twelve dips **2.19 units** into a band 75.92 units thick, at its
  outer rim, and is outside r = 292 for the whole of its run. It crosses no arcs. Reaching 258 needs
  **73°** of separation, which the sector cannot produce. So the halo does not become live again here —
  the argument for reviving it rested entirely on the 258 figure — and "terminate on the card's own
  bearing" and "keep a top-and-bottom allowance" are refinements rather than necessary escapes.
- **It is arithmetic.** Not one pixel of it has been rendered, and the two corrections above are both
  cases of arithmetic being carried forward without being recomputed.

### Why the fork is being resolved by looking

Per `CLAUDE.md`: a character budget is not evidence that a card reads from the back of a room, and this
repo's own table records four confident geometric claims that reversed on measurement — including
"an elliptical locus helps most where the frame is tightest", which was exactly backwards.

**A fifth belongs on that table, from this document's own first draft:** *"an event at twelve served by a
side card has its connector enter the band at radius 258 and cut across the arcs between"*. Recomputing
it gives **289.8** — a 2.19-unit graze at the rim, crossing nothing. The claim was carried forward from
#138 without being checked, and it was the sole cost attributed to Branch B and the sole argument for
reviving the connector halo. The cost of checking was one `node -e`.

Decided 2026-08-21: **build the margin hand-off, then render side placement against the ring and
decide by looking.**

**Confirmed 2026-08-22, and the first half is done.** The margin hand-off shipped in #148, so the
precondition #138 calls a regression to skip is satisfied and the spike is now the next step: build
side placement behind a flag, render it against the ring, and decide from the pictures. The owner's
call, against the alternative of committing to the sides on the argument alone — which this document
is the record of why not, since two of #138's own load-bearing claims reversed on recomputation.

**The spike's first job is the trade this document names as unpriced**, not a preference between
pictures: Branch B's headline removals (#121's frame, #135's status line) and Branch B's width gain
want *different* loci, and the table under Branch B shows the wide locus puts a three-line card past
the box at y = 604.0 against `#status` at 600. So the spike has to render **both** loci on the sides,
not one.

The comparison, from #134's own measurements:

- **`?now=11:00&freeze=1`** — 5 cards, and the **three-card pile** (`w`+`d` at 9.83 units).
- **`?now=13:00&freeze=1`** — 4 cards, and the 29.47-unit pair. **Not** a three-card pile; an earlier
  draft of this document attributed the pile to both pins, which would send a reviewer looking for
  something that is not there.
- **`?now=19:00&freeze=1`** — the worst decline case #142 found, four of six cards giving up a duration
  line. It is the pin most sensitive to a placement change, and it postdates #136's own table.
- **The unpinned dial**, which is what a board actually renders.

Note the sizing pass these pins exercise has moved since #136 was filed: #142's `planOptionalLines`
iterates displacement and duration sizing together, so a locus change now feeds a fixed point rather
than two independent passes. Whichever branch lands has to be judged with that pass in place, and its
acceptance rule — *no new colliding pair, no card further outside the clamp band than it already was* —
is stated in terms a new locus changes the inputs to but not the meaning of.

At 16:9 **and** 16:10 — not for a width penalty, which the corrected margins remove, but because the
aspect changes where cards land and what the sector's ends reach. `#status` hidden, per `CLAUDE.md`, for
anything about size — except when checking #135, where `#status` is the thing being collided with.

## What each answer decides for whom

| Issue | Branch A (ring) | Branch B (sides) |
| --- | --- | --- |
| #98 card over band content | resolved on the sides; needs an answer at 12 and 6 | resolved by placement; the connector grazes the rim by 2.19u and crosses nothing |
| #117 connector never draws | needs `gap > 0`, which is still an open decision | same — `gap` is the open term either way |
| #121 frame costs 10% of the dial | still needs one of its four answers | unnecessary **only at a locus near today's**; past the box at the band-clearing one |
| #135 card over the status line | still needs one of its three answers | same conditional as #121 — not free at the wide locus |
| #136 duration lines handed back | **shipped** in #142 — `planOptionalLines` iterates displacement and sizing to a fixed point | the pass survives, but its offers are re-priced against whatever locus lands |
| #141 may a duration be bought with title characters | open, four candidate rules — and it is #142's deferred half | same question, and the answer may differ by position |
| #88 elliptical locus | close as superseded | close as superseded |

The two conditional rows are the point of the fork rather than a caveat on it: **Branch B's headline
removals and Branch B's width gain want different loci**, and nothing has measured which way that trades.

## Rejected, with reasons

- **Restoring the 39.7 units #21 took.** Answered a scarce margin. Above the 75.4-unit knee the
  question dissolves; below it, moving *out* spends frame clearance faster than it buys face clearance.
- **A per-side semi-axis.** Necessary only under a board-centred dial. ADR 0009 centres the dial in the
  remainder, so both margins are equal by construction.
- **Pushing the locus outward as far as it will go.** Usable width has an optimum, not a monotone. The
  familiar figures — peaking near a 350-unit locus, 167 at 450, 67 at 500 — are computed at a **233.3-unit
  margin**, i.e. the whole of a 16:9 board's slack with no panel and the dial at full height. They are
  `2 × (533.33 − R)` exactly. Quoted without that frame they mislead: at the margin this document grants,
  and at today's 50.4, the frame term goes **negative** at both 450 and 500 — the card does not fit at
  all rather than fitting badly — and the peak sits at **335.8** (215.1 units) rather than 350. The shape
  of the claim survives; the numbers belong to a frame nothing here uses. Recompute the peak against
  whichever margin is actually granted, per #88's derivation, rather than reusing a radius.
- **More radius as the answer to crowding.** Restoring the whole 39.7 units moves the three-line
  collision threshold from 15.4° to 13.5° — under four minutes of dial time.
