# Fit a two-line title inside what the arc's own outline leaves

**Status:** done — shipped in [#77](https://github.com/BenSeymourODB/clock-face-schedule/pull/77)
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
| 2 | 35.68 | 9.99 | 4.69 | 2.28 | 7.11 |
| 3 | 22.27 | 6.24 | **1.93** | **0.94** | 2.92 |
| 4 | 15.56 | 4.36 | **0.55** | **0.27** | **0.83** |

```bash
node -e 'for (const size of [600,300,900]) { const O=size/2-8,B=O*0.26,G=Math.max(2,B*0.06);
  for (let d=1;d<=4;d++){ const g=d>1?G:0,r=(B-(d-1)*g)/d,f=Math.round(r*0.28*100)/100,
  s=Math.max(1,Math.min(B*0.07,r*0.4)); console.log(size,d,(r/2-s/2-f*1.05).toFixed(2)) } }'
```

So **nothing overlaps at any depth right now**. What is wrong is narrower, and worth fixing anyway:

- Four deep leaves 0.55 units, inside the 1-unit `TITLE_EDGE_CLEARANCE` #35 codified as the smallest
  separation that still reads as two marks rather than one. Three deep breaches it at size 300.
- That it clears at all is **incidental**, and nothing in the code ties the text's radii to the stroke
  beside them. Under #26's halo — 0.12 of the band rather than 0.07 — the same geometry left **0.13**
  three deep and **0.09** four deep. (That is the halo *as drawn*: `stroke()` capped it at 0.4 of the
  ring, so 8.91 and 6.23 rather than the 9.11 the ratio asks for. An earlier revision of this plan,
  and of #67 itself, quoted 0.03 and −1.35 from the uncapped figure and called it an overlap. It never
  overlapped; it was 0.09 clear, which is 0.91 short of the floor and makes the same point without
  overstating it.)
- Nothing in the suite would have noticed either: `arc-title-layout.test.ts` asserted the offset
  ratio, not the clearance.

## Chosen direction

**The stack yields, not the outline** — #67's option 2, generalised, in two parts.

`computeArcTitleLayout` takes the width of the widest stroke the caller draws on the ring's edges
(the same parameter `fitDurationLine` already takes, for the same reason) and holds the font to what
the remaining radial room can carry:

```
usableHalf   = ringThickness / 2 − (edgeStrokeWidth / 2 + TITLE_EDGE_CLEARANCE)
reachRatio   = fit.lines.length ≥ 2 ? TITLE_LINE_OFFSET_RATIO + 0.5 : 0.5
titleFontSize = min(ringThickness × TITLE_FONT_SIZE_RATIO, usableHalf / reachRatio)
lineOffset    = titleFontSize × TITLE_LINE_OFFSET_RATIO
```

Two properties do the work, and both were arrived at by measuring the naive version:

1. **The reach is keyed on the lines a title actually takes, not on the two its span allows.** Keying
   it on `maxLines` charged two-line room to every arc over 30°, so a one-line title four deep lost
   9.9% of its size at size 600 and **32.9%** at size 300 — with 1.95 and 0.43 units of radial slack
   going spare (`usableHalf` less the one-line reach of `fontSize / 2`). On the rings #70 is about,
   there is nothing to spend for a line that is not drawn.
2. **The word-pack runs at the ring's own font size, before the cap.** A capped font is a *larger*
   character budget, so packing against it would move borderline titles off a legible 17.52-unit
   floating card onto arc text a quarter that size — measured at 600, four deep: titles of 91–100
   visual units on the innermost ring and 112–123 on the outermost. Fitting first keeps `didOverflow`
   and every routing decision exactly what they were; lines packed for a larger font and drawn at a
   smaller one can only leave angular slack, never overrun.

`lineOffset` joins `ArcTitleLayout` so the renderer takes the offset from the layout rather than
restating the ratio next to a font size the cap may have moved.

### Why this is not the 18-unit ceiling #35 removed

The ceiling that was removed was **absolute**, so widening the band bought a thicker arc carrying the
same small text. This limit is derived from the ring's own room and scales with the band exactly as
the ratio does — a wider band raises the limit and the ratio together. It binds only on a two-line
stack four deep at size 600, or three deep on a small dial.

### Rejected

- **Tighten `ELAPSED_STROKE_MAX_RATIO` so the ring always leaves the text room** (#67's option 1).
  Ruled out by a recorded decision: the required cap is ≈ `0.412 × ring − 2`, which clamps the outline
  on the deepest rings, and `ELAPSED_BORDER_RATIO`'s comment records the 0.12 widening being reverted
  for precisely that inversion. The outline *is* the arc once the fill is gone; the title has a
  floating label and an accessible name to fall back on.
- **Inset the line offset alone, leaving the font at the ring's ratio.** Measured ceiling: the offset
  can fall from 0.55 to 0.5 before the two glyph bands abut, which buys 4.76% of stack height — 0.31
  units three deep. Four deep needs 4.58 units of half-height in 4.12, so inset-only cannot fit it,
  and it spends the inter-line hair to get nowhere.
- **Drop the second line below some thickness** (#67's option 3). Dropping words from an event's name
  is worse than small text, which is #70's subject and not this one's.

### What the guarantee is measured to

The glyph **em box** — `fontSize / 2` either side of each baseline — which is the model
`fitDurationLine` and the rest of this band already use. Real ink from ascenders and descenders reaches
further: measured with `getBBox()` at the sizes the dial renders, **0.54 units per side at 3.93** and
1.87 at 21.26, so the 1.00 this cap holds to is nearer 0.46 of actual gap. That is why the uncapped
render's ascenders are *touching* the outline at a modelled 0.55 rather than 0.55 clear of it.

Correcting the model is #78 and deliberately not folded in here: it changes every radial gate on the
band at once, including `TITLE_LINE_OFFSET_RATIO`'s separation between the two lines, and it is a
different question from tying the text's radii to the stroke beside them — which nothing did at all
before this.

## Phases

1. **Shared geometry.** `computeArcTitleLayout` gains `edgeStrokeWidth` and returns `lineOffset`;
   unit tests for the clearance property across four cluster depths, three dial sizes, one- and
   two-line titles, and a stroke wider than the renderer would draw.
2. **Renderers.** `event-arc.ts` exports `arcEdgeStrokeWidth` so the dial and the standalone path
   derive it once; `analog-clock.ts` passes it per ring. jsdom assertions on the rendered text-path
   radii against the rendered `stroke-width`.
3. **Fixture and visual pass.** The fixture's deepest cluster was three, where the cap is a verified
   no-op, so the preview could not show the change at all. Deepened to four — as many rings as
   `maxRings` opens — carrying a two-line title on its innermost ring and one-line titles on the rest.

## Verification

- The property test is the one that was missing: for every cluster depth and dial size, both lines'
  glyph edges clear the drawn stroke by at least `TITLE_EDGE_CLEARANCE`.
- Rendered check, measured off the preview DOM in the same page load as the screenshot: four deep, the
  two-line arc's font falls 4.36 → 3.93 and its clearance rises 0.55 → 1.00, while the one-line arcs
  beside it keep 4.36 at 2.95 clear.
- Perturbation: removing the cap, keying the reach on the span again, packing against the capped font,
  or dropping the dial's wiring each fails the suite (11, 3, 7 and 1 tests respectively).
