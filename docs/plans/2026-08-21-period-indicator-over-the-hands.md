# The AM/PM indicator has to survive the hands crossing it

**Status:** in review
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
arithmetic in the code rather than prose. Measured at `deviceScaleFactor: 1` with the dial at
600 CSS px — the honest small raster — by reading the luminance scanline through the letter stems at
18:30, where the hour hand abuts the "P":

| halo per side | face-dark pixels between hand and glyph | hand pixels surviving left of the glyph |
| --- | --- | --- |
| 0 — today | **0**, the stem is inside the hand | 9 |
| ×1 (2.04) | 1 | 8 |
| ×1.5 (3.07) | 2 | 7 |
| **×2 (4.09)** | **3** | 6 |
| ×3 (6.13) | 5 | **4** — the hand reads as bitten |

One antialiased pixel is the amount a display's own bloom can swallow, so ×1 is the minimum that
separates at all rather than a comfortable choice. ×2 buys three dark pixels while leaving two
thirds of the hand's width, and ×3 halves the hand for one more pixel. **×2.**

Twice the hands' own halo rather than the same, because the job is not symmetric: a hand's halo
separates a 9.2-unit bright line from the arcs behind it, while this one has to separate a ~2-unit
grey letter stem from that same 9.2-unit bright line.

### Radial cost

The halo is `var(--card)`, so against the face it is invisible: its extent costs nothing on its own
and matters only where it would *erase* a neighbour. It dilates the ink by 4.09 units per side, from
78.0 out to **82.1**. In the 1-hour scale mode the nearest thing outward is the inner hour ring's
ink at 95.05, leaving **13.0** — against the chip's 10.4. Confirmed by rendering that mode at 12:00,
where both hands point away and the halo is the only thing that could touch the ring: the inner "6"
comes out whole. Nothing else is within 50 units.

## Tests the suite is missing

Both named in #107, and neither exists: the suite checks that the indicator *says* the right thing,
never that it can be read.

1. The indicator's glyph box is not overlapped by any hand's halo at any time of day — as a property
   over the day rather than one sampled hour, since the whole finding is that it is time-dependent.
2. The indicator is painted above everything that can cover it: both hands, both halos, the second
   hand, and the centre dot.

Plus, for the fix itself: the halo carries the same text as the indicator through `setTime` (or AM/PM
would desynchronise at noon), and the halo's stroke width is twice the hands'.

## Deferred

**The hour numerals are erased the same way, and worse in proportion.** The same 18:30 render splits
the "6" in half: the numeral's glyph box is 19.91 wide against the minute halo's 9.81, so the halo
takes **49%** of it, against 31% of "PM". Not fixed here — twelve haloed numerals is a change to the
whole face's look, it interacts with #34's greyed-hand emphasis and the 1-hour mode's second numeral
ring, and a covered numeral keeps redundancy an AM/PM indicator has none of: eleven neighbours, a
fixed position, and the very hand that covers it pointing at it. Filed separately.
