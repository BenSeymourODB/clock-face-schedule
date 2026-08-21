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
delivers as little as 41% of it wherever it binds.

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

The corrected cap lands on **1.0001** wherever it binds — the cap truncates the font to
`roundCoord`'s precision rather than rounding it, so the clearance overshoots the floor by at most
1.25e-4 and never undershoots. That is the point: the clearance becomes the number the constant
states rather than 41–87% of it. The 900-unit dial four deep is why the range starts at 0.41 — the
band-sized outline is widest there against the ring. The nearest miss after the change is 900 three
deep, which does not bind and clears by 1.0342.

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

Measured across the same grid, **the one-line branch never binds at today's outline width**: `ring ×
TITLE_FONT_SIZE_RATIO` sits below `usableHalf / 0.6` at every depth from 1 to 4 and every dial size
from 300 to 900. Four deep at 600 is the tightest, and it is not close — a preferred 4.36 against a
ceiling of 6.87.

It is corrected anyway, and not only for tidiness: the reason it does not bind is the outline's width
rather than anything the cap knows about, and the outline is the caller's to choose. The suite already
holds the guarantee against a stroke wider than the renderer draws today — `edgeStrokeWidth: 12` four
deep at 600, past what `ELAPSED_STROKE_MAX_RATIO` permits — and **there the one-line branch does
bind**, at 0.84 units of the promised 1.00 under the em-box reach. That case goes green on the ink
reach and red on the em-box one, so the branch is a live guard rather than a latent one. Leaving one
`0.5` behind would also leave the docstring's `±fontSize/2` derivation half-true, which is the shape
#78 exists to remove.

## What it costs

Text gets smaller where the cap binds: against the font `main` draws today, 4.2% three deep and 8.1%
four deep at 600; against the uncapped ring ratio the cap is now measured from, 4.1% and 24.3%. That
is #70's subject — 6.24 units three deep is already called "a smudge at classroom distance" — and this
makes the two-line case of it marginally worse, 6.24 → 5.98. (Re-grounded at the board's own scale in
the #116 section below, which strengthens rather than weakens the trade.)

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
- [x] `arc-title-layout.test.ts`'s `clearances` helper measures ink, not the em box — it modelled
      `titleFontSize / 2`, the same wrong assumption as the code, which is why the five binding
      per-size/per-depth cases passed at 0.41 to 0.87 units of a promised 1.00
- [x] The cap-binds assertion that pins `usableHalf / (TITLE_LINE_OFFSET_RATIO + 0.5)` pins the ink
      figure instead
- [x] One targeted case: the corrected cap holds the clearance at `TITLE_EDGE_CLEARANCE` where the
      em-box cap fell short of it, asserted at all five size/depth combinations that bind
- [x] `analog-clock.test.ts`' whole-dial four-deep clearance case measures ink too. It was a third site
      carrying the em box, and with both sides on the box it reported the floor exactly whatever the
      real gap was — inert rather than merely optimistic
- [x] A fixture case for the three-deep ring, guarded through the *rendered dial* rather than by
      restating its ring index and span: retiming `s` out of the cluster, shortening its title, or
      losing it to a floating label each fails a different line
- [x] Render the fixture's four-deep cluster and the new three-deep one, before and after, and look at
      the stack against the outline rather than at the arithmetic

## Not in scope

- **#70**, which is whether a stacked ring should carry a title at that size at all.
- **#91**, which is whether `INK_HEIGHT_RATIO = 1.2` survives contact with the face a smart board
  resolves. This change makes the constant load-bearing in one more place; it does not settle the
  constant.

## Comment drift this corrected on the way past

Found by review, and load-bearing by this repo's own rules rather than cosmetic:

- `TITLE_EDGE_CLEARANCE`'s docstring said it is *"measured to the glyph em box, as every radial
  gate on this band is"* and that #78 *"carries the correction"*. After this change no gate on the
  band measures to the em box — this was the third and last.
- `stackReachRatio`'s own docstring priced charging two-line room to a one-line title at 10% four
  deep at 600 and 33% at 300. Those are #67-era figures at the 0.55 line offset; the numbers are
  now **24%** and **44%**, so the justification for keying the reach on lines-actually-drawn was
  understated by more than 2x. Duplicated in the test docstring, and corrected in both.
- The comment listing where the cap binds named 600/4 and 300/3 only. It binds at 300/3, 300/4,
  600/3, 600/4 and 900/4 — including 600/3, this change's own headline.
- The four-deep font read `3.93` in three places (the fixture, the overflow-routing docstring, and
  `TITLE_EDGE_CLEARANCE`'s). That is the pre-#89 figure; it is 3.30 now.
- The describe header's clearance figures (1.93 and 0.55) were the em box at the 0.55 offset.
  Uncapped against real ink they are 0.68 and −1.32.

## What #116 changes, and what it does not

#116 landed after this was written, recording two measurements off the deployed board. Merged in;
**no code change follows from either**, and one claim in this plan had to go.

### #115: the dial renders at 600 px on any display

The board lays the dial out at its nominal 600 units, one CSS pixel per unit. Three consequences,
in ascending order of how much they matter:

- **The 600-unit rows above are the board's own numbers**, not a middle entry in a robustness
  sweep. So the shortfall a viewer actually got was 0.64 units four deep and 0.68 three deep.
- **900 is not a size anything renders at.** Calling 900/4's 0.41 "the worst case" was misleading:
  it is the worst case in the *suite*, which sweeps 300 to 900 because `analogClock` takes a `size`
  and nothing should depend on one value of it. Nothing passes 900 today, and #115's own candidate
  fixes land on 950.4 or 1036.8.
- **A pinned dial is 58% larger than the board's**, because the "Clock frozen at…" notice props the
  grid track (#115's table). Every screenshot in this change was pinned. Reproduced here: 950.4 px
  pinned, 600.0 px with `#status` hidden, at 1920×1080.

