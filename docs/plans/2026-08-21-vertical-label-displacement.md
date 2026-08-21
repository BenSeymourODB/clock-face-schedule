# Floating labels that get out of each other's way

**Status:** in progress — the merge fallback outstanding as [#30](https://github.com/BenSeymourODB/clock-face-schedule/issues/30)
**Issue:** [#30](https://github.com/BenSeymourODB/clock-face-schedule/issues/30) item 2
**Docs:** ADR 0009 (the margin this spends), #98 (cards over the band's content), #117 (the connector
that never draws), #121 (the frame the stack pushes against), #118 (the card's absent colour
channel), #68 (the duration line this pass makes cheaper), #70 (why the panel carries the name the
band cannot)

## What is decided, and by whom

Item 2 of #30 had three open questions. All three are now answered, on the issue thread:

1. **Displace vertically**, not along the locus. Owner's call, explicitly on simplicity grounds:
   "might not look as nice, but we can solve for that later if we want to." So this plan optimises
   for a rule that is easy to predict and easy to test, and does **not** try to keep a card near its
   own arc's angle.
2. **When displacement cannot separate them, merge into a combined list-label** carrying one entry
   per event, with a connector to each arc it names, terminating at the **band's outer edge**
   (r = 292) rather than at the arc's own ring, and a **slim vertical colour swatch** before each
   entry's title.
3. **Order of operations against the clamps** — derived below rather than chosen, and it is what
   makes the rule in phase 1 safe by construction.

Two things were considered and rejected, recorded so nobody re-derives them:

- **A halo on the connector** where it crosses an arc, mirroring #132's soft halo on the AM/PM
  indicator. Rejected because band-edge termination plus ADR 0009's locus means the connector never
  enters the band: it stays clear out to 37.5° of angular separation on 16:9 and 31.25° on 16:10,
  against merges that can only span 5.88°–20.13°. There is nothing left to separate. (If it is ever
  revived: the fill must be `BAND_BACKGROUND`, not `var(--card)` — #132's halo is invisible
  *because* its fill is the ground it sits on, and over the band that same fill is 1.088:1.)
