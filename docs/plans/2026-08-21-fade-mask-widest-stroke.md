# A fade wedge sized to the widest stroke the arc draws

**Status:** in review
**Issue:** [#114](https://github.com/BenSeymourODB/clock-face-schedule/issues/114)
**Docs:** #22 (the window feather the pad exists for), #26 / #27 (the elapsed outline and its
contrast floor), #28 (the drain), #71 (the occlusions that made these masks hide rather than dim),
#67 (the previous ring-sized-vs-band-sized comparison with nothing checking it), #58 (a different
bug in the same masks)

## What this changes

`buildFadeMask` pads every wedge, and the mask region, by `separatorWidth`. That swallows the live
separator's stroke and nothing else. The elapsed outline is the widest stroke an arc draws, it is
sized from the *band* where the separator is sized from the *ring*, and it escapes the wedge by
`arcEdgeStrokeWidth / 2 − separatorWidth` — painted at full strength on the side of the arc that has
not happened yet, and capping the look-behind edge the feather exists to soften.

After this, the pad is `max(separatorWidth, arcEdgeStrokeWidth(ring, band))`: the width of whichever
stroke is widest, keeping the whole-width slop the separator already had here (see the measured
question below). Three users move together — `padDegrees`, the `wedge()` radii, and the mask region
`box` — because widening the wedges without widening the box moves the clipping from the escaped
hairline onto the legitimate elapsed outline.

Nothing else about the arc moves: no colour, no stroke width, no angle.

## The numbers

Computed, not read off the source. `separatorWidth = max(1, ring × 0.03)`,
`arcEdgeStrokeWidth = max(1, min(band × 0.07, ring × 0.4))`, band 75.92, gap `max(2, band × 0.06)`:

| depth | ring | separator | outline | half-width | escapes by | pad after |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 75.9200 | 2.2776 | 5.3144 | 2.6572 | **0.3796** | 5.3144 |
| 2 | 35.6824 | 1.0705 | 5.3144 | 2.6572 | **1.5867** | 5.3144 |
| 3 | 22.2699 | 1.0 | 5.3144 | 2.6572 | **1.6572** | 5.3144 |
| 4 | 15.5636 | 1.0 | 5.3144 | 2.6572 | **1.6572** | 5.3144 |

Worst where there is least room: on the fixture's four-deep cluster the escaped hairline is 1.66
units, wider than the whole 1.0-unit separator that is the only thing between two adjacent arcs.

In the spec's own geometry (ring 48, band 48) the separator is 1.44, the outline 3.36, and the
escape 0.24 — which is why `event-arc.test.ts` asserting `radii === [OUTER + 1.44, INNER − 1.44]`
passed while encoding the same wrong assumption as the code.

## Half a stroke width is not enough — measured, and it decided this

Today's pad is a full `separatorWidth` for a stroke that straddles by half of it: 2× what the
geometry asks for. The arithmetic says half is sufficient, so half was tried first, and rendering
says otherwise. At exactly half, the wedge's antialiased edge coincides with the stroke's own, and
one device pixel of the outline survives at partial alpha — sampled at 8× device scale on the
fixture's four-deep cluster, `?now=01:30&freeze=1`:

| where | at pad = outline / 2 | at pad = outline |
| --- | --- | --- |
| inside the inner rim (own outline, `#22c55e`) | `#113e26`, α ≈ 0.26 | absent |
| in the inter-ring gap (neighbour's, `#ef4444`) | `#3f191c`, α ≈ 0.22 | absent |
| outside the outer rim (own outline) | `#0d1916`, α ≈ 0.06 | absent |

At 8× that is 0.079 units wide; at the wall's 1:1 it is the faint hairline the pad exists to remove,
and the radial cap at the arc's end is still a line. So the pad is the whole stroke width, which is
also the rule the code already had — pad by the stroke — with the stroke chosen correctly.

`max(sep, edge)` and not `max(sep, edge / 2)` for the same reason, and `max` rather than plain `edge`
because the two quantities both hit the `ARC_SEPARATOR_MIN = 1` floor on a very thin ring of a wide
band (ring 4 of band 76: separator 1, outline 1.6), where nothing may narrow the pad the separator
already needs.

The spent side keeps its outline intact: measured on the same render, 5.13 units at the inner rim and
5.21 at the outer, either side of pure band ground — the hollow elapsed treatment, untouched.

## Phases

1. **Geometry.** Rename `FadeMaskGeometry.separatorWidth` to a `wedgePad` that the caller computes
   from both strokes, move `edgeStrokeWidth` above the mask construction so it is available, and
   point `padDegrees`, `wedge()` and `box` at it.
2. **Tests.** Replace the two hard-coded `1.44`s with a pad derived from `arcEdgeStrokeWidth`, so
   the assertion asks the wedge to swallow *the widest stroke the arc draws* rather than a
   particular one. Add the assertion that would have caught this: at a stacking depth where the two
   quantities diverge, the wedge radii clear the outline's half-width.
3. **Render and measure.** Sample the radial colour profile across the band on the live side at
   `?now=01:30`, `?now=04:15` and `?now=11:00`, pinned, and confirm the two `#c35a57` bands at the
   rims are gone and the middle three are untouched.

## Not in scope

- **#58** — the feather and the drain gradient overwrite rather than compose. Same masks, different
  bug, and unaffected by the pad.
- The mask box's inscribed-circle clipping is a *consequence* of the pad and moves with it here;
  making the region a shape that does not clip a rim near the cardinals at all is not needed once
  the box grows with the wedges.