That last one costs this plan a sentence. Geometry and contrast are in viewBox units and are
unaffected — `CLAUDE.md`'s new paragraph says so explicitly, and every figure here was read off the
rendered DOM in units, so the before/after clearances stand. **A legibility claim is not**, and this
plan made one: *"the text at 5.98 and 3.30 is still legible at the same distance it was"*. Re-rendered
at the board's own 1.0 px/unit and magnified nearest-neighbour, the four-deep two-line title is not
words at either font — it is subpixel colour fringing. The three-deep one survives, heavily fringed.

| | units | on a 4 ft 16:9 board | /150 rule |
| --- | --- | --- | --- |
| four deep, before | 3.59 | 4.05 mm | 0.61 m |
| four deep, after | 3.30 | 3.72 mm | 0.56 m |
| three deep, before | 6.24 | 7.04 mm | 1.06 m |
| three deep, after | 5.98 | 6.75 mm | 1.01 m |

The honest version of the trade is therefore **stronger** than the one argued above, not weaker: at
four deep the yield costs 0.05 m of a legible distance that was already 0.61 m on a display meant to
be read across a classroom. There was nothing there to lose. What that really says is that **#70 is
not a nicety** — a four-deep two-line title is unreadable at any distance a room contains, before
and after — and this change neither helps nor hurts it.

### And the clearance itself is sub-pixel at today's scale

0.3588 units of clearance gained is **0.36 device pixels** at 1.0 px/unit. It is not visible on the
board; it shows up as a slightly different antialiasing fringe. It was visible in the first pass'
crops because those were captured at deviceScaleFactor 3 to 6 — 1.08 to 2.15 px of change, at a
scale no display shows.

| px/unit | clearance gained | where |
| --- | --- | --- |
| 1.000 | 0.36 px | the board today (#115) |
| 1.584 | 0.57 px | a pinned preview, and #115's first three candidate fixes |
| 1.728 | 0.62 px | ADR 0009's dial, which keeps the board's height |

So the case for the change is not "you can see it". It is:

1. **`TITLE_EDGE_CLEARANCE` is a contract other code is written against.** #35's duration gate and
   #67's cap both compare against it, and #114 is a live bug of exactly this shape — a pad sized
   from the ring against a stroke sized from the band, with nothing checking them. A constant that
   silently means 41% of itself is how the next one of those gets built.
2. **It becomes visible as the dial grows**, and every path #115 offers grows it.
3. **Nothing regresses.** The yield is 0.29 units of a font that is colour fringing either way.

### #114: the escaped hairline

No interaction, checked rather than assumed. #114's slivers sit at r 213.50–213.75 and 294.25–294.50,
which are the halves of the 5.31-unit outline lying *outside* the ring — `292 + 5.3144/2 = 294.66`
at the outer edge. This cap already excludes both halves ("a stroke straddles its path, so it takes
half its width from each edge"), so the escape is in territory the text never claimed. And #114's fix
widens the mask pad rather than narrowing the outline, so `edgeStrokeWidth` — the cap's only input
from that quarter — does not move.

Worth flagging for whoever takes #114: it proposes an `arcEdgeStrokeWidth(ringThickness,
bandThickness)` helper and notes the title layout already derives the quantity. It does, as
`computeArcTitleLayout`'s `edgeStrokeWidth` parameter — but as a value the *caller* computes, so the
helper still has to be extracted from `event-arc.ts`. Not done here; this change has no second caller
to justify it.
