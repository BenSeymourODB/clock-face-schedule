**Status:** in review
**Issue:** #27, #64 (halo retirement, folded in)
**Docs:** #26 (elapsed outlines — the load-bearing case), #15 (visibility must not depend on a
calendar-chosen colour), ADR 0007 (theme tokens), `docs/DESIGN.md`

# Resolve event colours to contrast-safe variants for the active theme

## What this ships

A pure `adjustForContrast(color, background, minRatio)` in `src/shared/clock/contrast.ts`, and its
application to the **elapsed-arc outline stroke** in `event-arc.ts`, so an outline's colour clears
4.5:1 against the dial background while keeping its hue. This closes the ⚫/🟤 (and marginally 🟣)
failures that #26's outlines currently lean entirely on the neutral halo to survive.

## Why this scope, and what is deferred

The issue names three colour sources — the emoji dots, Google's eleven, and arbitrary calendar
colours — and its body argues a single computed helper closes all three at once. A later comment
refines that toward a two-part mechanism (a ramp-position swap for the emoji palette, `adjustForContrast`
for the rest) and settles the floor at **4.5:1** (Material AA), client-side, lightening *and*
desaturating on dark.

This slice takes the **universal computed helper** for every source, because:

- It fixes the live legibility problem (#26 shipped; ⚫/🟤 outlines are effectively invisible today)
  in one code path, uniformly, and it is fully node-testable.
- The emoji ramp-swap needs a *theme* concept — "which ramp step per scheme" — that does not exist
  yet: there is only the dark theme. The ramp-swap produces designer-chosen values rather than
  algorithmic ones, which is an aesthetic refinement, not a correctness gain, and it is only
  motivated once a second theme ships.

Deferred, tracked separately:

- **Emoji ramp-position swap** (emoji → tonal ramp, theme picks the step) as a refinement over the
  computed adjustment for that one palette.
- **The light-theme variant** ADR 0007 leaves available — `adjustForContrast` is written
  theme-general (verified darkening on a white ground) so it is ready, but no light theme is wired.
- ~~Retiring the neutral halo.~~ **Folded in (#64).** Rendering the fixture with the halos removed
  showed the coloured outlines read cleanly — the ring gaps already separate a 3-deep elapsed
  cluster, so #26's "could be very noisy" worry does not materialise once the colours themselves are
  legible. The `var(--border)` halo, `ELAPSED_HALO_RATIO` and the `halo` part are gone; the outline
  now draws the arc alone.

  **The outline's weight did not grow into the width the halo vacated**, though that was tried first.
  At `ELAPSED_BORDER_RATIO = 0.12` (the halo's old ratio) `ELAPSED_STROKE_MAX_RATIO` clamps the
  stroke on a 3-deep ring (8.91 against a lone arc's 9.11) and a 4-deep one (6.23) — handing the most
  crowded arcs the thinnest outline, the exact inversion band-sizing exists to prevent. The existing
  "keeps its outline weight when stacking thins the ring" spec caught it. 0.082 is the widest ratio
  that stays uniform at the 4-ring cap, so there is no room worth taking and 0.07 stands.
- **Filled live arcs are left unchanged** (per the issue's "scope to strokes" decision):
  `readableTextColor` already guarantees their text, and adjusting fills would restyle the dial today.
  Rendering did show the limit of that reasoning — a filled ⚫ arc composites to `#1e2633`, **1.17:1**
  against the dial, so its *body* is invisible and only its title and the `var(--card)` separator
  reveal it. That is about an arc's readable extent rather than its text, it predates this change, and
  fixing it flips `readableTextColor`'s choice too, so it is filed as #66 rather than patched here.

## The helper

`adjustForContrast(color, background, minRatio = 4.5)`:

- Returns `color` unchanged when it already clears `minRatio`, or when either value is unparseable.
- Otherwise blends `color` toward the background's far extreme — white on a dark ground, black on a
  light one — by the **smallest** fraction (binary search) that clears the ratio. Blending toward a
  neutral extreme keeps HSL hue exactly, raises lightness, and sheds saturation: the "lighten and
  desaturate" Material prescribes for dark grounds, and its mirror on light.
- Built on the primitives already in `contrast.ts` (`relativeLuminance`, `contrastRatio`,
  `compositeOver`). Contrast is monotonic in the blend fraction, so the search is exact.

The dial background is a token (`var(--card)`), and `contrast.ts` needs a hex. Per the issue's
decision, the hex is declared in TypeScript (`event-arc.ts`, `DIAL_BACKGROUND`) with a comment in
`Styles.html` pointing at the same value — the trade `EVENT_COLORS` already makes, keeping the maths
pure and node-testable.

## Measured (against `--card` #16181d, floor 4.5:1)

| colour | orig | adjusted | r' | hue | sat |
| --- | --- | --- | --- | --- | --- |
| ⚫ gray-800 `#1F2937` | 1.21 | `#7b8189` | 4.52 | 215→214 | 28%→6% |
| 🟤 amber-800 `#92400E` | 2.50 | `#af724d` | 4.51 | 23→23 | 83%→39% |
| 🟣 purple `#A855F7` | 4.49 | `#a856f7` | 4.52 | 271→271 | (nudge) |
| 🔴🟠🟡🟢🔵⚪ | ≥4.72 | unchanged | — | — | — |

Only three of the nine emoji colours move on dark, and hue holds within ≤1° in every case.

## Phases

1. **Helper + tests.** `adjustForContrast` in `contrast.ts`, exported from `index.ts`; thorough unit
   tests in `contrast.test.ts` (unchanged-when-passing, each failing palette colour clears the floor,
   hue preserved, light-ground direction, unparseable passthrough).
2. **Wire into the renderer + test.** Apply to the outline stroke in `event-arc.ts`; assert in
   `event-arc.test.ts` that a failing colour's outline stroke is the adjusted value and clears the
   floor, and a passing colour's is untouched.
3. **Visual pass.** Build, serve `build/preview.html`, screenshot the elapsed ⚫ Assembly and the
   3-deep elapsed cluster; confirm the outline reads where it did not, and nothing near it regressed.

## Tests as guards

- The specific defect — an elapsed outline whose colour is invisible on the dial — becomes one
  assertion: the rendered `stroke` of `event-arc-outline-*` clears 4.5:1 against `DIAL_BACKGROUND`
  for the palette's worst colour (⚫).
