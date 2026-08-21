# The board's spare width, handed to the labels

**Status:** done — shipped in [#148](https://github.com/BenSeymourODB/clock-face-schedule/pull/148)
**Issue:** [#30](https://github.com/BenSeymourODB/clock-face-schedule/issues/30) item 1
**Docs:** ADR 0009 (the allocation this spends, and the figures it corrects), `docs/brainstorms/2026-08-21-label-placement-fork.md`
(the ordering and the recomputed margins), #115 / #120 (the sizing rule this measures against), #138
(the fork this unblocks), #98 (cards over the band's content), #117 (the connector that never draws),
#121 (the frame), #135 (the status line), #36 / #39 (the panel whose 180 units are reserved here)

## What is decided, and by whom

Item 1 of #30 has been "pass the margin in rather than measure inside the renderer" since the issue
was filed. What was missing was the *number*, and ADR 0009 supplied it: a 180-unit panel on the
right, the dial keeping the board's height and centred in what remains. The ordering was settled on
#30 on 2026-08-21 — **`#120 (done) → labelMargin → the fork`** — and it is a prerequisite rather than
a preference: #138 is explicit that side placement built before the margin is granted is a
*regression*, four characters a line against the eight that ship today.

So this plan builds the hand-off and nothing else. The locus stays the circle at
`outerRadius × 1.02`. The band-clearing locus, the `R(θ)` generalisation, the merge fallback and the
colour swatch all belong to the fork and are deliberately absent.

## The renderer's allowance today, and what it should be

`clamp-label.ts` derives its horizontal allowance from the dial's own width:

```
allowance = clockBox.width × OVERFLOW_RATIO = 584 × 0.1 = 58.4
```

which lets a card's *edge* reach `58.4 − EDGE_MARGIN = 50.4` units past the 600-unit viewBox. That
number is a property of the dial, not of the page the dial is on — so it is the same on a 4K board
and on a phone, and it is what makes a card at three o'clock 105.1 units wide and eight characters a
line.

Reproduced from the dial's own constants, sweeping every quarter-degree and taking the worst
position, because a card lands wherever its arc is:

| margin past the viewBox | guaranteed card width | chars a line | binding angle |
| --- | --- | --- | --- |
| **50.4** — today | **105.1** | **8** | 90.00° |
| 75.4 — the knee | 155.1 | 13 | 90.00° |
| 172.1 — 16:10 as shipped | 155.2 | 13 | 56.25° |
| 234.5 — 16:9 as shipped | 155.2 | 13 | 56.25° |

The knee at 75.4 and the ceiling at 155.2 are ADR 0009's, recomputed here rather than quoted. Past
the knee the circle saturates: **every board this targets gets 13 characters a line, and no board
gets more.**

## What the host measures

The margin the finished layout grants is
`(board width in dial units − 600 − 180) / 2`, and the board's width in dial units comes from the
scale the sizing rule (#115/#120) actually resolves — the drawing's rendered side against its 600
units:

```
drawn      = min(box.width, box.height)      // preserveAspectRatio = xMidYMid meet
pxPerUnit  = drawn / size
boardUnits = viewportWidth / pxPerUnit
margin     = (boardUnits − size − PANEL_RESERVE_UNITS) / 2
```

| board | drawn | px/unit | board in units | margin per side | chars |
| --- | --- | --- | --- | --- | --- |
| 1920×1080 | 922.3 | 1.5372 | 1249.0 | **234.5** | 13 |
| 1920×1200 | 1024.8 | 1.7080 | 1124.1 | **172.1** | 13 |
| 1366×768 | 655.9 | 1.0931 | 1249.6 | 234.8 | 13 |
| 1080×1920 portrait | 922.3 | 1.5372 | 702.6 | negative → floored | 8 |

The first two agree to a tenth of a unit with the brainstorm's corrected table, which was derived
the other way round — from the aspect ratio and the dial's 85.4% share of the height — so the
measurement and the arithmetic are independent and they meet.

**Both figures are larger than ADR 0009's 143.3 and 90.0**, and this is a correction to the ADR
rather than a restatement of it: the ADR computes the board's width as `600 × aspect`, which assumes
the dial fills the board's height. Under #115's sizing the dial takes 85.4% of it, so the same board
is proportionally wider *measured in dial units*. The ADR's knee and ceiling are properties of the
locus and are unaffected; its margin figures are not. Amended in `docs/DESIGN.md`.

### Reserved but unbuilt, and why that is the safe reading

The panel does not exist yet, so there are two things "reserve 180 units" could mean, and they
differ by 90 units:

- Hold 180 out of the room on the panel's side, leaving the dial centred where it is today. The
  tighter side then gets `(boardUnits − 600)/2 − 180`, which is 144.5 at 1920×1080.
- Grant the margin the *finished* layout gives — `(boardUnits − 600 − 180)/2`, 234.5 — since the dial
  re-centres in the remainder when the panel lands.

The second is correct and is also the safer of the two. Today's room per side is
`(boardUnits − 600)/2`, which exceeds the granted margin by exactly `PANEL_RESERVE_UNITS / 2 = 90`
units on every board, so nothing clips before the panel exists; and when the panel lands the room
per side becomes the granted margin exactly, so nothing clips afterwards and no card has to narrow.
The first reading would grant 90 units less than the layout affords, forever, for no benefit.

### The floor, and why there is one

A granted margin never *reduces* the allowance below the inherited 58.4. On a portrait or
near-square board the expression above goes negative — the panel would take more width than the
board has spare — and a zero allowance leaves a card at three o'clock no room at all: `labelWidthLimit`
returns 0 and the card renders with nothing on it.

The floor is not a hedge; it is what the page already pays for. `Styles.html` grants
`--label-frame: 7.3vmin`, which is `600 × 7.3 / (100 − 2 × 7.3) = 51.29` units on **any** viewport,
against the 50.4 a card may reach — so the inherited allowance is covered by the frame at every
aspect ratio, which is the invariant `dial-frame.test.ts` already holds in both directions. The
narrow-board fallback stays where ADR 0009 left it (#39 item 4): open, and this cannot regress it.

## Phases

1. **Geometry.** `ClockBox` gains an optional `labelAllowance`; `clampLabelPosition` and
   `labelWidthLimit` spend it, floored against the inherited `width × OVERFLOW_RATIO`. New
   `label-margin.ts` carries `PANEL_RESERVE_UNITS` and the pure measurement. Node-tested.
2. **Renderer and host.** `analogClock` takes `labelMargin` (units past the viewBox, matching every
   figure the ADR and the brainstorm quote) and converts it to an allowance by adding `EDGE_MARGIN`;
   a `setLabelMargin` on the handle lets the host re-measure on resize. `main.ts` measures `#dial`
   and the viewport, and `?check=1` reports the resolved margin so the figures above can be
   confirmed on the board rather than on a workstation.
3. **Tests and the visual pass.** `dial-frame.test.ts`'s horizontal bound stops being the page's
   padding and becomes the granted margin; the vertical bound stays the padding, which is the axis
   the frame really governs. Render at 16:9 and 16:10, pinned and unpinned, `#status` hidden.

## What it buys, rendered

The 8 → 13 characters is a *bound* — the guaranteed width at the worst position — and per `CLAUDE.md`
a character budget is not evidence. What the fixture actually shows, swept at every half hour of the
day at 1920×1080 with `#status` hidden, against `main`:

| | |
| --- | --- |
| States where anything changes | **8 of 49** (48 pins plus unpinned) |
| Titles that stop being ellipsized | 3 — at `?now=05:00`, `?now=08:00`, `?now=13:30` |
| States that lose a line of wrapping | 5 — `07:00`, `11:30`, `17:00`, `20:00`, unpinned |
| States that get worse in text | **0** |
| Cards clipped by the viewport, any board | **0** |

The narrowness is not a disappointment, it is the saturation ADR 0009 predicted arriving: above the
knee the *face* binds rather than the frame, so only a card near three or nine o'clock — where the
frame is what was scarce — has anything to gain. Everywhere else a card is already as wide as
`faceClearanceLimit` or its own text allows.

`?now=13:30&freeze=1` is the case worth looking at, and it is the defect #30 was opened on. 🟠 🎂
Reading and Snacks sits at 273.8° — nine o'clock — and its card goes from

```
🎂            (85.6 units, 4 lines)      🎂 Reading and     (159.2 units, 3 lines)
Reading                          →       Snacks
and…                                     1 hr 15
1 hr 15
```

The event's name is *cut* before and reads in full after; "Snacks" existed nowhere on the dial. The
1-hour scale gains the same thing unpinned (one ellipsis removed), and a 4:3 800×600 board — margin
78.4, barely past the knee — gains one too, which is the knee behaving as measured.

## What this makes worse, and why it still ships

**A wider card at the sides reaches further *into* the band, not only further out.** The card is
centred on the locus and grows about its own centre, so its inner edge moves inward as it widens.
Measured on the card the `LONG` title produces at three o'clock, where the allowance binds:

| | card's inner edge | share of the band's depth |
| --- | --- | --- |
| inherited allowance | 249.79 | **55.6%** |
| 16:9's granted margin | 218.26 | **97.1%** |

On the fixture the same thing shows as four states where a card's nearest corner crosses the band's
inner edge (216.08) that did not before — `13:30` moves 254.4 → 217.6, `17:00` 233.5 → 214.0, `20:00`
234.9 → 213.6, `08:00` 207.2 → 204.6. Worth noting that at 25 of the 48 pins `main` is *already* at
about 207, so cards already reach through the band at most times of day; this widens the class rather
than opening it.

At `13:30` the arc the card lands on is **its own** — the 🟠 arc it names — so the information is on
the card rather than lost. That is luck rather than design, and it is exactly what #98 is about.

That is #98, and it is the same cost ADR 0009 measured against #88's inward ellipse — arriving from
the other direction, because widening about a fixed locus and moving the locus inward do the same
thing to the inner edge. **It is worth stating plainly that #30's decision comment claims the
opposite** — that granting the margin "closes #98's side collisions … by construction". That is true
of the *band-clearing locus* ADR 0009 pairs with the margin, and false of the margin on its own: on
the existing circular locus the collisions get worse. The two were run together in one sentence.

It ships anyway, with the numbers recorded on #98:

- The fork is the thing that decides the locus, and #138 cannot be judged until the margin is
  granted. Holding the margin to avoid a regression in #98 holds the decision that fixes #98.
- A covered arc keeps its colour, its position and its ring; a truncated card is the only copy of a
  title that was promoted to a card *because* it did not fit its arc. Eight characters a line is
  the more expensive of the two failures.
- The cost is bounded and guarded rather than latent: a spec pins both figures above at 90° and 270°,
  so the next change to the locus or to a card's width is measured against them instead of discovered
  by rendering.

## One test corrected rather than relaxed

`dial-frame.test.ts` bounded a card's reach by `#display`'s padding on *both* axes, which was right
while both axes were paid for out of the same pot. Horizontally they no longer are, so that file now
bounds the horizontal reach by the granted margin and the vertical reach by the frame — and gains a
direct `vertical` measurement, which it did not have.

Its `atTwelve` proxy was also wrong in a way that only showed under this change, and is fixed rather
than loosened. It read a card's locus back off the *rendered* card's radius, so for a card the
displacement pass had moved (#134) it summed the displacement and the half-height and compared the
total against the frame — a quantity nothing bounds. It now takes the locus from the renderer's own
`LABEL_RADIUS_RATIO`, which is what its docstring always claimed to measure. The 1-hour sweep at the
granted margin failed it by 1.16 units before the fix, from a one-line card 30.5 units tall.

## Out of scope, each still open

| | |
| --- | --- |
| The band-clearing locus and `R(θ)` | the fork (#138), and `gap` is undecided (#117) |
| The merge fallback and the colour swatch | #30 item 2's terminator, #118 |
| Cards over the band's content | #98 — measured here, not fixed |
| The frame's 10% of the dial's height | #121 |
| A card over the status line | #135 |
| The narrow-board collapse | #39 item 4 |
