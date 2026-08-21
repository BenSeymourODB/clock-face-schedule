# The AM/PM indicator has to survive the hands crossing it

**Status:** done — shipped in [#113](https://github.com/BenSeymourODB/clock-face-schedule/pull/113)
**Issue:** #107
**Docs:** `docs/DESIGN.md` (ADR 0007 — the five CSS custom properties), `README.md` (`?now=`/`&freeze=1`)

## The defect, restated in one line

Every hand is drawn twice — a `var(--card)` halo beneath the coloured line — and the period
indicator is appended *before* those halos, so a hand crossing the indicator does not overlap the
text, it **erases** it.

Reproduced at `build/preview.html?now=18:30&freeze=1&demo=1`, which puts the minute hand at
`rotate(180)` straight down the indicator's own axis. The rendered scanline through the letter stems
reads `-#########G.-Gg-`: the hour hand's bright run abuts the "P" stem with **no face-dark pixel
between them**, and the minute halo has replaced the middle of the "M". The word reads "P И".

Measured on the shipped 600-unit dial, from `getBBox()`:

| | value |
| --- | --- |
| "PM" glyph box | 31.77 wide, centred on the vertical axis |
| "AM" glyph box | 32.53 wide |
| Glyph box height | 21.97 — 1.194 em, i.e. `INK_HEIGHT_RATIO` |
| Hour-hand halo width | 13.29 — 42% of the word |
| Minute-hand halo width | 9.81 — 31% of the word |
| Indicator centre radius | 71.54 |

## Constraints any answer must keep

1. **The indicator must be readable at every time of day.** It is the only mark on a 12-hour face
   saying which half of the day it is, and this display exists for people who find clock arithmetic
   hard. "Half past six — morning or evening" is the question it answers.
2. **The text keeps a real contrast ratio against a known ground.** `--muted-foreground` on
   `--card` is 7:1. `--muted-foreground` over a `--card-foreground` hand is **2.4:1**, below the 3:1
   floor a graphical object gets, let alone the 4.5:1 text floor.
3. **The hands must still read as hands.** Whatever interrupts them may not take so much of a hand's
   length that the line stops reading as continuous.
4. **No new visible furniture on the face.** A permanently visible box around "PM" would be a
   second glance the dial does not currently ask for.
5. **The five CSS custom-property names stay** (ADR 0007), and nothing new is measured server-side
   (ADR 0003).

## Rejected, with the reason

- **Move the indicator out of the hands' way.** There is no such place: every hand starts at the
  centre, so any point at radius 71.5 is crossed twice a day by the hour hand and hourly by the
  minute hand. Moving it outward only adds the second hand, which reaches 190.
- **Draw the indicator after the hands and change nothing else.** One line, and it stops the
  erasure — but it puts the text at 2.4:1 over the hand, breaking constraint 2.
- **`paint-order: stroke fill` on the indicator.** Achieves the same shape as the chosen fix in one
  element, but it is an SVG2 presentation attribute and this file already has the two-element
  idiom (`handWithHalo`) for exactly this job. A camelCase or unsupported attribute here fails the
  way `CLAUDE.md` warns about: renders unstyled, logs nothing.
- **A rounded-rect chip behind the glyph box, drawn last** — what #107 proposed. It works, and it
  was rendered and compared rather than argued away. It fails constraints 3 and 4 harder than the
  chosen fix does: sized to the glyph box plus 0.28 em / 0.12 em of padding it comes out
  **42.08 × 25.84**, which cuts a rectangular notch out of the hour hand that reads as a rendering
  artefact, and — being a rect rather than a dilation of the ink — it paints out to radius **84.7**,
  cutting the 1-hour mode's clearance to the inner hour ring's ink from 17.1 to 10.4. It also needs a text-width model,
  and the one this repo has is wrong for this string: `CHAR_WIDTH_RATIO` predicts 1.2 em where "AM"
  actually measures **1.768 em** at weight 600, a 47% underestimate.

## The fix

Give the indicator **its own halo, in the shape of its own glyphs**, and mount the halo-and-text
pair last so nothing on the face can paint over it:

- a duplicate `<text>` with `fill` *and* `stroke` of `var(--card)` and `stroke-linejoin: round`,
  which dilates the glyph outline outward by half the stroke width;
- the real `--muted-foreground` text on top of it;
- both appended after the hands and the centre dot.

The hand is then interrupted by the letters rather than the other way round — a real clock's date
window — and the text keeps its full 7:1 against `var(--card)`, because `var(--card)` is literally
what is behind it now.

### Sizing the halo

Expressed as a multiple of `HAND_HALO_RATIO`, so the relationship between the two halos is
arithmetic in the code rather than prose. Measured at `deviceScaleFactor: 1` by reading the
luminance scanline through the letter stems at 18:30, where the hour hand abuts the "P".

**This is a claim about pixels, so it has to be made at the scale the wall gets** — the caveat #116
added to `CLAUDE.md`, and the one place in this work where it bites. The sweep was originally run in
a 700×700 viewport, which puts the dial at 616 px; the board renders it at **600** (#115), so that
was 2.7% generous by luck rather than by design. Re-run at exactly 600 px — 1920×1080 with `#status`
hidden, which is the escape hatch `CLAUDE.md` names, keeping the pin for time control while
restoring the wall's own raster — the gap column below reproduces **identically**.

The near miss is worth recording. Had the sweep used the obvious board viewport, 1920×1080 *pinned*,
the dial would have been 950.4 px and one unit 1.584 px: ×1 would have shown 2–3 clear pixels and
looked sufficient, and it delivers **one** on the wall. The caveat would have changed the answer.

| halo per side | face-dark pixels between the bright hour hand and the "P" stem |
| --- | --- |
| 0 — today | **0**, the stem is inside the hand |
| ×1 (2.04) | 1 |
| ×1.5 (3.07) | 2 |
| **×2 (4.09)** | **3** |
| ×3 (6.13) | 5 |

One antialiased pixel is the amount a display's own bloom can swallow, so ×1 is the minimum that
separates at all rather than a comfortable choice. **×2.**

The gap is the robust half of this measurement, because a dilation is uniform: 4.09 units of halo is
4.09 units of gap wherever a hand meets a glyph, and at the board's one unit per pixel that is the
pixel count directly. The cost side does *not* reduce to a scanline — the hour hand is tilted, so a
horizontal row cuts a chord whose width depends on which row, and an earlier draft of this plan
quoted "hand pixels surviving" from a single row as though it were a property of the halo. The honest
cost figure is the analytic one: the halo erases a **21.05-unit stretch** of any hand crossing it,
out of that hand's whole length, and the next section is about where that stretch may land. Looking
settles the endpoints — at 600 px, ×3 cuts the hour hand into two visibly separate strokes and ×0
swallows the "P" almost entirely, so both are rejected by eye as well as by arithmetic.

Twice the hands' own halo rather than the same, because the job is not symmetric: a hand's halo
separates a 9.2-unit bright line from the arcs behind it, while this one has to separate a ~2-unit
grey letter stem from that same 9.2-unit bright line.

That measurement governs a hand passing **beside** a stem, which is the case legibility turns on. A
hand running along the word's own axis — every half hour for the minute hand — is broken outright
instead, because the gap between two capitals is narrower than the two dilations meeting across it.
Deliberate: a label interrupting a hand is a date window and the eye completes the line. What is
*not* acceptable is that break landing near a hand's tip, which is the next section.

### The band is a stretch of every hand that gets erased

**The defect the first visual pass missed, and the reason the indicator moves.** The halo mounts
above the hands, so the band it dilates — cap ink plus 4.09 either side, **21.05 units** at the
shipped 204.4 face radius — is erased out of any hand crossing it. Fine where the hand runs on past
it. Not fine where the hand *ends* just beyond it:

| | 1-hour hour hand | 12-hour hour hand | minute hand | second hand |
| --- | --- | --- | --- | --- |
| tip radius | 87.89 | 130.82 | 183.96 | 190.09 |
| own width | 9.20 | 9.20 | 5.72 | 2.04 |
| stub past the band, at `periodIndicator: 0.35` | **5.83** | 48.75 | 101.89 | 108.02 |
| stub ÷ width | **0.63** | 5.30 | 17.8 | 52.9 |

At 06:00 and 18:00 in the 1-hour scale mode, all that survived past the label was a 5.83-unit
lozenge — shorter than the hand's own width, so with round caps it read as a **detached blob sitting
on the inner "6"**, and the hand pointed at nothing. Missed on the first pass because that mode was
rendered at 18:30 (hand at 195°, off the axis) and at 12:00 (hand pointing away) — never collinear.

A stub reads as a line rather than a mark at roughly twice the width it is drawn at, which caps the
band's outer edge at 69.5:

| `periodIndicator` | centre | band outer | 1-hour stub | ÷ width |
| --- | --- | --- | --- | --- |
| 0.35 — before | 71.54 | 82.07 | 5.83 | 0.63 |
| 0.30 | 61.32 | 71.85 | 16.05 | 1.74 |
| **0.28** | 57.23 | 67.76 | **20.13** | **2.19** |
| 0.26 | 53.14 | 63.67 | 24.22 | 2.63 |

**0.28.** The 0.35 was not chosen against the 1-hour hand — that hand is two days old (#34) and
nothing had measured the two together; 71.54 sitting 16 units inside a tip at 87.89 was a
coincidence. Moving in costs nothing on the other side: the band's inner edge lands at 46.70, which
is 39 units clear of the centre dot and 22 clear of the second hand's counterweight tail at 24.53.

### Radial cost outward

The halo is `var(--card)`, so against the face it is invisible: its extent costs nothing on its own
and matters only where it would *erase* a neighbour. At 0.28 the band's outer edge is 67.76, so the
1-hour mode's inner hour ring — the nearest thing outward, ink from 95.05 — is **27.3** units clear,
where the original position left 13.0 and the rejected chip 10.4. Confirmed by rendering that mode
at 12:00, where both hands point away and the halo is the only thing that could touch the ring: the
inner "6" comes out whole. Nothing else is within 25 units.

## Tests the suite is missing

Both named in #107, and neither exists: the suite checks that the indicator *says* the right thing,
never that it can be read.

1. The indicator's glyph box is not overlapped by any hand's halo at any time of day — as a property
   over the day rather than one sampled hour, since the whole finding is that it is time-dependent.
2. The indicator is painted above everything that can cover it: both hands, both halos, the second
   hand, and the centre dot.

And a third the issue could not have named, because it is a property of the fix rather than of the
defect: **the halo band leaves every hand a stub at least twice its own width**, in both scale modes.
That is the assertion the amputation above needed. It reads the tip and the band off the rendered
attributes, so it cannot drift from the code, and it is parameterised by scale because a
mode-specific hand length is exactly what got missed by eye.

Plus, for the fix itself: the halo carries the same text as the indicator through `setTime` (or AM/PM
would desynchronise at noon), and the halo's stroke width is twice the hands'.

One correction to make while writing them: the glyph box must be measured to **cap ink (0.35 em
either side)**, not to `INK_HEIGHT_RATIO`'s em box. Capitals have no descenders, and the em box is
4.6 units per side larger at this font size — enough that the box would stop being the conservative
one its comment claims, and enough for the vacuity guard to ride on margin rather than on glyphs.
The same correction #78 made to the band's radial gates.

## What this fix does not buy: the indicator is still the shortest read on the dial

Newly computable, because #116 pinned the millimetre scale (26 units = 29 mm, from the dial's actual
600 px against a 1080-tall board) and ADR 0009's distance/150 rule can now be applied to any glyph
on the face:

| | units | mm | distance/150 |
| --- | --- | --- | --- |
| hour numerals | 28.62 | 31.9 | 4.79 m |
| panel body, ADR 0009 | 26.00 | 29.0 | 4.35 m |
| 1-hour inner hour ring | 20.44 | 22.8 | 3.42 m |
| **AM/PM indicator** | **18.40** | **20.5** | **3.08 m** |

So the indicator is the smallest text on the dial and reads from 3.1 m where the numerals beside it
reach 4.8 m — which is what #70 already characterises it as, now with a figure. This work makes it
readable *where a hand crosses it*; it does not make it readable *from the back of a room*, and those
are separate defects. Not widened here: type size is #70's decision, it trades against every radial
gate around it, and #107 is about erasure.

One connection worth leaving for whoever takes #70: **enlarging this text widens the halo band, which
shortens the 1-hour hour hand's stub.** The stub test derives the band from the rendered font size
rather than from a constant, so it fails on its own at a font size of 0.13 — 16.22 units of stub
against the 17.28 the floor demands. Nobody can enlarge the indicator without being told to re-check
`RADIUS.periodIndicator`, which is the property that section was written to protect.

## Deferred

**The hour numerals are erased the same way, and worse in proportion.** The same 18:30 render splits
the "6" in half: the numeral's glyph box is 19.91 wide against the minute halo's 9.81, so the halo
takes **49%** of it, against 31% of "PM". Not fixed here — twelve haloed numerals is a change to the
whole face's look, it interacts with #34's greyed-hand emphasis and the 1-hour mode's second numeral
ring, and a covered numeral keeps redundancy an AM/PM indicator has none of: eleven neighbours, a
fixed position, and the very hand that covers it pointing at it. Filed separately.
