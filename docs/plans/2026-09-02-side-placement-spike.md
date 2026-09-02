# Plan: the side-placement comparison spike

**Status:** done — shipped in #216
**Issue:** #138
**Docs:** `docs/brainstorms/2026-08-21-label-placement-fork.md` (the reasoning either branch must
keep), ADR 0009 in `docs/DESIGN.md` (the allocation every locus figure is spent out of)

## What is being built, and what is deliberately not

The owner's call on #138, 2026-08-22: *"build the comparison spike and settle the fork by looking"* —
side placement **behind a flag**, rendered against the ring, judged from the pictures. Explicitly
**not** a commitment to Branch B, and not an answer to the body's three decisions; the spike is what
answers them.

So the shipped dial must be untouched. The flag is query-string only, the default path is byte-for-byte
the ring, and nothing is written to `PropertiesService`: a spike is not a preference, and a board that
had accidentally stored one would keep drawing an experiment after the experiment ended.

## The spike's first step, done: the stale tables re-run at the measured grants

The 2026-09-02 comment on #138 leaves this for whoever takes the spike — every locus figure on the
issue and in the brainstorm is costed against a margin 8.4% low, and ADR 0009's fourth amendment
tells a reader to re-run them before briefing this. Re-run here against the grants #213 measured off
the running client (**244.1** on 16:9, **175.0** on 16:10, panel drawn), driving the shipped
`floatingLabelGeometry` over θ ∈ [45°, 135°] at 0.5° steps with the longest fixture title
(`👩‍🏫 Parent Teacher Conference Planning Committee`) and a duration line offered.

