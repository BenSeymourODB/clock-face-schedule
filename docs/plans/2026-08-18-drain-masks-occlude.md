# Make the drain masks actually drain

**Status:** in review
**Issue:** [#71](https://github.com/BenSeymourODB/clock-face-schedule/issues/71)
**Docs:** #28 (the drain this was meant to draw), #26 (the elapsed outline the spent side borrows),
#27 (outline contrast), #22 (the feather mask this model came from), #72 (pinning the clock — not
implemented here), ADR 0003 (no geometry server-side)

## What this ships

A draining arc finally splits at `now`: the spent side loses its fill and carries the elapsed
outline, the remaining side keeps its fill and carries no outline, and the seam ramps across
`depth` degrees so neither side ends on a crisp edge.

## Root cause, restated in one line

`buildFadeMask` paints **a white ground plus a gradient wedge**. White ground means opaque
everywhere the wedge does not reach, so a mask built that way can soften an edge but can never
*hide* a side — and `computeDrainMasks` only ever returned the ramp. Correct for #22's window
feather, where the arc genuinely continues; wrong for a boundary where one side must go.

Measured on the fixture before the fix — the two masks differ only in which way their single notch
points:

```
mask#arc-fade-i  -> rect #ffffff + linearGradient(1->0) on one wedge   (fill + separator)
mask#arc-drain-i -> rect #ffffff + linearGradient(1->0) on one wedge   (outline)
```

## Correction to the issue's reproduction recipe

The issue reproduces this with `now` pinned to 04:15, "where 🟤 ⚽ (04:02–04:26) is mid-drain". That
was true when the fixture was anchored to `periodStart` (midnight or noon), so fixture offsets read
as wall-clock times. **It is no longer reachable.** Since #25, `main.ts` seeds the fixture from
`getRollingWindow(new Date()).windowStart`, which is exactly `now − 3h`, so `now` always falls at
fixture offset **+3:00** whatever the wall clock says — and no fixture event spans that offset.

Measured on `build/preview.html` with the clock pinned to 04:15 UTC: of thirteen arcs, four are
elapsed (`z`, `a`, `b`, `c`), nine are future, **zero carry a drain mask**. Pinning the clock cannot
help, because moving `now` moves the whole fixture with it.

So the drain state — an entire rendered state, shipped in #28 — **cannot be seen in demo mode at
all**, which is why a fill that drains nothing survived #28 and #27. That is a fixture defect in its
own right, and fixing it is the prerequisite for looking at anything here.

## Shape

### 1. `src/shared/clock/drain.ts` — return the hidden region, not just the ramp

`computeDrainMasks` gains two regions alongside its two ramps:

| field | region | on which mask |
| --- | --- | --- |
| `fillOccluded` | ramp's opaque end → `startAngle` (the spent side) | fill + live separator |
| `spentOccluded` | ramp's opaque end → `endAngle` (the remaining side) | elapsed outline |

Anchored at the ramp's own opaque end in `fromAngle`, matching `FeatherSpan`'s convention that
`fromAngle` is the hidden end, so both region kinds pad away from the seam in the same direction the
existing wedge code already computes. A new `OccludedSpan` type rather than reusing `FeatherSpan`,
whose contract is a *fade*. See §3 for why that end is not the boundary itself.

### 2. `src/client/render/event-arc.ts` — paint solid wedges as well as ramps

`buildFadeMask` takes an occlusion list and paints each as a black wedge, before the ramps. Three
properties it must keep:

- **A wedge, not the box.** `pad` spread on a full-box gradient reaches the far side of an arc that
  curves back past 180°; the same is true of a full-box rect. Occlusions are drawn with `describeArc`
  at the padded radii, exactly as the ramp wedges are.
- **The solid stops where its ramp starts.** The ramp already pads `pad` degrees *past* its own
  opaque end, so the stroke is covered there; a solid region overrunning it would blacken the half of
  the ramp on its own side and put the crisp edge back, half a ramp from `now`.
- **Feathers compose.** A draining arc can also be window-clamped, so occlusions are added to the
  same mask as `feathersToSpans`' entries rather than replacing them. The composition is meaningful
  in both directions: a `continuesAfter` feather still shapes the fill's remaining side, and a
  `continuesBefore` feather still shapes the outline's spent side.

### 3. The seam has to sit on `now`

