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
| `fillOccluded` | boundary → `startAngle` (the spent side) | fill + live separator |
| `spentOccluded` | boundary → `endAngle` (the remaining side) | elapsed outline |

Anchored at the boundary in `fromAngle`, matching `FeatherSpan`'s convention, so both region kinds
pad away from the boundary in the same direction the existing wedge code already computes. A new
`OccludedSpan` type rather than reusing `FeatherSpan`, whose contract is a *fade*.

### 2. `src/client/render/event-arc.ts` — paint solid wedges as well as ramps

`buildFadeMask` takes an occlusion list and paints each as a black wedge, before the ramps. Three
properties it must keep:

- **A wedge, not the box.** `pad` spread on a full-box gradient reaches the far side of an arc that
  curves back past 180°; the same is true of a full-box rect. Occlusions are drawn with `describeArc`
  at the padded radii, exactly as the ramp wedges are.
- **The solid stops at the boundary.** The ramp already pads `pad` degrees *past* the boundary onto
  the occluded side, so the stroke is covered there; a solid region overrunning the boundary would
  blacken the first fraction of a degree the ramp is supposed to own.
- **Feathers compose.** A draining arc can also be window-clamped, so occlusions are added to the
  same mask as `feathersToSpans`' entries rather than replacing them. The composition is meaningful
  in both directions: a `continuesAfter` feather still shapes the fill's remaining side, and a
  `continuesBefore` feather still shapes the outline's spent side.

### 3. The title has to survive the fill it was sitting on

Draining the fill for the first time changes what a title sits on, and this is not cosmetic.
`readableTextColor` measures the **authored hex**, not the composite, so it picks **black** for seven
of the nine palette colours — everything except ⚫ and 🟤 — and black measures **1.18:1** on the bare
dial. Any title over a genuinely drained portion of one of those arcs is invisible. (An earlier draft
of this plan said four colours; that measured the composited fill rather than the value the code
actually passes.)

So a draining arc with a black title draws it twice, once per side, each copy masked to its own
ground: `readableTextColor(color)` on the filled side, `var(--card-foreground)` on the drained one.
⚫ and 🟤 keep the single unmasked copy — white reads at 15.21:1 and 8.35:1 on their fills and
17.76:1 on the dial, so there is nothing to split.

Two things about those masks were found by rendering, not reasoning, and each cost a measurement:

| Variant | Worst glyph contrast across the seam |
| --- | --- |
| Cross-faded by the arc's own ramped masks | **1.4:1** — both copies at partial alpha, blending to mid-grey |
| Hard-edged at the boundary | **1.18:1** — the fill has not arrived at the boundary, so black lands on bare dial |
| Hard-edged at `textFlipCoverage` | **4.61:1** predicted, **4.65:1** measured on the fixture |

`textFlipCoverage` (new, in `contrast.ts`) returns the coverage at which the two candidate text
colours are equally legible on the part-drained blend; `computeDrainTextSplit` places the hard edge
there. It is the max-min split by construction, and for the three colours where black never beats
white even at full fill (🔴 🔵 🟣) it returns 1, confining black to the fully-filled remainder.

The text masks also carry **no window feather**: a title at a window edge is deliberately left
unmasked (#22) so the name stays readable where the band does not, and draining must not quietly
reverse that.

### 4. `src/client/sample-events.ts` — one event that straddles `now`

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

`event-arc.test.ts` asserted which mask id each part references and that the two ids differ. Every
one of those assertions passes on a mask that drains nothing. Added, per #71:

- the fill's mask fully occludes the spent side — a solid region, not only a ramp;
- the outline's mask fully occludes the remaining side, so no "already over" outline is drawn over
  what has not happened;
- the occluding region stops at the boundary rather than overrunning the ramp;
- both masks still carry the window feathers when the arc is clamped as well as draining — the one
  case the fixture cannot show, since `now` sits three hours inside an eleven-hour window;
- a draining arc draws its title once per side, each masked to that side and coloured for the ground
  it lands on — and once only, unmasked, for the two colours that need no split;
- the text split lands past the boundary, inside the ramp, rather than on the boundary itself;
- the text masks carry no ramp and no feather;
- `drain.test.ts`: the two occluded regions are anchored at the boundary and reach the arc's ends,
  and `computeDrainTextSplit` places one split both copies share;
- `contrast.test.ts`: `textFlipCoverage` beats both the boundary and the midpoint on every palette
  colour it applies to, and clears 4.5:1 across the whole ramp.
