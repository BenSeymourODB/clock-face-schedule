# Fit a two-line title inside what the arc's own outline leaves

**Status:** in review
**Issue:** [#67 — A two-line title on a stacked ring sits on the elapsed arc's own
outline](https://github.com/BenSeymourODB/clock-face-schedule/issues/67)
**Docs:** #26 (band-sized elapsed outline), #27 (halo retired), #35 (`fitDurationLine`'s radial
gate), #70 (stacked-ring titles are too small — *not* this change), `docs/DESIGN.md` (ADR 0003)

## What this is for

An elapsed arc's outline is sized from the **whole band**, deliberately: sizing it from the ring
handed the most crowded arcs the faintest outline, the exact inversion #26 exists to prevent. Arc
text is sized from **this arc's ring**, equally deliberately, so a thin ring gets small text rather
than text overflowing it. Those two rules are each right and they disagree once a ring is thin: the
text's radii and the stroke's reach are derived from different quantities and nothing checks them
against each other.

## Measured, against the outline actually drawn today

#67's table is computed with `0.12 × band / 2` — #26's neutral halo, which #27 retired. Against
today's outline (`ELAPSED_BORDER_RATIO = 0.07` of the band, capped at `ELAPSED_STROKE_MAX_RATIO =
0.4` of the ring) the clearance from the outward line's glyph edge to the stroke's inner edge is:

| Cluster depth | Ring | Title font | size 600 | size 300 | size 900 |
| --- | --- | --- | --- | --- | --- |
| 1 | 75.92 | 21.26 | 12.98 | 6.31 | 19.65 |
| 2 | 35.68 | 9.99 | 4.70 | 2.28 | 7.11 |
| 3 | 22.27 | 6.24 | **1.93** | **0.94** | 2.92 |
| 4 | 15.56 | 4.36 | **0.55** | **0.27** | **0.83** |

```bash
node -e 'for (const size of [600,300,900]) { const O=size/2-8,B=O*0.26,G=Math.max(2,B*0.06);
  for (let d=1;d<=4;d++){ const g=d>1?G:0,r=(B-(d-1)*g)/d,f=Math.round(r*0.28*100)/100,
  s=Math.max(1,Math.min(B*0.07,r*0.4)); console.log(size,d,(r/2-s/2-f*1.05).toFixed(2)) } }'
```

So **nothing overlaps at any depth right now**, and this change moves no pixel on today's fixture at
size 600 above four deep. What is wrong is narrower and worth fixing anyway:

- Four deep leaves 0.55 units, inside the 1-unit `EDGE_CLEARANCE` #35 codified as the smallest
  separation that still reads as two marks rather than one. Three deep breaches it at size 300.
- That it clears at all is **incidental**. One commit before #27 the same geometry measured −1.35,
  and the only reason it now passes is a constant change made for an unrelated reason. Nothing in
  the code ties the text's radii to the stroke beside them, and nothing in the suite would notice:
  `arc-title-layout.test.ts` asserts the offset ratio, not the clearance.

## Chosen direction

**The stack yields, not the outline** — #67's option 2, generalised.

`computeArcTitleLayout` takes the width of the widest stroke the caller draws on the ring's edges
(the same parameter `fitDurationLine` already takes, for the same reason) and caps the font size at
what the remaining radial room can hold:

```
usableHalf = ringThickness / 2 − (edgeStrokeWidth / 2 + EDGE_CLEARANCE)
stackHalf(f) = f × (TITLE_LINE_OFFSET_RATIO + 0.5)      // two lines
titleFontSize = min(ringThickness × TITLE_FONT_SIZE_RATIO, usableHalf / (TITLE_LINE_OFFSET_RATIO + 0.5))
lineOffset = titleFontSize × TITLE_LINE_OFFSET_RATIO
```

Font and offset shrink together, so the authored 0.55 relationship — and the hair of clearance
between the two curved baselines it buys — is preserved. `lineOffset` becomes part of
`ArcTitleLayout` so the renderer uses the layout's offset rather than re-deriving it, which is how
the two could drift apart again.

### Why this is not the 18-unit ceiling #35 removed

`TITLE_FONT_SIZE_RATIO` is documented as deliberately uncapped, and it stays that way in the sense
that mattered: the ceiling that was removed was **absolute**, so widening the band bought a thicker
arc carrying the same small text. This cap is derived from the ring's own room, and it scales with
the band exactly as the ratio does — a wider band raises the cap and the ratio together. It binds
only where the stroke genuinely takes the space, i.e. four deep on a 600-unit dial, three deep on a
small one.

### Rejected

- **Tighten `ELAPSED_STROKE_MAX_RATIO` so the ring always leaves the text room** (#67's option 1).
  Ruled out by a recorded decision: the required cap is ≈ `0.41 × ring − 2`, which clamps the
  outline on the deepest rings, and `ELAPSED_BORDER_RATIO`'s comment records the 0.12 widening being
  reverted for precisely that inversion. The outline *is* the arc once the fill is gone; the title
  has a floating label and an accessible name to fall back on.
- **Inset the line offset alone, leaving the font at the ring's ratio.** Measured ceiling: the offset
  can fall from 0.55 to 0.5 before the two glyph bands abut, which buys 4.8% of stack height — 0.31
  units three deep. Four deep needs 4.58 units of half-height in 4.13, so inset-only cannot fit it,
  and it spends the inter-line hair to get nowhere.
- **Drop the second line below some thickness** (#67's option 3). Dropping words from an event's name
  is worse than small text, which is #70's subject and not this one's.

### Known interaction, deliberately accepted

A smaller font is a *larger* character budget, so a title that today overflows to a floating label
could instead pack onto two very small lines. This is pre-existing — the font is ring-derived, so
every stacked ring already trades size for budget — and the cap only binds where it moves the font
by 10%. Cluster-ring titles being too small to read at all is #70, which weighs routing them off the
band entirely; nothing here forecloses that.

## Phases

1. **Shared geometry.** `computeArcTitleLayout` gains `edgeStrokeWidth` and returns `lineOffset`;
   unit tests for the clearance property across depths, dial sizes, and a deliberately fat stroke
   (#26's halo geometry) where today's numbers do not bind.
2. **Renderers.** `event-arc.ts` exports the elapsed-outline width so the dial and the standalone
   path derive it once, uses `layout.lineOffset`, and passes the stroke into its own recompute;
   `analog-clock.ts` passes it per ring. jsdom assertions on the rendered text-path radii against
   the rendered `stroke-width`.
3. **Fixture and visual pass.** The fixture's only two-line titles are on lone arcs, so a two-line
   title on a stacked ring is a stress case it does not carry — give one cluster member a title that
   wraps. Screenshot, and measure the rendered radii off the DOM.

## Verification

- The property test is the one that was missing: for every cluster depth and a range of dial sizes,
  both lines' glyph edges clear the drawn stroke by at least `EDGE_CLEARANCE`.
- Rendered check: `event-arc-outline-*`'s `stroke-width` against the `d` of `text-path-*-0/1`, on a
  four-deep ring — the case that today measures 0.55.