Anchoring each ramp *at* the boundary — as #28 wrote it, when nothing was hidden and so nothing
depended on where the fill began — puts the fill's arrival after `now` and the outline's before it,
which means **at `now` neither is at any strength**. Rendered and measured on a
`FEATHER_DEGREES`-capped ramp: 50% fill 5.0° past the boundary, full fill 10° past it — **10 and 20
minutes late on a 12-hour dial** — with a dead band between where the arc states neither "spent" nor
"left". For a dial whose whole purpose is sparing the reader clock arithmetic, a seam that reads ten
minutes late is not a rounding error.

Both ramps now straddle the boundary, so they cross at half strength exactly on `now`. Measured on the
fixture after the change, fill coverage across the seam: `0.00` at 126.25°, **`0.49` at the boundary**,
`1.00` at 128.75°. The ramp is the same width as before, moved. Each occlusion therefore stops at its
own ramp's opaque end rather than at the boundary — a solid reaching the boundary would paint over the
half of the ramp on its own side and put the crisp edge back, half a ramp from `now`.

### 4. The title has to survive the fill it was sitting on

Draining the fill for the first time gives one title two grounds, and this is not cosmetic. Black
measures **1.09:1** on the band a drained side exposes; `--card-foreground` measures **2.35:1** on a
filled 🟡. So a title that spans the seam draws once per side, each copy masked to its own ground —
same glyphs, same coordinates, so a letter at the split changes colour rather than doubling.

**Which colour each copy takes is measured against the ground that copy lands on**, from the two the
theme offers. Deriving it from the authored hex — as the live case must, having no composite to
measure — is wrong for two colours:

| composited over the band | black | `--card-foreground` | needs a split? |
| --- | --- | --- | --- |
| 🟡 🟢 🟠 ⚪ 🔵 | 8.11, 6.93, 5.66, 13.85, 4.46 | 2.35, 2.75, 3.37, 1.38, 4.28 | yes |
| 🔴 🟣 | 4.31, 4.14 | **4.43, 4.60** | no — one light copy |
| ⚫ 🟤 | 1.36, 2.48 | **14.04, 7.69** | no — one light copy |

🔴 and 🟣 change their title colour at the moment the event starts draining, from the live case's black
to the light token. That is the colour they keep once elapsed, and it is worth 0.12 and 0.46 of a
contrast ratio on the half still filled.

Where the split goes was decided by rendering and measuring, and cost three attempts:

| Variant | Worst glyph contrast across the seam |
| --- | --- |
| Cross-faded by the arc's own ramped masks | **1.4:1** — both copies at partial alpha, blending to mid-grey |
| Hard-edged at the boundary | **1.09:1** — the fill has not arrived there |
| Hard-edged at the black-vs-**pure-white** tie | **4.18:1** — ties the wrong pair; the renderer paints a token, not white |
| Hard-edged at the painted pair's own tie | **4.37:1** computed, 5.39:1 at the nearest glyph on the fixture |

`textFlipCoverage` therefore takes both candidate colours rather than deriving them, and
`computeDrainTextSplit` places a hard edge at the coverage it returns. **4.37:1 is the max-min, not a
pass**: the tie *is* the best available, so no split clears AA with this pair, and the pair is the
theme's (ADR 0007). Stated rather than papered over — the alternative would be hard-coding `#ffffff`
in place of a token, which buys 0.2 of a ratio and breaks the indirection a light theme needs.

The text masks also carry **no window feather**: a title at a window edge is deliberately left unmasked
(#22) so the name stays readable where the band does not, and draining must not quietly reverse that.

### 4b. `DIAL_BACKGROUND` was never the ground behind the band

`--card` is the *face circle's* fill. The band is drawn outside it (`analog-clock.ts` insets the face
by `FACE_GAP_RATIO`), over `--page` — sampled off the rendered preview at band radius, `#0c0e12` both
where no arc is drawn and inside a draining arc's spent side. Every number above is against `--page`
for that reason; measuring against `--card` moves each seam split 0.03–0.10 of the ramp and reports
black on the bare band as 1.18:1 rather than 1.09:1.

#26/#27's elapsed-outline adjustment still measures against `--card`, which errs safe — the real
ground is darker, so the outline over-clears. Left alone here and tracked separately, since correcting
it moves every elapsed arc's colour.

### 5. `src/client/sample-events.ts` — one event that straddles `now`

`🟡 Tidy Up`, fixture offsets **+2:30 → +3:14** (44 min, 22° on the 330° window):

