# `?panel=0` — a preview parameter that leaves the agenda column off

**Status:** done — shipped in #213
**Issue:** #185
**Docs:** README's parameter table gains a `?panel=0` row and the panel-off figures; no ADR moves —
ADR 0009's allocation is unchanged and #39 item 4's fallback is still undesigned

## What ships

A URL parameter that suppresses the agenda column, so the panel-less board can be screenshotted the
way `?now=` and `&freeze=1` already make time-dependent states screenshottable. Five small pieces:

| where | what |
| --- | --- |
| `src/shared/clock/panel-layout.ts` | `panelAllowed(layers)` — the layered parse, pure and node-testable |
| `src/server/main.ts` | `template["panelParam"]`, passed through as authored |
| `static/Index.html` | `data-panel="<?= panelParam ?>"` on the mount |
| `src/client/main.ts` | one `&&` term in `showPanel` |
| `README.md` | the parameter row, and the panel-off figures |

No geometry changes. No preference is written or read. The layout branch it exposes already exists —
`#panel[hidden] { display: none }` on a flex row — so this is a flag in front of a code path that has
shipped since #39, not a new one.

## The measurement, and it reverses the issue's premise

The issue asks for a real layout branch rather than `display: none` on the grounds that **"the point
of the render is that the dial *grows* to fill the width"**. Rendered at both of ADR 0009's target
boards, `#status` hidden, it does not:

| 1920×1080 | panel on | panel off |
| --- | --- | --- |
| dial **drawing** | 833.8 px | **833.8 px — unchanged** |
| dial *box* | 1512.2 px | 1762.3 px |
| panel column | 250.1 px (180.0 units) | absent |
| labels' margin | 244.1 u/side | **300.8 u/side** |

| 1920×1200 | panel on | panel off |
| --- | --- | --- |
| dial **drawing** | 926.4 px | **926.4 px — unchanged** |
| dial *box* | 1466.9 px | 1744.8 px |
| panel column | 277.9 px (180.0 units) | absent |
| labels' margin | 175.0 u/side | **231.7 u/side** |

**The dial is bound by the board's *height* on both boards, so returning width to it buys nothing.**
`#dial svg` is `preserveAspectRatio: xMidYMid meet` over a square viewBox, so the drawing fits the
shorter axis — which is the height, and the height did not move. What the extra 250 px of box does is
re-centre the drawing: it shifts right by `(1762.3 − 1512.2) / 2` = **125 px** at 16:9. That is the
whole of the visible change to the dial, and it is a translation rather than a growth.

The 300.8 figure is worth stating separately, because `CLAUDE.md` already quotes it — *"the labels'
margin 234.5 → 300.8 units a side"* — as the figure ADR 0008's bar hands back. It is reproduced here
from the *panel-off* path, which is a cross-check that this plan's arithmetic is `labelMarginUnits`'
own rather than a re-derivation of it.

### Where the vacated 180 units actually go, which is not where it looks

The labels gain **56.7 units a side** on both boards — identically, which is the clue. It is not the
column's 180 halved (that would be 90):

- `labelMarginUnits` subtracts `PANEL_RESERVE_UNITS` **unconditionally**, panel drawn or not. So the
  reserve costs the labels 90 units a side in *both* columns of the tables above.
- What changes instead is which width `measureLabelMargin` divides: the **row** while the column is
  up, the **viewport** once it is down. The difference between them is `--label-frame`, 2 × 78.8 px
  at 16:9 → 113.4 units of board → **56.7 a side**.

So with the column gone the labels are granted 300.8 units against **390.8** of real slack a side,
and the 90 a side in between stays held for a column that is not there. That is #171's finding
("the labels' grant counts the frame the panel occupies") arriving from the other direction, and it
is **deliberately not fixed here**: making the reserve conditional changes what every narrow board
draws, which is #171's change to make and #39 item 4's fallback to design around.

### The label set does not move either, which was the other thing worth checking

#172 drops a floating label whose event the panel already names *and* whose natural rect collides
with band content, and `panelNames()` is gated on the column being visible — so `?panel=0` ought to
bring any suppressed card back. Measured across five pins on both boards:

| `?now=` | 03:00 | 04:15 | 08:30 | 11:00 | 01:30 |
| --- | --- | --- | --- | --- | --- |
| panel on | 5 | 4 | 3 | 5 | 4 |
| `?panel=0` | 5 | 4 | 3 | 5 | 4 |