- **An elliptical locus** (#88), retired by ADR 0009 outright.

## Measured on `main` — the defect reproduces at two documented pins

Cards already overlap on the shipped fixture. Rendered through `analogClock` and read off the
label rects, at `f2a19b3`:

| pin | cards | carrying a duration | overlaps |
| --- | --- | --- | --- |
| unpinned | 5 | 5 | none — closest approach 18.26u |
| `03:00` | 5 | 5 | none |
| `01:30` | 4 | 4 | none |
| `04:00` / `04:15` | 4 | 4 | none |
| `08:30` | 3 | 3 | none |
| **`11:00`** | 5 | **2** | **`x@1`+`w@1` 29.47u deep, `w@1`+`d@1` 9.83u deep** |
| **`13:00`** | 4 | **2** | **`x@1`+`w@1` 29.47u deep** |
| `1h` unpinned / `1h 04:15` | 3 / 1 | 3 / 1 | none |

At `11:00` three cards pile up at the bottom of the dial — `Assembly` (96.1 wide), `Staff Debrief
and Planning` (285.3 wide) and `🍽️ Lunch` (96.1 wide), all within y ∈ [557.4, 609.6]. Two things
about that are worse than the issue's own description:

- **#68's mitigation has already paid and still failed.** Three of the five cards declined their
  duration line to avoid an overlap, and a 29.47-unit overlap remains. So the dial is currently
  spending event information *and* getting the collision anyway.
- **A card is 285.3 units wide there.** At 6 o'clock `faceClearanceLimit` returns `Infinity` and
  `labelWidthLimit` is generous, so cards grow wide exactly where they also pile up. Width is not
  the scarce axis at 12 and 6; vertical room is.

## Phase 1 — vertical displacement

### The rule

Only cards that actually collide move, and they only ever move **away from the dial's horizontal
centre line**.

1. Take the card rects as the renderer would draw them (after #68's duration decision), which are
   already clamped.
2. Build the **connected components of the overlap graph** — `rectsOverlap`, transitively. A card
   that overlaps nothing is not touched at all, so the common case is a no-op and the change cannot
   move a card that was already fine.
3. Within a component, sort by natural centre y and pack contiguously, **anchored at the end nearest
   `cy`**: a component below the centre line keeps its topmost card and pushes the rest down; one
   above keeps its bottommost and pushes the rest up; one straddling `cy` splits and does both.
4. If the packed component would leave the clamp band, **return no movement for that component** and
   leave it exactly as it is today. That is the "column runs out" case, and it belongs to phase 2
   rather than to a partial fix that pushes a card off the board.

### Why anchoring away from `cy` is the whole of the safety argument

This is question 3, and vertical displacement makes it cheap in a way displacing along the locus
would not have:

- **`labelWidthLimit` depends only on `x`.** Moving a card vertically cannot invalidate the width
  budget it was wrapped to, so the sizing pass stays upstream of the displacement pass and nothing
  has to be re-derived. Displacing *along the locus* would have moved `x` and broken exactly that.
- **`faceClearanceLimit` depends on `y`**, through `verticalGap = |centre.y − cy| − maxHeight/2`.
  It is monotone: increasing `|centre.y − cy|` can only increase the clearance. So a card that moves
  away from the centre line is still clear of the face **by construction**, with no re-check and no
  circular dependency between width and position.

A pass that packed about a component's own centre would move its innermost card *toward* `cy` and
would need that re-check. Measured on the `11:00` component, it is not a hypothetical: the top card
sits at a vertical gap of 231 units against a face radius of 204.4, so a 23-unit move toward the
centre leaves 208 — still clear, but with 3.6 units to spare. Anchoring outward removes the question.

### Where it lives

`src/shared/clock/stack-labels.ts`, pure and node-testable: rects in, per-rect `dy` out. It takes
`cy` and the clamp band as arguments rather than reaching for the DOM or for `clampLabelPosition`'s
internals, so the geometry layer stays free of both (ADR 0003).

`FloatingLabelParams` gains an optional vertical nudge, applied after `clampLabelPosition` — after,
because the pass measures the clamped rects and its arithmetic has to be about the same numbers the
renderer draws.

## Phase 2 — the combined list-label (not in this PR)

Specified here so it can be picked up cold. All of it is arithmetic over the dial's own constants at
`outerRadius = 292`, `fontSize = 17.52`.

- **Trigger:** a component phase 1 could not fit in the clamp band.
- **Iterate to a fixed point.** A merged card is *taller* than the cards it replaces, so it demands
  more clearance from neighbours it never touched: +2.36° at k=2, +4.73° at k=3, +7.10° at k=4 —
  five to fourteen minutes of dial time of freshly swept territory. Merge, re-measure, merge again.
  Termination is free: every merge strictly reduces the card count.
- **Merging buys almost no room** — 6 units per merge, one `RECT_PADDING_Y` pair (61.06 → 55.06 for
  two one-line cards, 9.8%). It is a legibility device: an overlap makes both titles unreadable, a
  tall card is merely tall. Do not expect it to relieve crowding.
- **Ceiling on entries, derived not chosen.** The connector exists only while the locus clears the
  card's radial half-extent (#117). At 12 and 6 that resolves to `h < 8 + m`: **2 lines at today's
  50.4-unit margin, 3 at 16:10's 90, 5 at 16:9's 143.3**. At 3 and 9 the binding quantity is width
  instead, and the condition is identical to ADR 0009's band-clearing one. Past the ceiling the
  connector does not exist, which is to say nothing ties the card to its arcs.
- **One line per entry**, therefore: at 13 characters a line, three entries with two-line titles is
  6 lines, past the ceiling on every board.
- **The swatch is 8 units wide with a 4-unit gap.** It costs one character a line (13 → 12 on 16:9,
  8 → 7 on 16:10) and 4 units costs exactly the same as 8, because the character budget floors to the
  same integer — so take the wide one. This is #118's "give the card the colour dot back" arriving
  cheaper than an emoji: a rect costs no glyph and no font fallback. It does not close #118, whose
  wash and border are still 1.000:1 and 1.00 on ⚪.

Still open in phase 2, and deliberately small: whether to merge only on collision or also on a
stack-depth rule, and whether entries order clockwise by start angle or by ring depth.

## Verify

`npm run build && npm run check-types && npm test`, then the rendered check that matters, since no
test catches legibility:

- `build/preview.html?now=11:00&freeze=1` — the three-card pile. Before: 29.47u and 9.83u of overlap.
- `build/preview.html?now=13:00&freeze=1` — the 29.47u pair.
- The pins that have no overlap today must be **pixel-unchanged**, because a component with no
  collision is not touched: unpinned, `03:00`, `01:30`, `04:00`, `04:15`, `08:30`, and both 1-hour
  states.

## What rendering showed, including two things the arithmetic did not

- **`Assembly` was not merely overlapped at `11:00`, it was invisible.** Its card (x 297.3–393.4)
  sat inside `Staff Debrief and Planning`'s (105.6–390.9) at the same height, and the later card
  paints over it. The before screenshot has two cards at the bottom of the dial where the DOM has
  three. An event the dial was drawing was carrying no name at all.
- **Six o'clock has almost no room to stack into.** The fixture's three-card pile resolves to
  557.4 → 648.9 against a band that ends at 650.4 — **1.5 units of slack**. A probe of three
  one-line cards slightly lower is declined outright, and a pile of four-line cards there is
  declined by a wide margin. So the pass works at twelve and six and is *already* out of room
  there, which is a measured argument for phase 2 rather than a guess.
- **The displaced card reaches the status line.** The worst card bottom at `11:00` goes from 609.6
  to 648.9 — 48.9 units past the 600-unit box, inside the renderer's own 49.90-unit bound, so the
  envelope is unchanged. It lands on `#status` in a pinned preview. **This collision pre-exists and
  is not caused by this change**: unpinned, `main` already puts card `j`'s bottom edge at 625.3, on
  screen at y 835.5 against a status box starting at 834. Filed separately.
- **Unpinned, this change is a no-op** — same cards, same worst overhang, to the unit. `03:00` and
  `04:15` are **byte-identical** screenshots before and after.

## Deferred

- **The merge fallback** — phase 2 above, staying on #30.
- **Durations declined at natural positions are not revisited.** #68 decides the duration line
  against un-displaced rects, so at `11:00` three cards give up a duration to avoid an overlap that
  displacement then resolves anyway. Re-running that decision after displacement would hand some of
  them back; doing it properly is another fixed point, and it is filed rather than folded in.
- **Cards over the band's content** (#98) is untouched: this pass moves cards relative to each other,
  not relative to the band.
