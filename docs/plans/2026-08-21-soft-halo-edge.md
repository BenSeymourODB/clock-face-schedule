# Soften the AM/PM halo's edge, so a hand fades into the label rather than being notched

**Status:** in review
**Issue:** none — a follow-up asked for directly, on the back of #113
**Docs:** `docs/DESIGN.md` (ADR 0009 — the millimetre scale), `CLAUDE.md` (the pinned-dial caveat)

## What this changes and why

#113 gave the indicator a halo in the shape of its own glyphs, mounted above the hands. It works, but
its edge is hard: a hand crossing the label stops at a glyph-shaped notch. Blurring the halo's outer
boundary lets the hand fade into the label instead — the same date-window reading, with the seam
softened.

Purely an appearance change. Nothing about legibility improves, and the section below is honest that
at today's dial size almost nothing about it is visible either.

## Why it is four lines and not a refactor

The two-element structure from #113 is untouched: a `<defs>` carrying one `<filter>` goes in beside
the halo, and the halo gains a `filter` attribute. `event-arc.ts` already builds `<defs>`, `<mask>`
and `<linearGradient>` through the same `svg()` helper, so this is an existing idiom rather than new
machinery, and `setTime` does not change at all.

## The contrast question, which is the one that could have killed it

A blurred halo is semi-transparent at its boundary, so the ground under the text is no longer pure
`var(--card)` — which is the whole reason the halo exists. But **a blur erodes an opaque shape from
the outside**, and the glyphs sit a full dilation inside it. Alpha at the glyph edge is `Φ(dilation/σ)`:

| σ | halo alpha at the glyph edge | text contrast there |
| --- | --- | --- |
| 1 | 1.0000 | 6.98:1 |
| 2 | 0.9795 | 6.66:1 |
| 3 | 0.9135 | 5.57:1 |
| 4 | 0.8466 | **4.49:1** — under the 4.5:1 floor |

So σ up to about 3 is nearly free and σ = 4 is the hard ceiling. Shipped at **σ = 1.02 units**
(`PERIOD_HALO_BLUR_RATIO = 0.005` of the face radius), which holds the full 6.98:1.

`--muted-foreground` on a bare `--card-foreground` hand is 2.31:1 for comparison — the number the
halo exists to avoid, and the one a careless σ would walk back toward.

## The halo has to widen to pay for it

The blur spends part of the dilation softening the edge, so the fully-dark run between the hour hand
and the "P" stem — the measurement #113 sized the halo by — drops from three pixels to two at the
old ×2. Measured on the board's 600-px raster at 18:30:

| halo | σ | scanline between hand and stem | fully-dark px |
| --- | --- | --- | --- |
| ×2 | 0 (as merged) | `g#G...-` | 3 |
| ×2 | 1 | `gGg-..-` | 2 |
| **×2.5** | **1** | `gg-...-` | **3** |
| ×3 | 1 | `--....-` | 4, but the hand has faded out entirely at this row |

**×2.5.** And ×3 is barred from the other direction too: it widens the band to 25.14 units, which
drops the 1-hour scale's hour-hand stub to 18.09 against the 18.40 floor `RADIUS.periodIndicator` was
chosen for — a fail, not a squeeze.

| halo | band width | band outer at 0.28 | 1-hour stub | vs the 18.40 floor |
| --- | --- | --- | --- | --- |
| ×2 | 21.05 | 67.76 | 20.13 | +1.74 |
| **×2.5** | 23.10 | 68.78 | **19.11** | **+0.72** |
| ×3 | 25.14 | 69.80 | 18.09 | **−0.31** |

So the soft halo has a genuinely narrower geometric window than the hard one did: ×2.5 is the only
multiple that both restores the separation and clears the stub floor. Worth knowing before anyone
reaches for a larger blur — a bigger σ needs a bigger dilation, and the dilation has run out of room.

## Two filter attributes that fail silently

Both are non-default, both are asserted, and both fail the way `CLAUDE.md` warns about — a wrong
value renders something plausible and logs nothing.

- **The filter region.** SVG defaults it to the bounding box inset by −10%/+10%, which is narrower
  than the blur reaches, so the blur is clipped into a straight edge — precisely the hard edge this
  change exists to remove. Set to −50%/200%.
- **`color-interpolation-filters`.** SVG 1.1 defaults to `linearRGB`, which is not the space the
  ramp above was measured in. It happens to render identically here, because what is being blurred
  is a single opaque colour against transparency, but the table is stated in sRGB so the attribute
  says sRGB rather than relying on a coincidence.

## What it does not buy, stated plainly

At the board's own raster the effect is **170 of 9000 pixels** changed by more than 8/255 in a
100×90 crop — 1.9%, mean delta 0.8/255. The dial renders 600 units into 600 px (#115), so σ = 1.02
units is a **one-pixel** fade, and the indicator's own type runs out of legibility at 3.08 m
(ADR 0009's rule on #116's millimetre scale). Nobody at the back of a classroom will see this.

It is in for the near view and for later: if #115 is fixed and the dial renders at the size ADR 0009
assumes, one unit becomes 1.58 px and the same ratio becomes a visible 1.6-px fade. Expressing the
blur as a fraction of the face radius rather than a length is what makes that automatic.

## Tests

Five, all confirmed to fail on their own fault:

1. The halo references the filter by id, and the filter lives in a `<defs>`.
2. σ is a fraction of the face radius — asserted by doubling the radius and checking σ doubles, so a
   hard-coded length cannot pass.
3. The filter region is widened past the clipping default.
4. `color-interpolation-filters` is stated, not inherited.
5. σ stays well under the dilation, which is the property holding the text near 7:1.

Plus the updated `PERIOD_HALO_MULTIPLE` assertion at ×2.5, and #113's stub test — unchanged, and the
thing that would have caught ×3.
