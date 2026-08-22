# Brainstorm: what a toggle can promise when the surface carrying it is optional

**Status:** the reasoning behind #178's open decision, prompted by the owner asking whether the
agenda panel is itself a teacher's toggle. **Decided here:** no promise may require the panel, and
"every event states its length" is not available at any setting — both by measurement rather than by
argument. **Not decided here:** which of the three surviving meanings `showEventDurations` takes, and
whether the panel becomes a toggle at all. Numbers are from a 192-state sweep of the built preview
(every 15 minutes, both scales, 1920×1080), reading rendered surfaces rather than code paths.

## Why there is a question at all

#178 makes showing durations one boolean the teacher sets, because the per-element version is
illegible: 36.6% of arcs state a length today, **every one of 192 states is mixed**, and the four
gates that decide it are invisible. The redirect that filed it says the fix is a preference plus
growing cards, not a per-card negotiation.

Then the owner asked the question that breaks the easy answer:

> I'm also contemplating whether the panel will be guaranteed to be shown: showing durations and
> showing the panel could both be toggles available to the teacher.

`arc → card → panel` was the obvious chain, and it is only obvious while the panel is furniture. If
the panel can be switched off, the chain's last link is conditional, and a promise whose last link is
conditional is not a promise.

**The panel is already conditional, and not because of any toggle.** ADR 0009's own consequence list
ends with *"the narrow-display fallback (#39 item 4) is unchanged and still needs designing: as the
board approaches square the margin falls below the knee and the panel has to collapse or stack"*, and
#171 measures what actually happens today — the panel **vanishes** rather than collapsing. So a board
can already be running with no panel, chosen by nobody. A toggle would make an existing conditional
explicit; it would not create one.

That settles the shape of the answer before the toggle question is even reached: **whatever
`showEventDurations = true` promises, it has to be true on a dial with no panel**, because such dials
exist now.

## What each surface can actually carry

The ceiling matters more than the current figure, because the redirect's whole point is that the
current figure is an accident of four gates. Measured over 2028 arcs in 192 states — a mean of
**10.56 arcs a dial, peaking at 16**:

| surface | states a length today | its ceiling | what stops it |
| --- | --- | --- | --- |
| the arc | 336 (16.6%) | **367 (18.1%)** | 875 arcs (43.1%) carry no title at all — too narrow for text, let alone a second line; another 356 (17.6%) carry a two-line title, and #145's model overruns by 6.09 units on the widest ring the dial has |
| the floating card | 407 (20.1%) | **496 (24.5%)** — every card that exists | a card exists only where a title overflowed; making one for an event whose title fit is a new card, not a fuller one |
| **arc + every existing card** | 743 (36.6%) | **832 (41.0%)** — and 863 (42.6%) only if the arc's gates go too | — |
| the panel | **974 of 974 — 100%** | **5 cards** at 26 units, 7 at two lines (ADR 0009); 6 at #174's 21.26 | a fixed column, and it lists a window of the day rather than the dial's set |

**The combined ceiling deliberately does not sum the two above it.** 367 + 496 is 863, but the arc's
367 spends the lone-arc gate, and the section below concludes that gate should be kept — so 832 is
336 (the arc as it is) plus every card, and it is the figure the rest of this document uses. The
distinction changes no conclusion: meaning 1 needs 100% and both numbers are far short of it.

