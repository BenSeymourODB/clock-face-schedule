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
`computeDrainMasks` — for every event in progress at `now` that reaches a window edge, at
three-minute resolution, across 168 times of day, both scales, all four stack depths:

| scale | look-behind | tightest clearance between the two ramp wedges |
| --- | --- | --- |
| 12h | 180 min → 90° | **74.34°** |
| 1h | 5 min → 30° | **14.34°** |

Zero overlaps. The figure is identical at every time of day, so it is scale arithmetic rather than a
time-of-day accident, and it decomposes exactly:

```
clearance = lookbehindDegrees − FEATHER_DEGREES − FEATHER_DEGREES / 2 − padDegrees
1h:  30 − 10 − 5 − 0.6593 = 14.3407
```

- `lookbehindDegrees` is where the drain boundary sits relative to the clamped edge. Exact, not
  approximate: `computeDrainFraction` reads the *clamped* true angles, and a clamped in-progress arc
  always spans at least the look-behind, so `MIN_ARC_DEGREES` widening never applies and the boundary
  lands on `now` itself.
- `FEATHER_DEGREES` is the feather's full reach from the edge; the drain ramp straddles its boundary,
  so it contributes only half.
- `padDegrees` is `buildFadeMask`'s wedge pad as an angle at the outer radius.

**The overlap becomes reachable when `min(lookbehindDegrees, lookaheadDegrees)` drops below
`1.5 × FEATHER_DEGREES + padDegrees`** — about 15.7°, which is 2.6 minutes of look-behind on the
1-hour scale and 31 minutes on the 12-hour. Nothing today is near that; the 1-hour scale halved the
margin twice over without anything noticing, which is the reason this wants a test rather than an
argument.

The look-ahead side is not close: 240° on the 12-hour scale and 300° on the 1-hour.

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

## What lands

No renderer behaviour changes: there is nothing to fix.

- **A guard test**, in `event-arc.test.ts`'s draining block, asserting over both scales that the
  window feather's ramp wedge and the drain ramp's wedge do not overlap, and pinning the clearance to
  the decomposition above rather than to a constant. Derived from the rendered wedge radii, so it
  survives a change to the pad (#114 is changing it) and fails only when the margin genuinely erodes.
- **A docstring line** in `buildFadeMask` recording the compositing measurement, because a later
  coder reading two gradients painted onto one mask will ask the same question this issue asked, and
  the answer cost three sessions to establish.

## Recommendation on #58

Close it. Both halves of the premise are false: the condition is unreachable at every scale the dial
has, and where it did occur the gradients would compose exactly as the issue asks. The guard is what
keeps the first half true as scales change.
