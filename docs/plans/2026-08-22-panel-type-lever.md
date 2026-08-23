# The panel's type lever — the agenda card's body drops to the arc-title size

**Status:** done — shipped in #190
**Issue:** #174 (the type half only; the width half stays held for #138)
**Docs:** `docs/DESIGN.md` ADR 0009, third amendment item 2 — already written, and this is what
makes it true of the code

## What ships

`PANEL_CARD_FONT_SIZE`: **26 → 21.2576**, the size a lone arc's title renders at.

That is the whole of the change. Everything else in this plan is a figure that moves *because* of it,
and the point of writing them down is that four of them are asserted in tests that will fail by name
— which is what [the owner's decision](https://github.com/BenSeymourODB/clock-face-schedule/issues/174#issuecomment-5378274575)
asks for: *"Each should fail by name and be recomputed, not relaxed."*

## Why 21.2576 and not 21.26

Every document in this repo — the ADR's third amendment, `arc-title-layout.ts`'s own comment, #174's
table — writes the lone arc title size as **21.26**. That is a two-decimal shorthand. The size the
dial actually renders is

```
roundCoord(BAND_HEIGHT × TITLE_FONT_SIZE_RATIO) = roundCoord(75.92 × 0.28) = 21.2576
```

and `roundCoord` keeps four decimals, so 21.2576 is the number, not a rounding of it.

The difference is 0.0024 units — 0.0037 px at 1920×1080, which is nothing anyone can see. It is worth
getting right anyway for one reason: the owner's constraint on #174 is stated as a *never*.

> The event titles should never be rendered with font height greater than that of the fonts visible
> on the non-stacked event arcs in this picture

At 21.26 the panel is 0.0024 units **larger** than the lone arc title, which is the one relationship
the change exists to invert. Setting the constant to the shorthand would be writing down the
description of the thing instead of the thing, and leaving a `>` where a `≤` was asked for.

### A literal, guarded by a test — not the expression

**This reversed under review, and the reason is worth keeping.** The first version wrote the constant
as `roundCoord(LONE_ARC_BAND_HEIGHT * TITLE_FONT_SIZE_RATIO)`, on the reasoning that deriving it makes
the panel follow the ratio instead of drifting from it. That is true and it is not worth what it costs:
a call expression is **unshakeable by esbuild**, so it dragged `TITLE_FONT_SIZE_RATIO` — a pure
dial-geometry ratio — plus `roundCoord` and the band height into the **server** bundle, by way of
`map-event.ts` importing the `shared/clock` barrel. `build/Code.gs` went 13,845 → **14,167 bytes** of
geometry the server has no business carrying, which is precisely what ADR 0003's split exists to
prevent — the same split invoked two paragraphs up to justify restating the band height at all.
`index.ts` already records this trap, from a top-level `new RegExp` that would not tree-shake.

`/* @__PURE__ */` does not help; esbuild still emits it. So the constant is the literal **21.2576**,
and `Code.gs` is byte-identical with base.

**Nothing is lost, because the guard was never the expression.** `agenda-panel.test.ts` drives
`computeArcTitleLayout` over the real lone-arc ring and asserts `PANEL_CARD_FONT_SIZE` equals the
`titleFontSize` it returns — the *rendered* size, so a change to the ratio, the band, the edge margin
or the clearance cap fails there. That is strictly stronger than an expression, which can only stay
consistent with itself. And it is the shape `PANEL_CARD_STROKE` in this same file has always used:
literal `1.7006`, asserted against `cardStrokeWidth(...)`. Treating the two constants differently was
the tell.

### On the band height being restated

`75.92` is `(600/2 − EDGE_MARGIN) × ARC_BAND_RATIO` = `292 × 0.26`, and both constants live in
`src/client/render/analog-clock.ts`, which `src/shared/` may not import — verified rather than assumed:
adding the import fails `tsc -p tsconfig.server.json` with 13 `Cannot find name 'SVGSVGElement' /
'document'` errors, because the server config has no DOM lib.

Calling that *unavoidable* would be too strong, though, and the untaken alternative should be named:
the three numbers involved (`DIAL_VIEWBOX_SIZE`, `EDGE_MARGIN`, `ARC_BAND_RATIO`) are pure viewBox
constants with no host types, and there is precedent for moving them — `PANEL_RESERVE_UNITS = 180`
already lives in `src/shared/`. That is a larger refactor than a font size warrants, and it would
touch the dial's own module, so it is deferred rather than rejected. With the literal it no longer
buys anything here anyway.

## Every figure that moves

Computed at the real constants, `PANEL_WIDTH_UNITS = 180`, `PANEL_CARD_PADDING = {x: 6, y: 3}`,
`SWATCH_RESERVE = 12`, `CHAR_WIDTH_RATIO = 0.6`, `LINE_HEIGHT_RATIO = 1.4`:

| | at 26 | at 21.2576 |
| --- | --- | --- |
| `PANEL_CARD_STROKE` — `cardStrokeWidth(fs)` | 2.08 | **1.7006** |
| usable column, `600 − stroke` | 597.92 | **598.2994** |
| 3-line card height | 115.2 | **95.2819** |
| 2-line card height | 78.8 | **65.5213** |
| characters a line, **before** the swatch | 10 | **13** |
| characters a line, **as it ships** (#160's swatch) | 9 | **12** |
| 3-line cards that fit | 5 | **6** |
| 2-line cards that fit | 7 | **8** |
| `PANEL_CARD_GAP` ceiling, for the count above | 5.48 (for 5) | **5.3216 (for 6)** |
| reading distance, distance/150 at 1.735 mm/unit | 6.77 m | **5.53 m** |

Two of those deserve calling out because they are not in #174's table:

- **The shipped character budget is 12, not 13.** 13 is the pre-swatch figure, which is the pairing
  the ADR quotes throughout (its "10 at 26 units" is also pre-swatch). #160's swatch costs one
  character at both sizes, so the shipped pairing is **9 → 12**. Both belong in the assertion, for
  the reason the existing test gives: so the *reason* the shipped figure is lower stays visible
  rather than the larger number drifting down unremarked.
- **`PANEL_CARD_GAP` stays 5, and stays exactly at its maximum** — but the count it is the maximum
  *for* goes 5 → 6. At 21.2576 the ceiling keeping six tall cards is 5.3216, so 5 fits and 6 does not.
  That is a lucky landing rather than a designed one. The test states it as the two counts
  (`cardCount(3, gap) === 6` and `cardCount(3, gap + 1) < 6`) rather than against a computed ceiling:
  deriving the count *from* the gap and then comparing the gap to that count's ceiling is circular —
  the inequality is the same one twice, so the `gap <= ceiling` half could not fail for any gap at all.

## #169 flips from a constraint to a choice, and is not taken here

`HH:MM–HH:MM` is 11 characters. The shipped budget goes 9 → **12**, so it becomes affordable. The
test that records this is written as a *prompt* rather than a bound:

> If the budget ever reaches eleven, `HH:MM–HH:MM` becomes affordable and this test is the prompt to
> revisit it.

It has now reached twelve. The right response is to invert the assertion — assert the budget affords
it, pointing at #169 — and **not** to change the trailing line in this PR. What the card's trailing
line should say is #169's own question (a duration states a length, a clock time states a boundary;
they are different claims and the panel was justified on the second), and #178 is concurrently
deciding whether durations appear at all. Answering it here would settle by accident a thing two open
issues are deciding on purpose.

## Phases

1. **The constant and its consequences** — `panel-layout.ts`, plus the four assertions that are
   properties of 26, recomputed rather than relaxed. Tests first, so each failure is seen by name.
2. **The cross-boundary assertion** — the rendered-size equality in `agenda-panel.test.ts`, which is
   the guard that did not exist before because there was nothing to tie the panel to.
3. **Render and look** — the pins below at 16:9 and 16:10, `#status` hidden. This is the phase the
   decision comment says the arithmetic cannot stand in for.
4. **Docs** — ADR 0009's third amendment item 2 stops saying "not yet built".

## Verify by rendering

Per the decision comment and `CLAUDE.md`: **the table above is not evidence that the panel reads from
the back of a room.** The type size is the one thing about this change that a screenshot can judge and
a number cannot.

- `?scale=1h&now=04:15&freeze=1` — #173's own argument for the panel: a **three-deep** cluster whose
  titles render at **6.2356** units on the band (5.9821 for the one that wraps) and the panel names all
  three. If the panel at 21.2576 stops being obviously the more readable of the two surfaces, the type
  lever has gone too far and the width lever is the fallback rather than a supplement.
  **Not the four-deep cluster** — that one is on the 12-hour scale, where `?now=04:15` renders its
  titles at 4.3578. Both pins make the point; conflating them is how "the panel names all four" got
  written about a cluster of three.
- `?now=03:00&freeze=1` — **7** panel cards, the fullest column, and the pin #172 measures as the worst
  overlap with the floating labels. This is where the extra card the change buys shows up. (6 at
  `08:30` and at the 1-hour pin; the *pure* three-line capacity is six, but a column of mixed one- and
  two-line titles packs tighter than either pure case, which is why the rendered range is 6–7 and not
  a flat 6.)
- `?now=04:15&freeze=1` — the ordinary case.
- Unpinned, which is what a board renders.

At 16:9 **and** 16:10, `#status` hidden per `CLAUDE.md`.

## Deliberately not here

| | why not |
| --- | --- |
| **The width lever** (panel → up to 270.7) | Held for #138 by the same decision comment. #177 wants the same units and how far a card may grow is #138's fork; deciding the panel's width first is the "settle it once, not three times" mistake ADR 0009 exists to prevent. |
| **#169** — clock times on a card | Becomes affordable here, which is not the same as being decided. See above. |
| **#144** — a smaller face for the duration line | A second, independent type decision on the trailing line. Unaffected by this: it is a ratio against whatever the body size is. |
| **#174's own closure** | The issue carries both levers. This PR closes the type half; the issue stays open for the width half, so it is referenced rather than closed. |