**So even a perfect card channel reaches 41.0%.** The gap is not a policy failure, and it is not one
population but three. The 1196 arcs outside that ceiling are **379** with no identification anywhere
(#146's class — no in-arc title *and* no card), **356** whose two-line title already fills the band,
and **461** carrying a one-line title on a ring the duration gate refuses. Note that the 875 arcs
with no in-arc title are *not* the gap: 496 of them carry their title on a card, and it is that card
the ceiling is counting.

**The panel row is not a dash, and that matters to the answer below.** Measured across the same 192
states, the panel is present in every one, carries 5.07 cards a state (min 5, max 6) — and **every
one of those 974 cards states a duration.** It is today the display's only surface with a consistent
duration channel; the dial's 36.6% is the inconsistent one. That does not rescue meaning 4, which
still dies on the panel-less board, but it does re-price the panel toggle: switching the panel off
removes the one place a length is currently guaranteed.

### A measured reversal, recorded so nobody spends a session on it

The obvious lever looked like the arc's gate: `fitDurationLine` refuses anything but a **lone** arc,
while #145's own clearance model says a two-line stack clears at depth 1 (**+7.73**) *and* depth 2
(**+1.70**), failing only at depth 3 (−0.32) and 4 (−1.32). Dropping the lone-arc rule in favour of
the clearance model should therefore free the stacked rings.

It frees **31 arcs of 2028 — 1.5%.** The one-line-title-with-no-duration population lives where the
model says no:

| ring depth | arcs | states a duration | one-line title, none | two-line title | no title | 2-line stack clears? |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1231 | 336 | 12 | 238 | **645** | yes (+7.73) |
| 2 | 188 | 0 | 19 | 0 | 169 | yes (+1.70) |
| 3 | 250 | 0 | **159** | 66 | 25 | no (−0.32) |
| 4 | 359 | 0 | **271** | 52 | 36 | no (−1.32) |

The gate is not what is stopping it; the band is.

**And the swap is not the correctness tidy-up this document's first draft called it.** The lone-arc
rule is not a proxy for the clearance model — `arc-title-layout.ts` documents them as two independent
gates, and says so explicitly: *"the legibility gate happens to cover every one of those cases today,
but this is the check that is actually about not drawing text on a stroke, and the two move
independently."* The lone-arc rule is the **legibility** gate, and it is about font size, not
clearance. Title text is `TITLE_FONT_SIZE_RATIO` (0.28) of the *ring*, so on the measured band:

| ring depth | ring | arc title size | vs the floating card's 17.52 |
| --- | --- | --- | --- |
| 1 | 75.92 | **21.26** | larger |
| 2 | 35.68 | **9.99** | 57% of it |
| 3 | 22.27 | 6.24 | rendered as "a smear along the band rather than words" (#70) |
| 4 | 15.56 | 4.36 | — |

So freeing depth 2 does not just add 19 durations; it puts duration text at **9.99 units** on rings
where the card channel deliberately uses 17.52, and the source's reasoning is that *a name is worth
having small — a redundant channel is not*. Removing that gate is a legibility decision, not a
cleanup, and it should be argued on its own rather than smuggled in as one. Keep both gates.

### And "a card for everything" is refuted by placement, not by taste

Promoting every silent event to a card needs, per dial, a **mean of 6.23 new cards on top of the 2.58
that exist — a peak of 11 new ones** (`?now=01:45`: 16 arcs, 4 cards, 11 events with neither a card
nor an arc duration). Against that:

- #134 measured **1.5 units of slack** between the resolved pile at six o'clock and the clamp band
  with **five** cards;
- #146 measured promotion of its own narrower class — the 237 arcs carrying no identification at all
  — as taking the peak from 6 cards to **9**, and called the combined list-label a prerequisite
  rather than a fallback for that reason. **Its 237 is not this sweep's denominator**: the same class
  measures 379 over these 192 states (220 on the 12-hour scale alone), so read #146's figure as the
  shape of its own result — a narrower class still reaching nine — rather than as a count comparable
  with the 2028 above.

Nine is already past what displacement can separate. Fifteen is not a layout question, it is a
different display.

## The two toggles are not symmetric, and that decides more than it looks

- **`showEventDurations` hides a channel.** An absent duration is indistinguishable from an event
  whose geometry could not fit one — which is exactly today's defect, seen from the other side. A
  viewer cannot tell "the teacher turned times off" from "this one didn't fit".
- **A panel toggle hides a surface.** Its absence is self-announcing: the dial grows to fill the
  width, and a viewer who knows the display has a panel can see there isn't one.

So ADR 0008's hazard — *a mode nobody knows was changed* — binds much harder on the duration toggle
than on the panel toggle, and #85's argument applies to it in full: a persistent switch that shows
its own position is its own indicator, and the duration toggle needs one more than the scale switch
that argument was made for. **The panel toggle is the safer of the two to ship without a visible
control; the duration toggle is the one that should wait for the bar** — which inverts the intuition
that hiding a whole column is the bigger change.

## What `showEventDurations = true` can honestly promise

Four candidate meanings. The first is dead on the numbers above; the last dies with the panel.

1. **Every event states its length.** ✗ Refuted: 41.0% ceiling on existing surfaces, and closing the
   gap needs a mean of 8.8 cards a dial where five exhaust the band.
2. **Every event that states its *name* states its length.** Ties the duration channel to the name
   channel — *if you can read what it is, you can read how long it is* — which is a rule a viewer can
   infer from the picture without knowing any geometry. Reaches the 1153 arcs (56.9%) that carry a
   title, but the 356 two-line ones need their duration on a card that does not exist yet, so it
   depends on #177's growth work and on a promotion rule (#146's, widened). Aspiration, not a
   near-term promise.
3. **Every card states its length; an arc states it whenever it carries a title.** Consistency
   *within a surface class* rather than across the display. The distinction that makes this legible
   rather than a restatement of today: **a viewer can see why an arc has no text — it is visibly too
   small — and cannot see why a card with room lacks a duration.** Today's 89 duration-less cards are
   the illegible half, and they are the half this closes. Reaches 41.0%, needs no new surface, and it
   is what #177's levers make comfortable rather than tight.
4. **The panel carries the channel; the dial carries none.** The cleanest rule to state and the
   easiest to read — one place for times — and it is the one that **fails outright on a panel-less
   board**, which #171 says is a board that exists today. Available only as *"and the panel is on"*,
   i.e. as a coupled control, which ADR 0008 dislikes and which the owner's framing (two independent
   toggles) rules out.

**Leaning: 3 now, 2 as the destination**, with the panel as an *additional* place a length appears
rather than a link the promise depends on. That keeps the two toggles independent, which is what was
asked for, and it means turning the panel off subtracts a copy of information rather than breaking a
guarantee.

## Constraints any answer must keep

- **It must hold with no panel.** #171 and ADR 0009's undesigned narrow-board fallback both produce
  panel-less dials without anyone choosing one.
- **It must not promise what the band cannot do.** #145's table is geometry: a third line of text
  overruns the widest ring by 6.09 units, and no font size fixes it above 0.50× (18.4 mm, ~2.77 m —
  below the AM/PM indicator #70 already calls the dial's quietest text).
- **It must not need more cards than can be placed.** Five is where #134 ran out of slack; #146's
  narrower promotion already reaches nine at peak.
- **A duration must never be paid for with a name.** #98's ordering — another event's identity, then
  this card's duration, then this card's full title — and #175's measurement of what the trade costs
  (237 characters of event name over a sweep) are both about this. #177 is the answer; the toggle must
  not reintroduce the trade by promising more than the width allows.
- **The absent state must be readable.** Whatever the residue is, a viewer should be able to infer
  the rule from the picture. That is the actual acceptance test, and it is a looking question.
- **Off must buy something.** `floatingLabelGeometry` clears a card against `MAX_LINES + 1` whenever a
  duration is on offer, so off makes every card wider by construction and gives the arc its line
  back. If it does not visibly buy that, the toggle is not worth its own switch.

## Rejected, with reasons

- **Coupling the toggles** (durations on ⇒ panel on). Removes the dead-end by construction and makes
  one control silently move another, which is the ADR 0008 hazard in a new costume. It also cannot
  help the near-square board, where the panel is unavailable rather than merely off.
- **A per-event decision with a legend.** Explaining an inconsistency on screen costs more room than
  the inconsistency saves, on a display whose premise is no interaction and nothing behind a menu.
- **Relaxing the arc's lone-arc gate as a coverage lever.** 1.5%, measured above — and it is a
  legibility gate rather than a redundant proxy, so relaxing it costs 9.99-unit duration text on
  depth-2 rings. Not an answer, and not a cleanup either.
- **Making the panel non-optional to save the chain.** #171 is a real board shape, not a bug to
  legislate away; and #39 item 4's fallback has to be designed for it regardless, so the chain would
  still need the panel-less answer.

## What the renders showed

Per `CLAUDE.md`, none of the above is evidence about legibility until it is looked at. The four sets
below were rendered at 1920×1080 with `#status` hidden (dial 922.3 px, the healthy-board figure) and
looked at. They do not settle the decision, but they remove the arithmetic from it.

- **`?now=23:30&freeze=1`** (2 of 13 on the dial) against **`?now=05:00&freeze=1`** (8 of 14) —
  both verified. The pair is a real contrast, but **not the contrast the document assumed**: at
  23:30 the panel beside the dial states five durations, so the viewer's actual experience of the
  "worst" pin is five legible lengths in the column and two on the dial. The case for the toggle is
  about the *dial's* inconsistency, not about a display that goes quiet.
- **`?now=01:45&freeze=1`** — 16 arcs, 4 cards, 11 events with neither, all confirmed. The picture
  says the dial is **full**: the four-deep cluster between 1 and 3 o'clock is already an illegible
  smear at 4.36-unit text, and the cards that exist are colliding (`Staff Debrief and Planning`
  covers the `🍽️ Lunch` arc's own `50 min`). Eleven more cards is not a layout problem to solve;
  meaning 2 is unreachable at this pin.
- **`?now=19:00&freeze=1`** — the decisive one, and it favours meaning 3. **Six** cards are in view:
  `Yoga 22 min`, `Study Skills… 1 hr`, `Swimming… 1 hr` and `👩‍🏫 Parent Teacher Conference Planning
  Committee 1 hr 10` state a length; **`Staff Debrief and Planning` and `Assembly` do not, and sit
  directly beside the four that do.** Nothing in the
  picture explains the difference — which is exactly the illegible half meaning 3 closes. Meaning 2
  additionally wants `Free Play` and `🎂 Reading and Snacks` to state lengths; both are *two-line*
  titles on lone arcs, so #145 rules out a third line and each needs a new card. **Those two cards
  are the cheap ones, though, and an earlier draft had this backwards.** The crowding at this pin is
  at 4–6 o'clock, where the six existing cards sit between 4.3 and 6.3 o'clock and two of them cover
  arc titles (`Deadline`, 27 × 26 px; `Tidy Up and Line Up`, 37 × 26 px). `🎂 Reading and Snacks`
  and `Free Play` are at **9.4** and **10.9 o'clock** — the emptiest stretch of the label ring, which
  carries one card (`Yoga`, 8.5) between 6.3 and 0.2. So meaning 2 costs nothing extra *here*; the
  pin that refutes it is `01:45`, not this one.
- **Panel at 16:9 and 16:10**, `#status` hidden. The panel is present in **all 192 states**, taking
  276.7 px at 16:9 (dial 1485.6 × 922.3) and 307.4 px at 16:10 (dial 1437.4 × 1024.8). A panel-off
  render is not available from the preview today — there is no flag for it, which is **#186** — so
  the second half of the panel-toggle question is still unlooked-at, and that is now the only render
  outstanding.

## Related

- #178 — the boolean, and the open decision this document is for
- #177 — growing and wrapping the card so a title fits; where the trade this replaces went
- #175 — closed unmerged; the measurement of what a duration costs a title
- #171 / #39 item 4 / ADR 0009 — the panel-less board that already exists, and the fallback still
  undesigned
- #145 — why the band cannot be made to carry a third line
- #146 — the same promise shape for the *name* channel, and the card-promotion cost that binds both
- #70 — why the panel carries names at all, which is what a panel toggle would be switching off
- #85 / #47 / ADR 0008 — the persistent switch, and the hazard a hidden mode carries
- #174 — the panel's own width and type levers, which move its card capacity
- #134 / #136 / #142 — the displacement pass and the slack it has left
- #186 — the preview flag for a panel-off render, which is the one render this document still wants
