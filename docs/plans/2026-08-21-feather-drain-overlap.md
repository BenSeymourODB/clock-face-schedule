# The feather/drain overlap, measured twice and found unreachable both ways

**Status:** in review
**Issue:** [#58](https://github.com/BenSeymourODB/clock-face-schedule/issues/58)
**Docs:** `src/shared/clock/feather.ts`, `src/shared/clock/drain.ts`, `src/client/render/event-arc.ts`

## What #58 claims

`buildFadeMask` paints a window-edge feather (#22) and a drain fade (#28) onto the same `<mask>` in
sequence, so where the two spans overlap "the later-painted gradient (always the drain one) simply
overwrites whatever the feather gradient painted, rather than the two combining". The proposed fix is
to compose the two gradients' luminance — multiply, or take the minimum.

Two independent claims are packed into that: that the overlap is **reachable**, and that where it
happens the result is an **overwrite**. Two prior sessions on the issue argued the first at length and
never touched the second. Both are measured here, and both come out false.

## 1. The two ramp wedges never overlap — but the margin fell by a factor of five

The earlier analysis put the nearest window edge 90° from the drain boundary against a 20° combined
wedge reach, and closed the question. That is a 12-hour figure. #34's 1-hour scale runs the band at
6° per minute with `lookbehindMinutes = 5`, which puts the same edge **30°** away.

Swept over the real pipeline — `dialWindow` → `eventsToClockEvents` → `computeArcFeathers` /
`computeDrainMasks` — for every event in progress at `now` that reaches a window edge, offsets stepped
by three minutes, at 168 instants (24 hours × the 0/1/7/23/30/45/59 minute marks), both scales, all
four stack depths. Zero overlaps, and the clearance is identical at every instant — scale arithmetic
rather than a time-of-day accident. The tightest, on the fill mask:

| scale | look-behind | tightest clearance between the two ramp wedges |
| --- | --- | --- |
| 12h | 180 min → 90° | **73.9572°** |
| 1h | 5 min → 30° | **13.9572°** |

It decomposes exactly, and both depths are capped rather than fixed:

```
clearance = spent − drainHalf − featherDepth − padDegrees
spent       = lookbehindDegrees
drainHalf   = min(FEATHER_DEGREES, min(remaining, spent) × FEATHER_MAX_SPAN_RATIO) / 2
featherDepth = min(FEATHER_DEGREES, arcSpan × FEATHER_MAX_SPAN_RATIO)

1h:  30 − 5 − 10 − 1.0428 = 13.9572
```

- `spent` is where the drain boundary sits relative to the clamped edge. Exact, not approximate:
  `computeDrainFraction` reads the *clamped* true angles, and a clamped in-progress arc always spans
  at least the look-behind, so `MIN_ARC_DEGREES` widening never applies and the boundary lands on
  `now` itself.
- `drainHalf` is half a depth because the drain ramp straddles its boundary rather than starting at
  it. **The cap matters**: `drain.ts` caps the depth by `min(remaining, spent)`, and on a clamped arc
  `spent` *is* the look-behind — so below a 28.571° look-behind the drain ramp shrinks with it and
  contributes `0.175 × lookbehindDegrees`, not 5. Treating it as a flat `1.5 × FEATHER_DEGREES` is
  wrong by 24% at the small look-behinds that are the only ones at risk.
- `padDegrees` is `buildFadeMask`'s wedge pad as an angle at the outer radius, and it applies to the
  **fill mask only**: that mask's drain wedge pads *toward* the feather, where the spent mask's drain
  wedge — anchored at the other end of the same span — pads away from it. So the fill mask carries the
  smaller number. Since #114 the pad is the widest stroke the arc draws — `5.3144` units, sized from
  the band — and `ring × ELAPSED_STROKE_MAX_RATIO` exceeds that at every depth the dial opens (the
  thinnest, a four-deep 15.5636-unit ring, gives 6.225), **so the pad and the clearance are the same
  at every stack depth**. That is a change: before #114 the pad was `separatorWidth`, ring-sized,
  which put a lone arc at 14.5531° and a four-deep ring at 14.8038°. **#114 cost this margin 0.6°**,
  and the pad is the term that erodes whenever a stroke on the arc gets wider — which is the
  interaction the guard now covers.

**The overlap becomes reachable when the look-behind drops below 13.3852°** — bisected against the
formula above, which is **2.23 minutes on the 1-hour scale** and 26.77 minutes on the 12-hour. Nothing
today is near that; the 1-hour scale cut the margin fivefold without anything noticing, which is the
reason this wants a test rather than an argument.

The look-ahead side is never the binding one, so it does not appear in the formula: 240° on the
12-hour scale and 300° on the 1-hour, against the same ~15° of combined reach.

## 2. Overlapping ramps already compose, and they compose by multiplying

Rendered in Chromium rather than reasoned about. A white rect on a black page, masked by a mask
holding a white ground and two opposed black gradients overlapping across the whole 200-unit span, so
the two stop-opacities cross at 0.5. Pixels read off the centre row:

| x | measured red | overwrite predicts | multiply predicts |
| --- | --- | --- | --- |
| 0 | 1 | 255 | 0 |
| 50 | 48 | 191 | 48 |
| 100 | **64** | 127 | **64** |
| 150 | 48 | 63 | 47 |
| 199 | 1 | 0 | 0 |

Measured tracks multiply to within 1/255 at every sample and diverges from overwrite by up to
254/255. The mechanism is ordinary source-over compositing: a mask's children composite normally
before the result is read as luminance, and black at alpha `a` over a ground of luminance `L` leaves
`L × (1 − a)`. Painting two black ramps in sequence therefore multiplies the two transmittances —
which is precisely the composition #58 proposes building.

So the paint order in `buildFadeMask` is not load-bearing, and the "later gradient wins" premise does
not describe what the browser does.

### The one place a ramp does land on something already painted

Occlusions are painted before the ramps, and each mask's occlusion covers the whole of the side it
does not own — which contains one of the two feathers outright. On the fill mask the start feather's
ramp sits inside `fillOccluded`; on the spent mask the end feather's sits inside `spentOccluded`.
Black over solid black is still black, so those ramps are redundant rather than wrong, and the
feather that does real work on each mask is the one on the side that mask keeps.

That is worth holding onto when reading the two numbers: the **fill** mask's clearance is the smaller
of the pair, but its start feather is the redundant one, so the clearance that could ever produce a
visible artefact is the **spent** mask's — 15.0000° on the 1-hour scale against the fill mask's
13.9572°. The spec asserts both, and takes the tighter as the margin, which is the conservative way
round.

## What lands

No renderer behaviour changes: there is nothing to fix.

- **A guard test**, in `event-arc.test.ts`'s draining block, asserting that the window feather's ramp
  wedge and the drain ramp's wedge do not overlap, and pinning the clearance to the decomposition
  above rather than to a constant. Three things it has to get right, each of which was wrong in a
  first draft:
  - **Iterate the scales, do not list them.** A hand-written pair is exactly how the 1-hour scale got
    past the arithmetic that closed this issue the first time. `DIAL_SCALES` is exported from
    `scale.ts` for this, and `DialScaleId` forces an entry there for every scale that exists — a
    third scale is picked up with no edit. Verified: a hypothetical 24-hour scale with 30 minutes of
    look-behind (7.5°) fails at −4.86°.
  - **Render on the dial's geometry, not the suite's.** The pad is sized from real radii, and this
    file's ad-hoc 48-unit ring is not one the dial draws — it reported 14.7174° where the dial then
    had 14.5531°. `ARC_BAND_RATIO` is exported from `analog-clock.ts` for exactly this reason. The
    error is smaller now that #114 has made the pad band-sized, and the reason to take the geometry
    from the dial is unchanged.
  - **Cap both depths the way the code caps them.** A flat `1.5 × FEATHER_DEGREES` holds only while
    the look-behind clears 28.571°, which is 1.43° of headroom on the 1-hour scale; below it the
    assertion would demand a wrong number and fail on a scale change that is perfectly safe.
    Verified: at a 4-minute look-behind (24°, below the cap) the spec passes; at 2 minutes it fails
    on the invariant itself, at −1.14°.

  The pad is read back off the rendered wedge rather than written down, so #114 changing it moves the
  spec with it.
- **A docstring line** in `buildFadeMask` recording the compositing measurement, because a later
  coder reading two gradients painted onto one mask will ask the same question this issue asked, and
  the answer cost three sessions to establish.

## Recommendation on #58

Close it. Both halves of the premise are false: the condition is unreachable at every scale the dial
has, and where it did occur the gradients would compose exactly as the issue asks. The guard is what
keeps the first half true as scales change.