- **Straddles +3:00**, so demo mode always shows exactly one draining arc, at 68% spent.
- **Yellow**, the worst title case above: black text, 8.27:1 on its own fill and 1.18:1 on the dial.
- **22° of span** clears `TITLE_MIN_SPAN_DEGREES` (20°), so the title renders *on the arc* rather
  than being promoted to a floating label that would sidestep the whole question — and the title is
  long enough to reach past the seam, since a short one sits wholly on the spent side and never
  exercises the split at all.
- **Overlaps only `b` 🔴 Deadline** (which ends at +3:00 and so is elapsed): peak concurrency stays
  three, so the three-deep cluster, the isolated `d`, and the `x`/`w`/`i` group are all untouched.
  It also puts a drained portion immediately beside a fully-elapsed arc, which is the comparison a
  viewer actually has to make.

## Not in scope

- **#72, pinning the clock from a URL parameter.** It would have made this reproducible without a
  scratch `Date` monkeypatch, and would have made the fixture-anchoring correction above visible to
  a reviewer. Still worth doing; still its own issue.
- **#66, a filled ⚫ arc measuring 1.17:1 against the dial.** Genuinely adjacent — the drained side
  now reads against the same dial background — but it is decision-bound (three options, one of them
  a visible redesign of the filled state) and does not block this.
- **#67, a two-line title on a stacked ring sitting on the elapsed outline.** Same title code, a
  different defect.

## Tests the suite was missing

`event-arc.test.ts` asserted which mask id each part references and that the two ids differ. Every one
of those assertions passes on a mask that drains nothing. Added:

- the fill's mask occludes the whole spent side — a solid region, not only a ramp — at the padded
  radii, and the outline's mask occludes the whole *remaining* side;
- each solid region stops where its own ramp begins, with exactly the ramp between the two and no
  double-black across the seam;
- the occluded region carries the right `largeArcFlag`, exercised on a 288°-remaining side. Without
  this the wedge could cover the *complement* of its side — hiding the wrong half of the arc outright
  — and every endpoint-angle assertion would still pass;
- both masks still carry the window feathers when the arc is clamped as well as draining — the one
  case the fixture cannot show, since `now` sits three hours inside an eleven-hour window;
- each ramp is centred on the boundary, at four fractions including both extremes, so half strength
  lands on `now`;
- the two occluded regions track the drain fraction: the old assertion here summed them and got the
  arc's span for *every* fraction, which is true of any split at all, including a negative or NaN
  depth;
- `computeDrainTextSplit` measures its coverage along the ramp, so it moves with the ramp rather than
  from the boundary, and it survives a capped depth;
- a title splits once per side, masked and coloured per ground, for the five colours that need it —
  and stays a single unmasked copy for the four that do not, with the contrast that justifies each
  measured in the test rather than asserted in a comment;
- `textFlipCoverage` beats every other split for each affected colour (seven alternatives checked, not
  just the midpoint), lands somewhere different for the painted pair than for pure white, and lands
  somewhere different again if measured against `--card` instead of the band's real ground.

## Review round

An adversarial review pass over the first push found six real defects, all of them numbers rather than
opinions, and all of them fixed above: the split computed for a colour the renderer never paints
(§4), the wrong ground behind the band (§4b), black painted where black had just been shown to lose
(§4), the seam reading up to ten minutes late (§3), three assertions that could not fail, and a wedge
parser that discarded the one field a catastrophic mask would show up in.

Two things it raised are recorded rather than fixed:

- **The fixture crosses the split by about two glyphs.** A mid-arc seam is not reachable without
  moving a neighbour: with `c` ending at +2:30 and `x` starting at +3:15, an event straddling +3:00
  that clears the 20° title floor must start at or before +2:35, which puts the seam at ≥62.5% of the
  arc while the title is centred at 50%. Buying a centred seam means overlapping `x` and halving its
  ring, which is a stress case of its own.
- **No fixture event reaches the 10° ramp cap.** `n`'s short remaining side caps its depth at 2.45°,
  so the fixture shows a narrow seam. The capped case is covered by unit tests and by the measurement
  in §3, not by the rendered fixture.

## Merged with #35

#35 (duration on the arc) landed on `main` first and touches the same title code: it puts a duration
line on the second baseline when the title is one line. The two compose without argument — the
duration line sits on the same two grounds as the name above it, so it takes the same two copies,
with #35's own 400 weight and its `event-duration-*` id on each. Verified by rendering and asserted
directly, since neither change's tests would have caught the other's absence.

`n` itself carries no duration line — its title is too long for the second baseline to survive
`fitDurationLine`'s gating — so the *drained duration line* is covered by a unit test rather than by
the fixture, alongside the two gaps above.
