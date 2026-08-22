# The agenda panel's column, and the width it takes

**Status:** done — shipped in [#173](https://github.com/BenSeymourODB/clock-face-schedule/pull/173)
**Issue:** [#39](https://github.com/BenSeymourODB/clock-face-schedule/issues/39) — "Panel layout, and allocating the board's spare width"
**Docs:** ADR 0009 (the allocation this spends), `docs/brainstorms/2026-08-17-agenda-panel.md` (what
the panel is for), #30 item 1 / `docs/plans/2026-08-21-label-margin-hand-off.md` (the 180 units
already reserved out of the labels' margin), #70 (the legibility defect the panel is the answer to),
#37 (the whole-day fetch this consumes), #38 (the shared card), #40 / #41 (the playhead and the
modes, which this deliberately does not build)

## Why this is buildable now, given the body says otherwise

#39's body opens *"Not ready — this is the allocation decision"*. That has been false since ADR 0009
was accepted, and the issue's own
[readiness correction](https://github.com/BenSeymourODB/clock-face-schedule/issues/39#issuecomment-5372345196)
says so: items 1–3 are decided (**180 units, on the right, dial centred in the remainder**) and item
4 — the narrow-display collapse — is *"a fallback rather than a gate"*.

Two things were already built against the decision and are waiting for the column to exist:

- `PANEL_RESERVE_UNITS = 180` in `label-margin.ts` already subtracts the panel from the labels'
  margin, so the allowance the renderer is handed today is the one the *finished* layout gives. The
  labels do not change when the panel lands — that was the point of reserving rather than granting.
- `event-card.ts`'s header says it is factored out for "a floating label and (once #39's panel layout
  lands) an agenda card", and `eventCardNodes` takes an `idPrefix` for exactly that.

So this change adds a column and fills it. It does not move a single unit of anything already drawn,
and that is a property worth asserting rather than hoping for.

## The column, and why CSS can size it without being told a number

`Styles.html` records the trap:

> ADR 0009's 180-unit panel (#36) is deliberately *not* reserved here by a width expression. The
> panel's pixels are a share of the dial (180 against 600) while the dial is sized from the height,
> so any reserve taken out of this box either mis-centres the drawing inside it or has to know a
> number CSS cannot see. #39 adds the panel as a second grid column instead.

A second grid column with `width: auto` has the same circularity — grid resolves columns before
rows, so a panel sized from the row's height cannot contribute a column width. **Flex resolves it in
the order that works.** A flex row stretches its items to the container's definite height first, so
the panel's height is definite before its width is asked for, and `aspect-ratio: 180 / 600` then
makes the width definite too:

```
#board  →  display: flex        (the grid's first row, definite on both axes)
#dial   →  flex: 1 1 0; min-width: 0        the remainder (an `auto` basis would be #115)
#panel  →  flex: 0 0 auto; height: 100%; aspect-ratio: 180 / 600
```

`0.3 × row height` **is** 180 dial units whenever the dial is bound by the board's height, which is
every 16:9 and 16:10 board — ADR 0009's whole premise. No JS reads a size to set another size, and
the ratio in the stylesheet is the ADR's two numbers written down rather than a derived constant.

`#dial` keeps `width: 100%; height: 100%` semantics via the flex line, so `#dial`'s box stays "the
remainder", the drawing still fits its shorter axis, and *being centred in the remainder is the same
sentence as the ADR's* — which is what `Styles.html` predicted.

### What the margin measurement does, and the one thing that did have to change

The *scale* is untouched, and that is what keeps the dial's own size out of this: `measureLabelMargin`
reads `#dial`'s box, and with the panel in place that box loses width but keeps its height, so
`drawn = min(width, height)` is the height either way on a landscape board. The dial renders at the
same 1.5372 px per unit with the panel as without it — measured, not assumed.

What did change is the **divisor**, and it had to: dividing the viewport grants the labels the page's
frame as well as the room beside the dial, and on the panel side the frame is the panel. See the
section below, which is where rendering found it.

## Item 4, the narrow display: the minimum that is not a decision

As the board approaches square, `board.width − 0.3 × board.height < board.height` and the dial stops
being height-bound: it starts paying for the panel, which is the one thing ADR 0009 forbids. At
1000×1000 the panel would take 256 px and shrink the dial 30%.

ADR 0009 names two answers — *"the panel has to collapse or stack"* — and picking between them is
item 4. This plan picks **neither**, and instead builds the guard that both answers need anyway:

> **The panel is drawn only where the board can afford it**, and *afford* has two terms: the dial
> keeps its full height, **and** the room left beside the dial covers a floating label's reach.

### The second term was found by rendering — twice, and the first correction was also wrong

The dial-size condition on its own is `board.width ≥ board.height × (600 + 180) / 600` — an aspect
ratio of **1.3**. Built and looked at, that is wrong, and the whole suite was green through it:

| board | content aspect | room beside the dial | measured |
| --- | --- | --- | --- |
| 16:9 | 1.911 | 183.2 | clean |
| 16:10 | 1.703 | 120.8 | clean |
| **1330×1000** | **1.386** | **25.9** | **`⚫ Assembly`'s card crossed into the column by 5.9 px** |
| **4:3 (1024×768)** | **1.390** | **27.1** | same shape — a plausible classroom projector |

The first fix required the room beside the dial to cover `--label-frame`, 51.29 units. **That was the
wrong currency, and the review caught it:** the frame is the *vertical* allowance — a four-line card
on the label locus — and the panel is on the horizontal axis, where a card reaches much further. On
the 1-hour dial the worst is **138.7 units**, so at **16:10, one of ADR 0009's two target boards**,
`?scale=1h&now=07:17&freeze=1` put a card **30.7 px** inside the column with the frame test passing.

### What actually bounds a card, and why the collision is now structural

`analog-clock.ts` sets `labelAllowance = grantedMargin + EDGE_MARGIN`, so **a card's permitted reach
past the viewBox *is* the margin the host grants**. And the host was granting more room than exists:
`labelMarginUnits` divides the **viewport**, while the room beside the dial is the viewport less the
page's frame — and on the panel side that frame *is* the panel. The grant therefore over-stated the
panel side by exactly one frame width on every board, which is why the number to compare against kept
being wrong.

So `measureLabelMargin` now measures the **row** rather than the viewport while the panel is up. A
card cannot reach the column because it is never granted permission to:

| | grant before | grant now = room |
| --- | --- | --- |
| 16:9 | 234.5 | **183.2** |
| 16:10 | 172.1 | **120.8** |

**It costs nothing.** ADR 0009's guaranteed card width saturates at 155.2 units — 13 characters a
line — for any margin at or above **75.4**, and both figures are far above it.

That knee is then what the threshold is for, and it is about *cost* rather than collisions: below it
the panel and the labels trade width one-for-one, which is the trade ADR 0009 says its 180 units must
not make. `(600 + 180 + 150.8) / 600` = **1.5513**, which 16:9 (1.911) and 16:10 (1.703) both clear.

Swept 144 pins per board across both scales after the fix: **zero intrusion on 16:9 and 16:10**,
panel absent at 1410×1000, 1330×1000, 4:3 and square. The residual this plan previously priced —
a card reaching into the column just above the threshold — is closed rather than deferred.

### One consequence worth knowing

The panel's presence depends on the row's height, so **the status line showing makes a narrow board
afford the panel**: the notice takes height, the dial shrinks, and 180 units becomes fewer pixels. On
4:3 in demo mode the panel appears; with `#status` hidden — what a healthy board shows, and what
`CLAUDE.md` says to judge size on — it does not. Swept both ways and the intrusion is zero either
way, because the grant follows the row. It is the same mechanism that already makes the label margin
depend on the notice, which is why the resize observer exists.

## What goes in the column

ADR 0009's justification for 180 units is #70's: a three-deep cluster's arc titles render at 6.24
units — 7.0 mm on a 4 ft board, legible to about 1.1 m — and *"the panel is the only surface in the
design that can carry an event's name legibly from 8 m"*. So the panel has to carry **names**, at 26
units, and it has to be looked at.

Card geometry, and it reproduces both of ADR 0009's card counts exactly, which is the check that
these are the constants the ADR was written against:

| | units |
| --- | --- |
| font size | 26 (ADR 0009) |
| usable column height, `600 − PANEL_CARD_STROKE` | 597.92 |
| `labelCardHeight(3, 26, 3)` | 115.2 |
| five three-line cards + four 5-unit gaps | **576 + 20 = 596** |
| `labelCardHeight(2, 26, 3)` | 78.8 |
| seven two-line cards + six gaps | 551.6 + 30 = 581.6 |
| eight | 630.4 + 35 = 665.4 — does not fit |

The gap is 5 rather than 6 because a card's border is centred on its edge and an outermost `<svg>`
clips it: a card flush with the column had its left and right borders painted at **half** the weight
of its horizontals, 1.6 px of stroke gone at 1920×1080. Every attribute was correct, so only looking
found it. Insetting the cards by half a stroke costs 2.08 units of column, and 5 is the largest whole
gap that still keeps ADR 0009's five — 5.48 is the ceiling, and 6 holds only four.

> **"The panel holds five cards at 26 units over three lines, seven at two lines."** — ADR 0009

A card is a wrapped title over **at most two lines**, plus one trailing line, so a three-line card is
the tall case and the ADR's five is the count. Cards are laid top-down and drawn while they fit;
`fitLabelToWidth` and `eventCardNodes` do the text and the paint, so the panel adds no second way to
draw a card (#38's whole point).

### The trailing line states a duration, not a clock time — measured, and deferred

The brainstorm wants *"its start and end times underneath"*, and that is the panel's strongest claim
against the dial: *"the dial never states a time"*. It does not fit at 26 units in 180, and the
arithmetic is worth recording so nobody re-derives it:

| padding.x | text budget | `HH:MM–HH:MM` needs |
| --- | --- | --- |
| 6 (the shared card's) | `⌊168 / 15.6⌋` = **10 ch** | **11** |
| 5 | ⌊170 / 15.6⌋ = 10 ch | 11 |
| **4** | ⌊172 / 15.6⌋ = **11 ch** | 11 — fits with **zero** slack |
| 3 | ⌊174 / 15.6⌋ = 11 ch | 11 |

Eleven characters against a budget of eleven is not a margin, and it only holds for a 24-hour
rendering: `9:00 AM–9:45 AM` is fifteen. Committing the panel to 24-hour clock times in a primary
classroom whose dial is a 12-hour face is a decision, not an implementation detail.

So this slice uses `formatEventDuration` — the same trailing line the floating-label card already
carries, six characters or so, always inside the budget, and no new decision. **The times line is
filed as follow-up work** with the table above, since it is the panel's own justification and must
not be dropped silently.

### Which events, and in what order

`ends after now`, ascending by start, take what fits. Deliberately **not** day-scoped: "the whole
day" versus "a scrolling window" is #41's two modes, and day-scoping would empty the panel near
midnight and in demo mode, where the fixture is anchored to the rolling window rather than to a
calendar day. "What is running and what is next" is the minimum that is honest on both.

All-day events still have nowhere to go. #37 said the panel is that place and closed without it,
because the panel did not exist; the fixture has **no all-day event**, so it cannot be looked at
either. Deferred with an issue, and adding the fixture case is part of that work.

## Phases

1. **Shared geometry.** `src/shared/clock/panel-layout.ts` — `panelFitsBoard`, `planAgendaCards`.
   Pure, node-tested, compiles under both tsconfigs.
2. **The column and the renderer.** `Styles.html`, `Index.html`, `src/client/render/agenda-panel.ts`,
   wired in `main.ts` beside the dial from the same event set and the same clock read (#152 — one
   `now()` on the load path). jsdom specs on rendered attribute names.
3. **The guards, and the look.** A spec reading `#panel`'s `aspect-ratio` out of `Styles.html` against
   `PANEL_RESERVE_UNITS`, the way `dial-frame.test.ts` reads the frame, so the column and the reserve
   cannot drift apart; a spec asserting the dial's own drawn size and label margin are byte-identical
   with the panel present. Then build, screenshot, and look — at the panel and at what is now next to
   it, which is a floating label at 3 o'clock.

## What this does not build, so the epic's shape stays legible

- **#40, the playhead** — needs a card set that does not change under it.
- **#41, the two modes** — this ships neither; "running and next, clipped" is the placeholder they
  replace.
- **Clock times on a card** — #169, with the eleven-against-ten table above.
- **All-day events** — #170, which carries #37's remainder and the fixture case it needs.
- **Item 4's designed collapse, and the residual** — #171. Absent is not collapsed.

## One finding that came out of building it — #172

Swept 96 pins, both scales: **66 of 251 floating labels drawn (26.3%) are also named in the panel**,
worst case three of five on one dial at `?now=03:00`. Every existing proposal for #98 and #135 pays
for relief with content — drop the card's duration, narrow its title, displace it — and suppressing a
card whose event the panel already names at 26 units costs nothing, because the information is
already rendered larger a few hundred units to the right.

Filed rather than built: a card points at its arc and the panel does not, which #117 blunts (the
connector draws no visible pixel, so the anchor is proximity alone) without settling.
