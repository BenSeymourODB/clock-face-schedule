# Brainstorm: where a floating label is allowed to sit

**Status:** open fork. The margin hand-off below is decided and should be built first; the ring-vs-sides
question is deliberately **not** decided here, because nothing about it has been rendered. #30 owns
placement, #138 is the side-arc proposal, and this document is what either answer has to keep.

## Why there is a fork at all

The dial's two budgets are mismatched, and the mismatch is the whole of the argument. Usable card
width is `min(labelWidthLimit, faceClearanceLimit)` at the card's own position; separability is how
fast a card's centre moves vertically with angle, `dy/dθ = R·sin θ`.

| position | usable width | chars a line | `dy/dθ` |
| --- | --- | --- | --- |
| 12 / 6 o'clock | 700.8 (face unbounded) | **65** | **0.00 u/deg** |
| 1 / 5 / 7 / 11 | 403.0 | 37 | 2.60 |
| 2 / 4 / 8 / 10 | 155.9 | 13 | 4.50 |
| 3 / 9 o'clock | 105.1 | **8** | **5.20 u/deg** |

**The dial offers 65 characters a line exactly where two cards cannot be separated at all, and 8
characters where they separate fastest.** Width is available where vertical room is not, and vertical
room where width is not.

That single table explains both live symptoms without appealing to either: cards pile at twelve and
six (#134 measured three there, one invisible), and titles truncate at three and nine. It also answers
the question that prompted #138 — why `Staff Debrief and Planning` gets a wide card while other titles
wrap to nothing. It is at six o'clock, where the ceiling is 700.8 units, so 26 characters fit on one
line at 285.3. The same title at three o'clock has a 105.1-unit ceiling. **Position, not content.**

## Settled, and required by both branches

### The margin hand-off comes first

ADR 0009 allocates the board's width: a 180-unit panel on the right, the dial keeping the board's full
height and centred in the remainder. That grants labels **143.3 units of margin on 16:9 and 90.0 on
16:10**, against the **50.4** the renderer assumes today.

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
| 90.0 (16:10) | 341.0 | 98.0 | 8 |
| **143.3 (16:9)** | **367.6** | **151.3** | **13** |

On 16:9 a card that never covers an arc carries **exactly as much text** as one allowed to sit on it.
Clearing the band is free there, and costs five characters a line on 16:10.

It is *unavailable* at twelve and six, where the dial fills the height: a band-clearing card there sits
22.5 units (one line) to 96.1 units (four) above the frame — off the board. So the sides are an
allocation problem and the top and bottom are not, which is the shape of the whole fork.

Note ADR 0009's `292 + W/2` is a **three-o'clock point solution being read as a curve**. Away from
three o'clock a card's *corner* reaches inward and a circle at 367.6 re-enters the band by 4.9 units.
The generalisation is the card's own radial half-extent:

```
R(θ) = 292 + (W/2)·|sin θ| + (H/2)·|cos θ| + gap
```

which clears everywhere by construction, and reduces to 367.6 at three o'clock — so it generalises the
ADR rather than replacing it. The `gap` term is what makes the connector exist at all (#117).

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
  37.5° on 16:9, and every merge the collision rule can produce sits inside that envelope by roughly a
  factor of two. It has no defect to separate.
- **A card's entry budget is per-position, not global.** A merged card at twelve o'clock has 65
  characters a line and needs no truncation rule; writing the budget as a constant would truncate the
  top and bottom for no reason.

## The fork itself

### A. Keep the ring

Finish #30's mechanism: vertical displacement (shipped) plus the merge fallback above, at the granted
margin and the band-clearing locus on the sides.

- Cards stay near the arcs they name; a connector points a short distance.
- #98 resolves on the sides by construction and **survives at twelve and six**, where no locus helps.
  It still needs an answer there — the cheapest is the existing precedent, drop the card's duration
  line, and #98's own analysis is that the narrower class of case makes that far more defensible than
  it first looked.
- #121's frame (10% of the dial's height, of which 5.7% buys coverage the fixture never draws) and
  #135's status-line overlap both survive and both need their own answers.

### B. Two side arcs (#138)

Confine cards to θ ∈ [45°, 135°] and its mirror. Twelve and six stop being label positions.

- **Capacity stops binding.** 14 two-line cards against a fixture that peaks at five, and the vertical
  span stays inside the 600-unit box with no overhang at all — which removes #135 by construction and
  makes #121's frame unnecessary rather than merely cheaper.
- **#98 is removed on the sides and reintroduced as a connector at twelve and six.** An event at twelve
  served by a card at 45° has its connector enter the band at radius 258 and cut across the arcs
  between — the same property, arriving from the other side, and landing on precisely the events the
  ring served best. Three ways out, none needing a decision yet: terminate on the card's own bearing so
  the connector points rather than joins; keep a small top-and-bottom allowance; or halo the crossing,
  which becomes live again here because the clean envelope (37.5°) is narrower than the spread (~45°).
- **It is arithmetic.** Not one pixel of it has been rendered.

### Why the fork is being resolved by looking

Per `CLAUDE.md`: a character budget is not evidence that a card reads from the back of a room, and this
repo's own table records four confident geometric claims that reversed on measurement — including
"an elliptical locus helps most where the frame is tightest", which was exactly backwards.

Decided 2026-08-21: **build the margin hand-off, then render side placement against the ring and
decide by looking.** The comparison is `?now=11:00&freeze=1` and `?now=13:00&freeze=1` — where #134
stacks three cards — plus the unpinned dial, at 16:9 **and** 16:10, since the two boards differ by five
characters a line. `#status` hidden, per `CLAUDE.md`, for anything about size.

## What each answer decides for whom

| Issue | Branch A (ring) | Branch B (sides) |
| --- | --- | --- |
| #98 card over band content | resolved on the sides; needs an answer at 12 and 6 | resolved by placement; returns as a connector crossing |
| #117 connector never draws | resolved by the `gap` term | resolved by the `gap` term |
| #121 frame costs 10% of the dial | still needs one of its four answers | unnecessary — no vertical overhang |
| #135 card over the status line | still needs one of its three answers | impossible by construction |
| #136 duration lines handed back | in flight, and load-bearing | likely the rare path |
| #88 elliptical locus | close as superseded | close as superseded |

## Rejected, with reasons

- **Restoring the 39.7 units #21 took.** Answered a scarce margin. Above the 75.4-unit knee the
  question dissolves; below it, moving *out* spends frame clearance faster than it buys face clearance.
- **A per-side semi-axis.** Necessary only under a board-centred dial. ADR 0009 centres the dial in the
  remainder, so both margins are equal by construction.
- **Pushing the locus outward as far as it will go.** Usable width has an optimum, not a monotone: it
  peaks near a 350-unit locus at a fixed frame and falls away sharply past it (167 at 450, 67 at 500).
- **More radius as the answer to crowding.** Restoring the whole 39.7 units moves the three-line
  collision threshold from 15.4° to 13.5° — under four minutes of dial time.
