# The agenda panel's column, and the width it takes

**Status:** in progress — the panel column and its cards, outstanding as [#39](https://github.com/BenSeymourODB/clock-face-schedule/issues/39)
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
#dial   →  flex: 1 1 auto; min-width: 0     the remainder
#panel  →  flex: 0 0 auto; height: 100%; aspect-ratio: 180 / 600
```

`0.3 × row height` **is** 180 dial units whenever the dial is bound by the board's height, which is
every 16:9 and 16:10 board — ADR 0009's whole premise. No JS reads a size to set another size, and
the ratio in the stylesheet is the ADR's two numbers written down rather than a derived constant.

`#dial` keeps `width: 100%; height: 100%` semantics via the flex line, so `#dial`'s box stays "the
remainder", the drawing still fits its shorter axis, and *being centred in the remainder is the same
sentence as the ADR's* — which is what `Styles.html` predicted.

### What the margin measurement does, and why it needs no change

`measureLabelMargin` reads `#dial`'s box and `labelMarginUnits` divides the **viewport**, not the
box. With the panel in place `#dial`'s box loses width but keeps its height, and on a landscape board
`drawn = min(width, height)` is the height either way — so `boardUnits` is unchanged and the margin
returned is unchanged. Nothing to retune, which is the reserve doing its job. Asserted rather than
assumed.

## Item 4, the narrow display: the minimum that is not a decision

As the board approaches square, `board.width − 0.3 × board.height < board.height` and the dial stops
being height-bound: it starts paying for the panel, which is the one thing ADR 0009 forbids. At
1000×1000 the panel would take 256 px and shrink the dial 30%.

ADR 0009 names two answers — *"the panel has to collapse or stack"* — and picking between them is
item 4. This plan picks **neither**, and instead builds the guard that both answers need anyway:

> **The panel is drawn only where the board can afford it with the dial at full height**, i.e. when
> `board.width ≥ board.height × (600 + 180) / 600`. Below that the panel is absent and the dial keeps
> the whole remainder — exactly today's layout, so a narrow board regresses in nothing.

That is a pure function of two measured lengths (`panelFitsBoard`, in `src/shared/`, node-testable,
ADR 0003-safe) and the client sets one attribute from it in the `ResizeObserver` it already runs for
the label margin. It makes no claim about what a narrow board *should* show, which is what item 4 is
about and what the follow-up issue carries.

**There is no feedback loop, and that is the reason the test reads `#board` and not `#dial`.** The
condition is measured on the container, whose box does not depend on whether the panel is in it.
Measuring `#dial` instead would flap: hiding the panel widens the dial, which would re-satisfy the
test, which would show the panel, which would narrow the dial.

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
| `labelCardHeight(3, 26, 3)` | 115.2 |
| five three-line cards + four 6-unit gaps | **576 + 24 = 600** |
| `labelCardHeight(2, 26, 3)` | 78.8 |
| seven two-line cards + six 6-unit gaps | 551.6 + 36 = 587.6 ≤ 600 |
| eight | 630.4 + 42 = 672.4 — does not fit |

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
- **Clock times on a card**, per the measurement above.
- **All-day events**, per #37.
- **Item 4's designed collapse** — absent is not collapsed.
