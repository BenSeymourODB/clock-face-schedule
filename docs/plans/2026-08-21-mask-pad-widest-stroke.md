# Pad every mask wedge by the widest stroke the arc draws

**Status:** done — shipped in [#131](https://github.com/BenSeymourODB/clock-face-schedule/pull/131)
**Issue:** [#114](https://github.com/BenSeymourODB/clock-face-schedule/issues/114)
**Docs:** [../DESIGN.md](../DESIGN.md) (ADR 0007), `src/client/render/event-arc.ts`

## The bug

`buildFadeMask` pads every wedge — and the mask's own region — by `separatorWidth`, on the stated
reasoning that "the wedge has to swallow the stroke, which straddles the path by half its width in
every direction". That is true of the stroke it was written against. The **elapsed outline** is
wider, and nothing compared the two:

```
separatorWidth     = max(1, ringThickness × ARC_SEPARATOR_RATIO)   — sized from the ring
arcEdgeStrokeWidth = max(1, min(band × 0.07, ring × 0.4))          — sized from the band
```

So the outline escapes the wedge by `arcEdgeStrokeWidth / 2 − separatorWidth`, and outside a wedge
the mask ground is opaque white — the sliver is painted at **full strength**, where the occlusion
was supposed to hide it outright. A live arc wears a hairline in the *elapsed* outline's colour, and
because the sliver traces the arc's closed path it draws a hard radial cap at the window's
look-behind edge — the one failure `buildFadeMask`'s own docstring says the mask exists to deny.

Measured off the fixture, per depth of stack:

| depth | separator | outline | half-width | escapes by |
| --- | --- | --- | --- | --- |
| 1 | 2.2776 | 5.3144 | 2.6572 | **0.3796** |
| 2 | 1.0705 | 5.3144 | 2.6572 | **1.5867** |
| 4 | 1.0 | 5.3144 | 2.6572 | **1.6572** |

**Worst where there is least room.** `ELAPSED_BORDER_RATIO` is band-sized on purpose (#67), while
`separatorWidth` is ring-sized, so the gap widens with depth: on the four-deep cluster the escaped
hairline is 1.66 units — wider than the entire 1.0-unit separator that is all the design puts
between two adjacent arcs.

## The fix

`separatorWidth` was doing two jobs in `FadeMaskGeometry`: the width the live separator strokes, and
the pad every wedge and the mask region are built from. Only the second belongs here, and it is a
property of *whichever stroke is widest*, not of one particular stroke:

```ts
const maskPad = roundCoord(Math.max(separatorWidth, edgeStrokeWidth));
```

Three users move together, and they have to move together:

- `padDegrees` — the angular reach past each boundary, so the radial caps are swallowed;
- the `wedge()` radii — so the radial overshoot is swallowed;
- the mask region `box` — which today hides the outer overshoot within 2.9° of each cardinal by
  accident. Widen the wedges without widening the box and the legitimate elapsed outline gets
  clipped there instead.

`separatorWidth` stays in the renderer for the separator's own `stroke-width`; the geometry object
carries `pad` instead.

### Why the `max` is a guard and not a live branch

With `ring ≤ band` by construction, `arcEdgeStrokeWidth ≥ min(ring × 0.07, ring × 0.4) = ring ×
0.07 > ring × 0.03 = separatorWidth`, so the outline is always the wider of the two and the `max`
never picks the separator. It is kept because the alternative is a comment asserting the inequality,
and this repo has been wrong before about exactly this pair of quantities.

### The whole width, not the half the geometry needs — decided by rendering

A stroke straddles its path by half its width, so `edgeStrokeWidth / 2` is the geometric minimum.
Rendering says it is not enough. Radial profile at 8× device scale through 🟢 Aftercare's live side
at `?now=11:00&freeze=1`, reading pixels rather than source:

| pad | what is painted outside the arc |
| --- | --- |
| `separatorWidth` — today | **0.28 units of `#22c55e`**, the arc's full-strength colour, at both rims |
| `max(sep, edge) / 2` | a **0.08-unit** antialiased step at the wedge's own edge |
| `max(sep, edge)` | **nothing** — clean `#0c0e12` from the separator outward |

At exactly half, the mask's own edge is antialiased and the stroke's outermost ink coincides with
it, so a fraction of a pixel survives. The full width is the same 2× slack the original code applied
to the separator, moved onto the right stroke — and it is what leaves the ground clean.

The pad therefore goes from 1.0–2.2776 to 5.3144, so the ramp starts about 1.04° further past each
boundary than it did (at r = 292). That extension always lands on ground the same mask already
covers: an occlusion's extension runs *away* from the seam, and a ramp's runs back into the side its
own occlusion has blackened.

### What the wider region buys back

The mask region grows with the wedges, and the issue's second finding is that the old region was
clipping the *legitimate* elapsed outline within 2.9° of each cardinal. Measured at `?now=03:00`,
90°, on the 🟡 arc's outer rim: the outline's ramped colour ran to **292.94** before and to
**294.54** after — 1.6 units of outline that were being cut off now render. The same ray also loses
1.5 units of full-strength `#eab308` at its inner rim, which was the escaped hairline.

## Tests

`event-arc.test.ts`'s `what the masks actually hide` asserted the wedges are drawn at exactly the
radii that let the outline out — `WEDGE_RADII = [OUTER + 1.44, INNER - 1.44]`, where 1.44 is that
spec's `separatorWidth` and the outline is 3.36 units. Nine green assertions encoding the code's own
wrong premise, which `CLAUDE.md` names as this repo's sharpest lesson.

- The spec's pad is derived from `arcEdgeStrokeWidth` rather than written down, so a stroke that
  outgrows the pad cannot pass again.
- A new case asserts the property over **stack depths**, where the two quantities diverge: given a
  `bandThickness` wider than the ring, the wedge still swallows the band-sized outline.
- A new case asserts the **mask region** contains the outline's outer edge, which is the half of the
  fix a wedge-radius assertion cannot see.

## Not in scope

- **#58** — the feather and drain gradients overwrite rather than compose where they overlap. Same
  masks, different bug.
- **#115** — the dial renders at 600 px, so 0.38 units is 0.38 px on the board. That is why this
  read as a faint border rather than as an edge, and it is that issue's decision to make.