**Identical, by id, at every pin.** So nothing in the fixture is currently suppressed at any of these
pins: #172's rule needs a *collision* as well as a panel name, and no card here has both. (The counts
also independently reproduce README's own table — five at 03:00, four at 04:15, three at 08:30 —
which is the cross-check that the selector is counting cards rather than their descendants.)

Card widths do not move either, and that follows from the margin figures rather than needing its own
sweep: ADR 0009's guaranteed card width saturates at 13 characters a line for any margin at or above
75.4, and both 244.1 and 300.8 are far above it.

So the complete difference between a panel-on and a panel-off board, at both target aspects, is: the
column's own information, and 125 px of dial position. Nothing else on the dial changes at all.

This is the answer to the question #179 left open — *"What the dial does with the returned 180 units
is the other half of whether a panel toggle is worth having"*. Measured: **the dial does nothing with
it, and neither do the labels.** A panel toggle on a 16:9 or 16:10 board buys a re-centred dial of
exactly the same size, plus 56.7 units of label margin that come from the frame rather than from the
column and that no card spends.

It also refutes the brainstorm's own reason for calling the panel toggle the safer of the two to ship
without a visible control — *"its absence is self-announcing: the dial grows to fill the width"*. The
dial does not grow. The **conclusion** survives, because a 250 px column of cards vanishing is more
self-announcing than a growth would have been, so the correction is to the reason and is recorded in
the brainstorm rather than swapped in silently.

## Shape of the parameter

Follows `?durations=` rather than `?freeze=`, because it is a *layered* read: the templated attribute
first (what `doGet` saw), then the page's own query string (the preview, which has no server). The
alphabet is `1` / `0` for the same reason `?durations=` uses it.

```
?panel=0   the column is left off
?panel=1   the column is drawn where the board can carry it — i.e. the default
(anything)  ignored; falls through to the next layer, then to the measurement
```

**`1` is deliberately not a force-on**, and this is the one decision in the change. Forcing a column
onto a board `panelFitsBoard` rejects would either take height from the dial — ADR 0009's one
absolute — or push the labels below the 75.4-unit knee where the two trade width one-for-one, which
is the trade the ADR says its 180 units must not make. The parameter can therefore only *subtract* a
surface, never add one the board cannot afford: it produces a picture that is reachable by a real
board rather than a synthetic one. Seeing a too-narrow board is done by making the window
too narrow, which needs no flag.

**No status notice**, unlike `?now=` and `?demo=1`, and the reason is not symmetry but arithmetic. A
notice is a grid row and costs the dial a row of height (#115) — the preview draws 719.3 px against a
healthy board's 833.8. This parameter exists to produce the panel-off board's *measurements*, so a
notice would contaminate the only thing it is for. It also has nothing to announce: a panel-less board
is what #171 measures happening on its own as a board approaches square, with no notice then either,
so a notice here would make the flag's picture differ from the board it is standing in for. The
parameter is tooling, and the dial it draws is truthful — no invented events, no clock that is not
the clock.

## Tests

- `panel-layout.test.ts` — `panelAllowed` as an `it.each` truth table: `"0"` off, `"1"` on, absent
  on, empty-string-skipped (the stripped-attribute case), unrecognised skipped, and first-recognised-
  layer-wins.
- `index-template.test.ts` — the four assertions `data-durations` already carries: templated onto the
  mount, emitted outside every guard, stripping to `""`, and escaped rather than raw. The
  stripped-to-`""` one matters most: a preview reading a stripped value as `"0"` would draw **every**
  preview with no column.
- `main-load-order.test.ts` — a source-shape guard that `showPanel` consults the override, alongside
  the existing "gates the suppression source on the panel host being visible". Same justification:
  the rule is one `&&` term away from silently inverting, and `main.ts` has no seam to drive
  (#156).

## Deferred

- **The unconditional `PANEL_RESERVE_UNITS`** — 90 units a side held for an absent column. #171.
- **What a too-narrow board should draw instead of nothing.** #39 item 4 / ADR 0009. This parameter
  is the picture that work needs, not the work.
- **A teacher-facing panel toggle.** #214. This writes no preference and has no control surface.
  #178 is where the question was raised and it **closed** carrying only the durations boolean, so the
  toggle had no open home until #214 — the same failure mode #180 is open about. #214 carries this
  plan's measurement, since it is what re-prices the decision.
