**Status:** in progress

**Issue:** [#38 — A shared event-card component for labels and agenda cards](https://github.com/BenSeymourODB/clock-face-schedule/issues/38)

**Docs:** [docs/brainstorms/2026-08-17-agenda-panel.md](../brainstorms/2026-08-17-agenda-panel.md) §"What it must keep" #5;
[docs/DESIGN.md](../DESIGN.md) ADR 0004

## What #38 actually asks for

Factor the card's *appearance* — the part `floating-label.ts` already draws — into one shared
place, so a future agenda card (#39–#41, not yet ready to build) consumes the same styling instead
of restyling by eye and re-triggering #15's "colour decision made twice" failure.

Explicitly **not** shared, per the issue: layout. A floating label is clamped to a locus and
carries a connector; an agenda card stacks in a column and carries start/end times. Neither
belongs in the shared piece.

**Scope for this slice:** extract the shared styling out of `floating-label.ts` into a new
`src/client/render/event-card.ts`, with `floating-label.ts` as its one current consumer. No agenda
card is built here — #39 (panel layout) and #40/#41 (playhead, modes) are explicitly "not ready to
build" per the unblock pass, so there is nothing yet for a second consumer to lay out. Building one
speculatively would be exactly the "half-finished implementation" CLAUDE.md warns against. What
this slice buys is that when an agenda card *does* get built, it draws from `event-card.ts` rather
than re-deriving wash opacity, border strength, radius and padding by eye.

## What moves into `event-card.ts`

From `floating-label.ts`'s current constants and the three-stacked-rects block:

- `RECT_PADDING_X` / `RECT_PADDING_Y` — padding, listed as shared style in #38.
- `RECT_CORNER_RADIUS`
- `RECT_BORDER_OPACITY`
- `WASH_OPACITY` (with its existing contrast-headroom comment — the 20%/10.9:1 measurement in
  `contrast.test.ts` stays valid; it is not being recomputed here)
- `STROKE_RATIO` / `STROKE_MIN`, behind a `cardStrokeWidth(fontSize)` helper — the floating label's
  connector also uses this ratio today, so the helper is shared with the layout-specific caller
  rather than duplicated.
- The three-rect-plus-text block itself, as `eventCardNodes(params)`: builds the base
  (`var(--card-foreground)`) rect, the colour wash rect, the border rect (in that paint order —
  wash under border, per the existing test), and one `<text>` per line in `var(--card)`. Takes
  already-computed geometry (`x, y, width, height`) and `lines` — it does not fit text or clamp
  position; that is layout, and stays in the caller.

Test-id shape is generalised from the hard-coded `floating-label-*-e1` strings to
`${idPrefix}-{rect,wash,border,text}-{id}[-{lineIndex}]`, with `floating-label.ts` passing
`idPrefix: "floating-label"` — so every existing test id, and therefore every existing
`floating-label.test.ts` assertion, is unchanged.

## What stays in `floating-label.ts`

- `polarToCartesian`/clamp/fit-to-width geometry (unchanged) that decides `x, y, width, height,
  lines`.
- The connector `<line>` (uses `cardStrokeWidth` from the new module for its width, but the line
  itself is layout, not style — an agenda card has no connector).
- Assembling the returned group.

## Phases

1. **Extract `event-card.ts`** with `eventCardNodes` + `cardStrokeWidth` + the moved constants, and
   its own unit tests (jsdom, mirroring the "the card" describe-block currently in
   `floating-label.test.ts`: geometry sharing, paint order, wash/border opacity, base/text tokens,
   stroke-width floor and ratio).
2. **Refactor `floating-label.ts`** to call it. `floating-label.test.ts` should pass unmodified —
   that is the regression check that the extraction changed nothing observable.
3. **Visual pass**: `npm run build`, serve `build/preview.html`, screenshot, confirm the fixture's
   floating labels (the overflowing title, the two-line emoji title) render identically to before
   the refactor.

## Deferred (needs its own issue, not built here)

Actually building an agenda card is blocked on #39 (panel layout — "not ready, three unresolved
claimants on the same layout budget") and #40/#41 (playhead/modes — both explicitly "not ready").
Tracked there already; no new issue needed.
