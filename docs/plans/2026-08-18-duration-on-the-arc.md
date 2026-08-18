# Encode duration redundantly, as text

**Status:** in review
**Issue:** [#35 — Encode duration redundantly on the arc](https://github.com/BenSeymourODB/clock-face-schedule/issues/35)
**Docs:** [`docs/brainstorms/2026-08-17-two-time-scales.md`](../brainstorms/2026-08-17-two-time-scales.md),
`docs/DESIGN.md` (ADR 0003, ADR 0004)

## What this is for

Angular extent is the only channel encoding duration today, and it is the saturated one — thickness
means overlap depth, colour means identity, text is unused. At 0.5°/minute a 20-minute event and a
40-minute event differ by 10°, about the width of the gap between two minute ticks, so across a room
every sub-hour event is "a sliver". Worse, `MIN_ARC_DEGREES` *destroys* the signal outright below
15 minutes: a 5-minute event and a 15-minute one are drawn at the same 7.5°.

The brainstorm is explicit that this is not cosmetic — "Duration is not a secondary attribute here;
it is the content." So the text gets the title's own weight class rather than being tucked away as a
caption.

## Chosen direction

Of #35's two options, **duration as text** ("25 min"). The second option — making arcs countable
against the minute ticks — is not taken here: the issue's own caution is that arcs must not snap to
tick boundaries (that misreports times by up to six minutes, the class of lie #22 removed), so the
tick route reduces to making the *ticks* more prominent, which is a whole-face change with no
absolute figure at the end of it.

## The three things #35 left to settle while building

### 1. Where the text goes

**On the second curved line the title did not use** — the exact radius a two-line title's second
line already occupies, at the same font size, at `font-weight: 400` against the title's 500.

Reusing the existing two-line geometry rather than inventing a radial line is the whole point: the
±`fontSize × 0.55` offsets are already rendered, so there is no new radial arithmetic to get wrong.
Measured on a lone arc (band 75.92, title font 21.26): a two-line stack occupies ±22.32 of the
±37.96 available, and the duration line simply takes the slot the title left empty.

⚠️ That is *not* the same as "no new collision surface", which is what this section claimed before it
was rendered. On a stacked ring the two-line radii collide with the elapsed outline, and a one-line
title had been clear of it — see *What changed from the plan while building* below.

The prerequisite #35 named has landed. It said "#23 would free roughly a third of the ring's height
and is worth landing first" — #23 shipped, the emoji is inline with the title, and
`TITLE_RADIUS_RATIO` was re-centred to 0.5 because nothing shares the radial space any more.

**A three-line stack is not taken.** Title-on-two-lines plus duration measures 34.01 of the 37.96
half-band on a *lone* arc — 3.95 units of margin, against the 15.64 the two-line case leaves, and
negative on every stacked ring. So an arc whose title already needs two lines carries no duration
line: it has spent its text budget.

### 2. Which arcs get it

Not a new span gate. The duration line renders when **the title renders on the arc and fits on one
line**, **the arc has the whole band to itself**, **both strings fit the character budget at the
radius this line displaces the title onto**, and **both lines clear whatever is stroked on the ring's
edges**. Only the first was in this plan before it was rendered and reviewed; the others are all
derived from geometry the dial already computes, so none is a threshold anybody guessed.

The awkwardness #35 flagged is real and is answered on the other surface: the arcs whose duration is
least legible are the slivers, and a sliver's title has already overflowed onto a floating label,
which has room to spare. So **the label card carries the duration too**, as a trailing line. That is
where the `MIN_ARC_DEGREES` information loss actually gets repaired — the fixture's 10-minute
"Reading" and 30-minute "Staff Debrief" are drawn at angles that cannot tell them apart.

Measured on the rendered fixture at 10:15, this draws it for 4 of its 14 events:

| Surface | Fixture events |
| --- | --- |
| Arc second line | 🍽️ Lunch (`50 min`) |
| Label card trailing line | ⚪ Breakfast Club (`1 hr 10`), 👩‍🏫 Parent Teacher… (`1 hr 10`), 🔵 Yoga (`22 min`) |
| Declined, card too crowded | ⚫ Assembly, ⚫ Staff Debrief and Planning — see the opt-out below |
| Neither | 🎮 Game Time, 🔴 Deadline, 🟣 Study (three-deep ring), 🎂 Reading and Snacks, 🧸 Free Play (two-line titles), 📚 Reading (7.5°, no text at all), ⚽ (emoji-only), 🟢 Aftercare (one full line, no room) |

Thin, and honestly so: this fixture is deliberately the worst schedule the project could think of.
Every one of the 14 states its duration to a screen reader regardless, via the arc's accessible name.

### 3. Do not snap arcs to ticks

Nothing here moves an arc. The text is additive.

## Format

`45 min` under an hour, `2 hr` on the hour, `2 hr 25` otherwise.

**The unit switch mirrors the dial's own.** A clock face reads minutes below an hour and hours above
— that is what the two hands are — and #32's whole framing is those two scales, so the text uses the
same split rather than a threshold invented for it.

**The trailing minutes are unlabelled deliberately.** Spelling it "2 hr 25 min" costs 4 more visual
units, and that is not free: at the title's font size an 11-unit string needs roughly 32° of arc,
against 20° for a 7-unit one. On the fixture the difference is whether 🟢 Aftercare (27.5°, budget 9)
carries a duration at all. "hr" is already stated, so the second number has only one thing it can
be.

`2:25` is rejected outright: on a clock face that reads as a time of day.

One format everywhere, with no compact fallback. A dial mixing `2 hr 25` on one arc with `2h25` on
the next is the "needs a second glance" failure this project's premise rules out; an arc too narrow
for the one format shows nothing instead.

## Duration of a clamped event

The **event's own duration**, from its real start and end, not the visible extent of the arc.

⚪ Breakfast Club runs 70 minutes and only 20 of them are inside the window, so its arc is 10° and
its card says `1 hr 10`. That is the redundant channel doing its job: it carries the fact the
geometry structurally cannot, and the window-edge feather (#22) already says "continues past here".

## Phases

1. **Shared, pure:** `duration.ts` with `formatEventDuration`; `durationMinutes` on `ClockEvent`,
   computed in `eventsToClockEvents`; `arcCharBudget` exported from `fit-title.ts` and
   `fitDurationLine` added to `arc-title-layout.ts`. Node tests.
2. **Renderers:** the arc's second line; the card's trailing line, including the extra line in the
   face-clearance budget. jsdom tests asserting rendered SVG attribute names.
3. **Fixture + visual pass:** a case where the duration line is *wider than the title* on a card,
   then build, render, screenshot, look.

## What the fixture does not currently stress

Every existing label card has a title wider than its duration, so nothing exercises a card that has
to widen for the trailing line. Added: a 22-minute `🔵 Yoga` at 6:15 — 11° of arc, a 4-unit title that
overflows a 3-unit budget, and a 6-unit `22 min` line under it. Both the odd duration and the site are
findings rather than choices; see the sections below.

## What changed from the plan while building

**The render found a collision the plan had reasoned its way past.** The plan asserted that reusing
the two-line radii "adds no new collision surface", on the grounds that those radii are already
rendered and verified. That was wrong, and rendering the fixture at 04:15 showed it: 🎮 Game Time's
title and its `1 hr 30` sat **on the elapsed outline of their own arc**.

The cause is an asymmetry #26 introduced on purpose. An elapsed arc's outline and halo are sized from
the whole **band**, so their weight does not thin with overlap depth; the text is sized from this
arc's **ring**. Pushing a one-line title onto the two-line radii closes the gap between them:

| Cluster depth | Ring | Title font | Clearance to the halo |
| --- | --- | --- | --- |
| 1 | 75.92 | 21.26 | 11.08 |
| 2 | 35.68 | 9.99 | 2.80 |
| 3 | 22.27 | 6.24 | **0.03** |
| 4 | 15.56 | 4.36 | **−1.35** |

So `fitDurationLine` gained a **radial gate** alongside the angular one: both lines plus whatever the
caller strokes on the ring's own outline have to fit inside the ring, with 1 unit of clearance — the
separator's own floor, since below that the two marks are not distinguishable anyway. The stroke
width is a parameter rather than a constant here, because the elapsed treatment belongs to the
renderer (and #27's PR is currently retiring the halo, which changes the number).

That gate also settles the legibility question the plan left open: it excludes exactly the three- and
four-deep rings whose text the render showed to be a smudge, so no separate font-size floor had to be
invented.

**A pre-existing instance of the same collision, not fixed here.** A *two-line title* on a three- or
four-deep ring sits at the same radii and so has the same 0.03/−1.35 clearance today, with no gate
available: dropping a line of a title is worse than a near-touch, and the fix belongs with the
band-versus-ring sizing rather than with duration text. Filed separately.

**A third gate came out of self-reviewing the diff.** This line displaces the title off the band's
centre onto one of the two-line radii, and *which* one flips with the half of the dial — so on the
lower half a title fitted at the centre is moved **inward**, onto a budget 4.6% smaller (242.35 against
254.04 on a lone arc), and a title that just fitted could overrun the arc it was measured against.
Both strings are now measured against the inner radius. That also makes an arc and its mirror image
agree, rather than the same event carrying a duration in the morning and losing it in the afternoon.

**One addition beyond the issue.** The arc's `aria-label` now carries the duration too. A listener has
no angular extent to read duration off at all, so unlike the drawn line this is announced whatever
the radial and angular budgets allow.

## What #25 and #27 landing mid-flight changed

Both merged while this was in review, and both moved something it depended on.

**#27 retired the neutral halo, and with it the radial gate's teeth.** The widest stroke on an arc's
outline went from 0.12 of the band to 0.07, so the three-deep clearance went from 0.03 units to 1.93 —
enough to pass, which would have put the duration line back on the cluster the render had already
shown it did not belong on. That forced the gate that was always the real reason: **the arc must have
the band to itself.** Title text is 0.28 of the *ring*, so any division of the band takes it from
21.26 units to 9.99 or 6.24, against the 17.52 the dial deliberately chooses for a floating label —
text a room is meant to read. A name is worth drawing small; a redundant channel is not. The radial
gate stays because it is about a different thing (not drawing text on a stroke) and the two move
independently, as #27 just demonstrated.

**#25's 11-hour window moved Aftercare to 10:50**, which collided with the fixture's new 🔵 Yoga at
10:40. Re-sited to 6:15 — see below, because the first attempt to re-site it found something.

## The card's extra line overlapped its neighbour, and the fix is an opt-out

Rendering the merged fixture at 10:15 found **two real card overlaps** where `main` has none:

| Pair | `main` | With duration lines |
| --- | --- | --- |
| ⚫ Staff Debrief ↔ ⚫ Assembly | 9.52 units apart | **15.01 units of overlap** |
| 👩‍🏫 Parent Teacher ↔ 🔵 Yoga | (no Yoga) | **54 × 30 units of overlap** |

The first is the change's own doing: a card grows about its centre, so two cards 45 minutes apart each
reached ~12 units into the 9.5 between them. An overlapping card can hide a title that is on a card
*because* it did not fit its arc, so this is not a cost to disclose and ship — it is a defect.

**The duration line is optional, so it yields.** `analog-clock` now lays each card out twice and keeps
the duration only where the taller box overlaps no other card, comparing against every *other* card
rather than only the ones already decided — because it was the earlier card growing *upward* that
still overlapped when only the later one gave way. Undecided neighbours are compared at their
title-only size, which is their worst case, so accepting a duration can never force one on anyone
else. Nothing moves, nothing is dropped, and two cards that overlap without any duration still
overlap: this declines to make #30 worse rather than pretending to fix it.

The second overlap was the fixture's fault, not the feature's: beside the conference, Yoga's card
landed *inside* it — that card is wide enough at six o'clock to swallow a short one whole. Moved into
the empty in-window stretch after Lunch, where it stresses the card-sizing case without conflating it
with #30's crowding.

**And re-siting it found a pre-existing bug.** At exactly twenty minutes the arc span computes to
`9.999999999999943°` and loses the 10° overflow floor to floating-point error — so a 20-minute event
renders no title (below the 20° floor), no label, and no standalone glyph, and is completely anonymous
on the dial. Real, plausible, and not this change's to fix; noted on #69, and the fixture event is 22
minutes so it exercises what it is there for.

## Deferred

- **Two-line titles** (🎂 Reading and Snacks, 🧸 Free Play) carry no duration, per the 3.95-unit
  measurement above. Recovering it needs radial room the band does not have — which is #32's own
  subject, not something to force here.
- **Arcs carrying no text at all** — 📚 Reading at 7.5° is below `TITLE_MIN_SPAN_DEGREES` and below
  the 10° floor that routes an overflow to a label, so it shows a bare emoji and nothing else, and
  the emoji-only ⚽ at 12° is the neighbouring case. They are the events `MIN_ARC_DEGREES` lies about
  most and the ones with no text channel to say so. Filed as #69: it is a change to overflow policy,
  not to duration encoding.
- **Stacked rings.** 🎮/🔴/🟣 sit on a 22.3-unit ring where the radial gate excludes the duration
  line. Their *titles* are still drawn at font 6.24, which the render shows to be a smudge at any
  realistic viewing distance — a finding about arc titles in clusters generally rather than about
  duration text, filed as #70 with the depth-by-depth measurements.
- **The same collision under a two-line title** (#67), which has no gate available: at three and four
  deep it sits on the elapsed outline exactly as the duration line would have. The fix is to the
  band-versus-ring sizing rather than to anything here.
- **Card collisions (#30).** A card is a line taller when it carries a duration, so on a crowded
  stretch the duration is declined rather than drawn — ⚫ Staff Debrief and ⚫ Assembly both lose
  theirs on the fixture. Cards still have no collision avoidance and two that overlap without any
  duration still overlap; the displacement pass is #30's.