Cross-checks before believing any of it: the ring locus reproduces **562.7** for the sector's worst
card bottom (#138's own figure) and **204.4 / 87.6 units into the band** (#184's 87.56), and the
furthest card edge saturates at exactly the board limit, 544.1 and 475.0 — the clamp binding, as it
should.

| 16:9, margin 244.1 | width budget | chars | lines | clearance (band 292) | worst bottom (`#status` 600) |
| --- | --- | --- | --- | --- | --- |
| ring 297.84 — today | 155.2 | 12 | 4 | 204.4 | **562.7** |
| R = 340 | 250.4 | 19 | 4 | 204.4 | 571.7 |
| **R = 380 — the width optimum** | **328.2** | **29** | **3** | 205.3 | 596.2 |
| ADR circle, 418.1 | 252.1 | 19 | 4 | 245.8 | 635.4 |
| **band-clearing, 451.8** | 184.2 | 13 | 4 | **292.0** | **659.3** |

| 16:10, margin 175.0 | width budget | chars | lines | clearance | worst bottom |
| --- | --- | --- | --- | --- | --- |
| ring 297.84 — today | 155.2 | 12 | 4 | 204.4 | **562.7** |
| **R = 340 — the width optimum** | **250.4** | **19** | 4 | 204.4 | 580.2 |
| ADR circle, 383.5 | 183.0 | 13 | 4 | 237.7 | 611.0 |
| **band-clearing, 427.0** | 87.1 | 6 | 4 | **292.1** | **641.7** |

Three things move, and one of them moves against the direction the 2026-09-02 comment expected:

1. **The band-clearing locus moves *outward*, not inward: 413.2 → 451.8 on 16:9, 382.1 → 427.0 on
   16:10.** A larger grant is a wider card, a wider card has more radial extent, and more extent has
   to be pushed further out to clear the band. So the favourable correction to *width* is an
   unfavourable one to Option B's vertical overshoot: **+59.3 units past `#status`**, against the
   +32.0 the issue prices it at.
2. **The width optimum is at R ≈ 380 on 16:9 and R ≈ 340 on 16:10** — 29 and 19 characters a line,
   against the ring's 12. `CLAUDE.md`'s recorded lesson ("pushing labels outward has an optimum")
   arriving again at the new grants, and the optimum is *inside* the ADR circle on both boards.
3. **No locus in the sector keeps a card above `#status`.** The best is the ring itself at 562.7;
   R = 320 is already at 578.3 and everything wider is past 600. `#138`'s *"cannot reach the status
   line at all"* holds only at today's radius — which is the correction the second decision-mode
   comment made, now re-measured at the real grants.

That is the fork as the tables state it: **the ring's radius is the only one that clears `#status`, R ≈ 380
is the only one that buys the characters, and only R ≈ 452 clears the band.** Three properties, three
radii, and the spike's job is to show what each looks like.

**Point 3 does not survive the render, and the reason is what the table is a bound on.** These figures
sweep *every bearing* in θ ∈ [45°, 135°] with the longest fixture title — a guarantee about a position
the dial may never occupy. Rendered at the pins, the occupied bearings are kinder: R = 320 puts the
lowest card at **590.3** and R = 340 at **592.1**, both inside the box on both boards, with nothing
truncated at 340. So two of #138's three promises *are* simultaneously deliverable, which is the claim
the second decision-mode comment ruled out — the table was conservative by about one radius step, not
wrong. Full rendered results in "What the pictures said" below.

## What the flag does

Two parameters, query-string only, on the preview and on the deployed app. **Not gated on `?demo=1`**,
and deliberately: the fork is between loci that differ by seven characters a line, and whether that
reads from the back of a room is a claim about a real calendar rather than about the fixture:

- `?labels=sides` — confine every card to two side sectors instead of spacing them round the ring.
- `?locus=<number>` — override the label locus radius in viewBox units. Works on the ring too, which
  is the cheap way to sweep radii on a board without a rebuild.
- `?locus=wide` — ADR 0009's `292 + (m + 8)/2` from the *granted* margin, so it tracks the board.

`?locus=` is what makes the flag worth having over three hard-coded variants: the three radii above
are measured against *this* fixture, and a maintainer looking at a real calendar can walk them.

**There is deliberately no `?locus=clear`.** A band-clearing mode would have to *solve* for the
radius, and the second decision-mode comment measured that the implicit equation
`R = 292 + extent(θ) + gap` never settles for 26.1% of cases at 16:9 — a bounded limit cycle of mean
amplitude 27.6 units, because `charBudget` floors to whole characters. The remedy is a scan, and a
scan over the sector costs thousands of layout passes on every render of a dial that rebuilds once a
minute. The band-clearing radius is a *measured number* instead — 452 on 16:9, 427 on 16:10 — and
`?locus=452` is the same picture at none of the cost. If the fork lands on that locus, solving it
properly is its own piece of work rather than a spike's.

## Sector assignment and order — decision 1's default, and no more

Right-half anchors to the right sector, left-half to the left, each card's bearing **clamped into the
sector and kept in its anchor's own angular order**. That is #138's stated default ("ordered by time
down each side... matches the existing clockwise sort") with one deliberate difference recorded here:
the order is *angular*, so on the left sector later events sit higher rather than lower. "Early high,
late low" and "matches the clockwise sort" contradict each other on the left half of a dial, and
keeping a card near its own arc is the property decision 1 says actually costs something.

Crowding is resolved by spreading, not by even spacing: cards start at their clamped anchor bearing
and are pushed apart only as far as their own heights demand, inside the sector's bounds. An
uncrowded card therefore stays next to its arc, and a full sector degrades to even spacing. Where the
sector cannot hold them all, the pass distributes evenly and leaves the overlap to the vertical nudges
`planOptionalLines` returns, which still run — whether displacement remains necessary under side placement is decision 3's second
half, and the honest way to answer it is to leave it in and count how often it fires.

The angular separation a card needs is taken from its height at its *clamped anchor* bearing, one
pass. Height depends on bearing depends on height, and the spread is a separation rule rather than a
proof of non-overlap, so iterating it would buy precision the rule does not have — the same reason
the band-clearing locus is a measured number rather than a solved one.

## Phases

1. **Shared geometry.** `src/shared/clock/side-placement.ts` — sector assignment, the min-gap spread,
   and the locus rules that need no layout. Unit-tested in node.
2. **Renderer.** `cardAngle` on `FloatingLabelParams` (the card's bearing, defaulting to the anchor's,
   so the connector keeps pointing at the arc), and `labelPlacement` / `labelLocus` on `analogClock`.
   Tested under jsdom on rendered attributes.
3. **Host.** `?labels=` and `?locus=` in `main.ts`, README's parameter table, and the pin table if
   the numbers there move (they must not — the default path is unchanged).
4. **Visual pass.** Render `?now=11:00`, `?now=13:00`, `?now=19:00` and unpinned, at 1920×1080 and
   1920×1200, for the ring and for `sides` at each of the three radii. Look at them, attach them, and
   report what the pictures say that the tables do not. **Done — "What the pictures said" below.**

## What the pictures said

Phase 4, done. Every combination rendered on the built preview at 1920×1080 and 1920×1200 with
`#status` hidden — which is what a working board shows, and what makes the grant the measured
244.1 / 175.0 rather than the preview's own — and every card read back off the DOM. The ring is
rendered **at the same widened radii as the sides**, which is the comparison neither the issue nor
this plan had asked for and the one that settles the fork.

Aggregate over the three pins, 15 cards, `?labels=sides`:

| 16:9, sides | titles cut | cards in the band | cards past y 600 | overlapping pairs | lowest card |
| --- | --- | --- | --- | --- | --- |
| R = 297.84 — shipped | **5** | 15 | 0 | 0 | 565.2 |
| R = 320 | 1 | 15 | 0 | 0 | 590.3 |
| **R = 340** | **0** | 13 | **0** | **0** | **592.1** |
| R = 380 | 0 | 8 | 3 | 0 | 630.6 |
| R = 452 | 0 | **0** | 7 | 0 | 648.7 |

| same radii, `ring` | titles cut | cards in the band | cards past y 600 | overlapping pairs | lowest card |
| --- | --- | --- | --- | --- | --- |
| R = 297.84 — shipped | 5 | 12 | 7 | **0** | 648.9 |
| R = 320 | 1 | 9 | 8 | **4** | 644.2 |
| R = 340 | 0 | 7 | 7 | **4** | 651.3 |
| R = 380 | 0 | 5 | 8 | **4** | 665.7 |
| R = 452 | 0 | **0** | 10 | **5** | 665.7 |

1. **The band clearance and the recovered titles both come from the locus, not from the placement.**
   The ring at R = 452 also puts every card off the band and truncates nothing. #138's opening claim
   — cards on the sides "are far less likely to cover an arc" — is not what the renders show is doing
   the work.
2. **What side placement does is make a widened locus usable at all.** Above the shipped radius the
   ring leaves four to five overlapping card pairs at every pin; the sides leave none at any radius
   tested. At `?now=19:00&freeze=1`, R = 452, the ring hides **339.4 × 32.6 units** of *Study Skills
   and Exam Revision* under the Swimming card — a title on a card *because* it did not fit its arc,
   hidden by the card beside it, which is #35's failure returning. The ring's lowest card also
   saturates at 665.7 from R = 360 up: that is `labelVerticalBand` clamping, and the clamp is why the
   collisions cannot be displaced away.
3. **So the mismatched budget is the finding, not the motivation.** A wider card needs more vertical
   separation; at twelve and six there is none to give. The sides trade the room the dial has for the
   room it lacks, and that is the whole of their measured contribution — the locus is the decision.
4. **Past the optimum, width costs width.** 16:10 truncates two titles again at R = 440 and gains two
   overlapping pairs at 452. `CLAUDE.md`'s recorded lesson, arriving a third time.
5. **Twelve and six stop being *anchor* positions, not stopping-places.** The sector clamps a card's
   centre, not its extent: at 16:9, `?now=19:00`, R = 380, the *Parent Teacher Conference Planning
   Committee* card is centred at 45° and still spans x 309.7 → 827.7 at y 3.8 → 58.8 — 9.7 units off
   the twelve o'clock ray, across the top of the frame, and 241.4 from the centre, so it is one of the
   cards still in the band. Nothing is covered there, but "twelve and six stop being label positions"
   is not what a wide card does.
6. **Two things the sides fix that no table costed.** The three-card pile at `?now=11:00&freeze=1`
   resolves into two clear cards on the left and one on the right, and *Assembly* keeps its duration
   line instead of giving it up. Against that, at the shipped radius the sides are a plain regression:
   13 characters a line against the ring's 26–50, the *Aftercare* and *Lunch* arc titles covered by
   cards at `?now=19:00`, and a connector travelling **129.8 units inside the band across 25.9° of
   it** — the crossing #138 predicted and the corrections withdrew, which turns out to be real at
   *today's* radius.

   **The connector figure was first written here as "negligible (1.5–4°) at every wider one", and
   re-measuring it on review reversed that for the radius this plan recommends.** At R = 340 the
   deepest connector still runs **83.4 units inside the band across 16.4°** (87.2 and 17.2°
   unpinned); it reaches 4° only at 380, and at the band-clearing 452 it comes back to 60.7 units at
   `?now=11:00`, because a connector has to reach an arc that is inside the band however far out its
   card sits. So intrusion is not monotone in the locus, and "wider is safer" does not hold for the
   connector the way it does for the card.

## The column neither table counted: arc titles a card covers

Added on review. Both tables above count *cards* — cut, in the band, past the box, overlapping each
other — and none of them counts the thing a card in the band actually costs: **the arc's own title,
drawn inside the band, with a card on top of it.** That is #98, and it is the failure the whole
floating-label mechanism exists to avoid, so it is the column the fork wanted. Measured by reading
every `event-title-*` and `event-duration-*` bounding box back off the browser and intersecting it
with every card rect, aggregated over the three pins:

| 16:9 | R = 297.84 | 320 | 340 | 380 | 410 | 430 | 452 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **sides** — labels covered | 13 | 9 | **9** | 7 | 2 | **0** | **0** |
| **sides** — cards past y 600 | **0** | **0** | **0** | 3 | 7 | 7 | 7 |
| **ring** — labels covered | 6 | 5 | 4 | 2 | 2 | 2 | **0** |
| **ring** — cards past y 600 | 7 | 8 | 7 | 8 | 9 | 9 | 10 |

The two properties do not have a radius in common. On the sides, `labels covered = 0` starts at
**R = 430** and `past y 600 = 0` ends at **R = 340**; on 16:10 the windows are 410 and 340. The ring
never satisfies the second at any radius, the shipped one included.

So the render adds a fourth property to the three the tables opened with, and it is the one that
breaks the tie between them:

| property | best on the sides | best on the ring |
| --- | --- | --- |
| no title truncated | R ≥ 340 | R ≥ 340 |
| every card inside the box | R ≤ 340 | **never** |
| no card overlapping another | every R tested | only R = 297.84 |
| **no arc title covered** | **R ≥ 430** | R ≥ 452 |

**R = 340 is where three of the four meet, and it is the one that buries a title.** At
`?now=19:00&freeze=1` on both boards the *Deadline* arc title is **fully** covered (fraction 1.00)
and *Lunch*'s duration line is 80% covered; at `?now=11:00` *Deadline* is 14% and *Study Skills and
Exam Revision Group* 24%. R = 430 and up covers nothing on either board — and pays 7 cards past
y 600 for it, which is #135 returning. That is the trade the fork now turns on, and it is a
different one from the "ring or sides" the issue opens with.

## Two limits on all of it

The fixture peaks at six cards, so nothing here tests #138's capacity table:
driven with 22 long-titled events the sector saturates and `spreadInSector` falls back to even spacing
and lets them overlap, as its docstring says it will. And card counts drift by one between radii,
because a card the panel already names and that lands on another is discharged to the panel (#172) —
at 16:9, `?now=11:00`, R = 380 that is the Swimming card, dropped on base rects the later passes would
have separated, so a viewer sees a title leave the dial with nothing on screen explaining why.

## What this plan does not decide

All three of #138's decisions, and the fork itself. The spike hands the maintainer pictures and the
numbers above; #138 stays open with the options as the two decision-mode comments state them.

What the render does change is the *shape* of the choice: it is no longer "ring or sides" but "which
locus, and does it need the sides to be drawable". Ranking band clearance, title width and the status
line — #138's decision the render cannot make — now has one fewer degree of freedom to argue about.
