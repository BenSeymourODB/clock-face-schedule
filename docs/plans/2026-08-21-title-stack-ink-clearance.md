# Measure `computeArcTitleLayout`'s clearance cap against real ink

**Status:** in review
**Issue:** [#90 — #67's title-stack clearance cap is still measured to the em box, and needs
INK_HEIGHT_RATIO](https://github.com/BenSeymourODB/clock-face-schedule/issues/90)
**Docs:** #78 / #89 (the ink model and where `INK_HEIGHT_RATIO` is measured), #67 / #77 (the cap this
corrects), #26 (band-sized elapsed outline), #70 (stacked-ring titles are too small — *not* this
change), `docs/DESIGN.md` (ADR 0003)

## What this is for

#78 found that every radial clearance on the band modelled one line of text as covering exactly
`fontSize` — `±fontSize / 2` around the point `dominant-baseline: central` anchors to — while real
ink covers `INK_HEIGHT_RATIO = 1.2` of it. #89 corrected the two gates that existed on `main` at the
time. The third arrived later, with #77:

```ts
function stackReachRatio(lines: number): number {
  return lines >= 2 ? TITLE_LINE_OFFSET_RATIO + 0.5 : 0.5;
}
```

Both `0.5`s are the em-box half-height. Both should be `INK_HEIGHT_RATIO / 2`.

## What the cap is actually short by

The issue's own comment reports the four-deep stack crossing its outline by **0.31 units**. That
figure was measured before #77 landed, against the *uncapped* font: `4.36 × 1.25 = 5.45` against
`5.13` of room. With #77's cap in place the font is held to 3.59 and the ink clears by 0.64 — so
**nothing on the dial overlaps today**. What is wrong is that `TITLE_EDGE_CLEARANCE = 1` is the
smallest separation the repo has decided still reads as two marks rather than one (#35), and the cap
delivers less than two-thirds of it wherever it binds.

Computed over the dial sizes the suite already covers, at the depths the cap binds. `font` is what
`computeArcTitleLayout` resolves; `clear` is the outermost line's real ink against the elapsed
outline's inner edge:

| dial | depth | ring | outline | font (0.5) | font (ink) | clear (0.5) | clear (ink) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 600 | 3 | 22.27 | 5.31 | 6.24 | **5.98** | 0.68 | **1.00** |
| 600 | 4 | 15.56 | 5.31 | 3.59 | **3.30** | 0.64 | **1.00** |
| 300 | 3 | 10.83 | 2.58 | 2.72 | **2.50** | 0.73 | **1.00** |
| 300 | 4 | 7.57 | 2.58 | 1.30 | **1.19** | 0.87 | **1.00** |
| 900 | 4 | 23.56 | 8.04 | 5.88 | **5.41** | 0.41 | **1.00** |

The corrected cap lands on 1.00 exactly wherever it binds, which is the point: the clearance becomes
the number the constant states rather than 41–87% of it. The worst case is the 900-unit dial, where
the band-sized outline is widest relative to a four-deep ring.

```bash
node -e 'const INK=1.2,OFF=(INK+0.1)/2,EC=1;
for (const size of [600,300,900]) for (const d of [1,2,3,4]) {
  const O=size/2-8,B=O*0.26,G=Math.max(2,B*0.06),ring=(B-(d-1)*G)/d;
  const s=Math.max(1,Math.min(B*0.07,ring*0.4)), uh=Math.max(0,ring/2-(s/2+EC));
  const pref=Math.round(ring*0.28*1e4)/1e4, room=ring/2-s/2;
  const f=(r)=>Math.min(pref,Math.floor(uh/r*1e4)/1e4);
  const [a,b]=[f(OFF+0.5),f(OFF+INK/2)];
  console.log(size,d,ring.toFixed(2),s.toFixed(2),a.toFixed(2),b.toFixed(2),
    (room-a*(OFF+INK/2)).toFixed(2),(room-b*(OFF+INK/2)).toFixed(2)) }'
```

## The one-line branch

Measured across the same grid, **the one-line branch never binds**: `ring × TITLE_FONT_SIZE_RATIO`
sits below `usableHalf / 0.6` at every depth from 1 to 4 and every dial size from 300 to 900. Four
deep at 600 is the tightest, and it is not close — a preferred 4.36 against a ceiling of 6.87.

It is corrected anyway, and not only for tidiness: the reason it does not bind is the outline's width
rather than anything the cap knows about, and the outline is the caller's to choose. The suite already
holds the guarantee against a stroke wider than the renderer draws today — `edgeStrokeWidth: 12` four
deep at 600, past what `ELAPSED_STROKE_MAX_RATIO` permits — and **there the one-line branch does
bind**, at 0.84 units of the promised 1.00 under the em-box reach. That case goes green on the ink
reach and red on the em-box one, so the branch is a live guard rather than a latent one. Leaving one
`0.5` behind would also leave the docstring's `±fontSize/2` derivation half-true, which is the shape
#78 exists to remove.

## What it costs

Text gets smaller where the cap binds, by 4.2% three deep and 8.1% four deep at 600. That is #70's
subject — 6.24 units three deep is already called "a smudge at classroom distance" — and this makes
the two-line case of it marginally worse, 6.24 → 5.98.

Taking that trade rather than arguing it away, for two reasons `CLAUDE.md` decides:

- **The one-line case is untouched**, so #70's headline figure (a *title* three deep) only moves when
  that title actually wraps.
- Text at 5.98 units is hard to read; text overlapping the stroke beside it is hard to read *and*
  ambiguous about which mark is which. The second glance is the one that loses, and a stack sitting on
  its own outline costs a second glance at any font size.

The real answer for both is #70 — not to let a four-deep cluster carry a two-line title at all — and
that is not this change.

## Scope

- [x] `stackReachRatio`'s two `0.5`s become `INK_HEIGHT_RATIO / 2`, and its docstring's `±fontSize/2`
      derivation is restated against ink
- [x] `arc-title-layout.test.ts`'s `clearances` helper measures ink, not the em box — it currently
      models `titleFontSize / 2`, the same wrong assumption as the code, which is why the eight
      existing per-size/per-depth clearance cases passed at 0.64 units of a promised 1.00
- [x] The cap-binds assertion that pins `usableHalf / (TITLE_LINE_OFFSET_RATIO + 0.5)` pins the ink
      figure instead
- [x] One targeted case: the corrected cap holds the clearance at `TITLE_EDGE_CLEARANCE` where the
      em-box cap fell short of it, asserted at the depth and size where the shortfall is worst
- [ ] Render the fixture's four-deep cluster and its two-line innermost ring, before and after, and
      look at the stack against the outline rather than at the arithmetic

## Not in scope

- **#70**, which is whether a stacked ring should carry a title at that size at all.
- **#91**, which is whether `INK_HEIGHT_RATIO = 1.2` survives contact with the face a smart board
  resolves. This change makes the constant load-bearing in one more place; it does not settle the
  constant.
