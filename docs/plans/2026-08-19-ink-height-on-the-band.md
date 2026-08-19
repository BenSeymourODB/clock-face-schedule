# Measure the band's radial clearances against real ink, not the em box

**Status:** in review
**Issue:** [#78 — Every radial clearance on the band is measured to the em box, and real ink reaches
0.5 units past it](https://github.com/BenSeymourODB/clock-face-schedule/issues/78)
**Docs:** `docs/DESIGN.md` (ADR 0003), `src/shared/clock/arc-title-layout.ts`

## What this is for

Everything that keeps curved text off a stroke on the band models a line as occupying exactly
`fontSize` radially — `±fontSize / 2` around its baseline point. That is what `dominant-baseline:
central` positions, but it is not what the text covers: a face's ascent plus descent is larger than
its em, so the ink reaches past the box on both sides. Every clearance derived from the box is
therefore optimistic, by an amount that scales with font size and so bites hardest exactly where the
room is scarcest.

The visible consequence is already on the dial and nothing caught it: the two curved lines of a
stacked title **overlap each other**.

## Measured

Chromium (the preview's own engine), `font-family: system-ui, -apple-system, sans-serif`, measured at
`font-size: 1000` so the ratio is read to three decimals rather than through `getBBox`'s integer
rounding. `aboveAnchor` / `belowAnchor` are how far ink reaches either side of the point
`dominant-baseline: central` anchors to, in ems.

Character sets: printable ASCII, the Latin-1 and Latin Extended-A accented forms a calendar title
plausibly carries, and the emoji the dial inlines into titles (#23).

| resolved face | em box | above anchor | below anchor | ink ratio | worst glyphs |
| --- | --- | --- | --- | --- | --- |
| `system-ui` → DejaVu Sans | 1.164 | 0.591 | 0.596 | **1.192** | `Á` / `_` |
| Liberation Sans | 1.117 | 0.591 | 0.597 | **1.193** | 🎮 / 🎮 |
| FreeSans | 1.000 | 0.668 | 0.550 | 1.337 | `Å` / 🎮 |

Two things fall out that the issue did not have:

- **The emoji is the binding constraint on two of the three faces, and it is font-independent.**
  Emoji come from the colour-emoji fallback, not from the text face, so ±0.59 em is a floor the dial
  carries whatever `system-ui` resolves to. That is a much better warrant for a static constant than
  "an approximation of a face we do not control" — the dial *does* control that it inlines emoji.
- **The em box is not a safe bound even as an approximation.** On every face measured, real ink
  reaches past the box that `getBBox` reports: accented capitals overshoot the ascent, and the emoji
  fallback overshoots both.

### The defect, on the dial as it stands

Extracted from `build/preview.html` — the baseline radii of each rendered two-line stack against the
ink those two lines actually cover:

| arc | font size | baseline gap | ink needed | clear |
| --- | --- | --- | --- | --- |
| 🍽️ Lunch + "50 min" | 21.26 | 23.38 | 25.34 | **−1.96** |
| 🎂 Reading / and Snacks | 21.26 | 23.38 | 25.34 | **−1.96** |
| 🧸 🪀🎈 / Free Play | 21.26 | 23.38 | 25.34 | **−1.96** |

`TITLE_LINE_OFFSET_RATIO = 0.55` puts the baselines `1.10 em` apart and the ink covers `1.19 em`, so
the "hair to spare" its comment claims is a 0.09 em overlap. Every two-line stack on the fixture is
affected, including #35's duration line.

For contrast, the floating label's `LINE_HEIGHT_RATIO` is **1.4** — comfortably clear of the same ink
at 0.21 em spare. The two surfaces disagreed and the card was the one that was right.

## Chosen direction

The first of the issue's four options: **one declared constant, used by every radial gate on the
band**, with `TITLE_LINE_OFFSET_RATIO` re-derived from it rather than left as a chosen number.

- `INK_HEIGHT_RATIO = 1.2` — the measured 1.192/1.193 rounded up. Static, and honest in its comment
  about being a bound on the faces we can measure rather than a fact about the smart board's.
- `TITLE_LINE_OFFSET_RATIO` becomes `(INK_HEIGHT_RATIO + TITLE_LINE_GAP_RATIO) / 2` = **0.65**,
  preserving the 0.10 em of intentional slack that 0.55 was chosen for against a 1.0 em model. The
  relationship the old comment asserted ("2 × 0.55 clears them with a hair to spare") becomes
  arithmetic the code performs instead of prose the code contradicts.

Rejected, per the issue's own reasoning:

- **Measuring at startup.** Accurate for the real face, but `pack-lines.ts` is explicit that this
  pipeline is measurement-free and node-testable; the ratio would have to arrive as a parameter with
  a static default, which is the static constant plus a parameter nobody passes.
- **Raising `EDGE_CLEARANCE`.** Wrong shape — the overshoot scales with font size, the clearance is
  absolute.
- **Doing nothing.** The overlap above is not a hypothetical limit of the model; it is on the dial.

## Scope

Only the band. The floating label's line spacing is already correct (1.4 em) and its card height
leaves the outermost line 0.10 em plus padding, so nothing there is measured to the em box.

Of the three gates the issue lists, `main` carries two: `fitDurationLine`'s radial gate and
`TITLE_LINE_OFFSET_RATIO` itself. The third — `computeArcTitleLayout`'s `reachRatio` — arrives with
#67/#77, which is still open. `INK_HEIGHT_RATIO` is exported so that cap becomes
`TITLE_LINE_OFFSET_RATIO + INK_HEIGHT_RATIO / 2` on merge, a one-line change.

## Cost, computed before making it

`fitDurationLine`'s half-height goes from `fontSize × 1.05` to `fontSize × 1.25`. On the fixture's
lone-arc case (band 75.92, font 21.26, elapsed outline reach 3.66):

| | half-height | outward margin | inward margin |
| --- | --- | --- | --- |
| before | 22.32 | 11.98 | 11.98 |
| after | 26.57 | 7.73 | 7.73 |

So the duration line survives on a lone arc, which is the only depth it is drawn at — the legibility
gate already keeps it off stacked rings. Nothing is lost on the fixture; the stacks simply stop
overlapping.

## Phases

1. **Shared geometry** — declare `INK_HEIGHT_RATIO`, derive `TITLE_LINE_OFFSET_RATIO`, apply it to
   `fitDurationLine`'s radial gate. Tests: the inter-line separation property that was false, and a
   `fitDurationLine` case that the em-box model admits and the ink model rejects.
2. **Visual pass** — rebuild, re-extract the baseline gaps from the preview, screenshot, and check
   the two-line stacks and the lone arc's duration line against their neighbours.

## Deferred

- **#77's `reachRatio`** cannot adopt the constant here because it is not on `main` yet. Noted in
  the PR.
- **Faces the container cannot install** (Segoe UI on a Windows board, SF Pro, Roboto) are not
  measured. The emoji floor covers the binding case, but the constant is a bound over what was
  measurable, and the comment says so.
