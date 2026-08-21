# The dial's size comes from the display, not from its own attribute

**Status:** in review
**Issue:** [#115](https://github.com/BenSeymourODB/clock-face-schedule/issues/115)
**Docs:** ADR 0009 (the board's spare width, allocated once), ADR 0007 (the five CSS custom-property
names), `CLAUDE.md` — "a pinned dial is 58% larger than the board's, until #115 is fixed"

## The defect, reproduced

`#115` reports the dial rendering 600 CSS px on any display. Reproduced from `build/preview.html`
under headless Chromium before changing anything, on five viewports × two states:

| viewport | notice | rendered | px/unit |
| --- | --- | --- | --- |
| 1920×1080 | `Sample events — not a real calendar` (439.8 px) | **600** | 1.000 |
| 1920×1080 | pinned, `Clock frozen at … · Sample events …` (1021.7 px) | 950.39 | 1.584 |
| 1280×800 | 325.8 px | **600** | 1.000 |
| 1280×800 | pinned, 756.8 px | 704.00 | 1.173 |
| 3840×2160 | 444.5 px | **600** | 1.000 |
| 3840×2160 | pinned, 1032.4 px | 1032.42 | 1.721 |
| 1024×768 | 312.5 px | **600** | 1.000 |
| 1024×768 | pinned, 725.9 px | 675.83 | 1.126 |
| 1080×1920 | 439.8 px | **600** | 1.000 |
| 1080×1920 | pinned, 1021.7 px | 950.39 | 1.584 |

Exactly the issue's own numbers, and the mechanism with them: the rendered width tracks
`min(88vmin, max(600, notice width))`. `#display` is a grid with no `grid-template-columns`, so its
single column is auto-sized to max-content; `#dial`'s own contribution to that is the SVG's
`width="600"` attribute, because a percentage behaves as `auto` during intrinsic sizing. So `100%`
resolves against a track the dial itself sized, `min(88vmin, 600)` picks 600, and the rule is a fixed
point at its own intrinsic width. The only thing that breaks the cycle is a sibling wider than 600 —
which is the status line, and only when a notice is long.

Two consequences, both in the issue and both confirmed above: the dial is the same size on a 4K board
as on a laptop, and it **changes size when the network hiccups**, because the notice that appears is
an input to its geometry.

## The decision this rests on

`#115`'s open decision is *"which sizing rule, and it is ADR 0009's question rather than a CSS
detail"*. ADR 0009 is accepted and answers it:

> The dial keeps the board's full height. It is **centred in the width that remains after the
> panel**, and the panel is **180 units wide, on the right**.

That is the fourth row of the issue's candidate table, named there as "what ADR 0009 actually asks
for". The ADR's closing paragraph points back at #115 and says the sizing rule is part of the
allocation rather than a detail beneath it — so implementing the ADR's rule is the allocation being
applied, not the CSS being patched in isolation.

`88vmin` is not that rule and predates the ADR. It gives away 12% of the height for nothing and has
no term for the panel.

## Constraints any answer has to keep

- **Read the display, never the SVG's own attributes.** The attributes are what the intrinsic sizing
  latched onto; the fix has to hold whether or not they are there, which is the property worth
  guarding.
- **The notice must not be an input to the dial's width.** That coupling is the 600 → 950 jump.
- **Nothing may overflow.** A portrait or near-square display must clamp on width rather than paint
  off the frame; `overflow: visible` is load-bearing for floating labels and cannot be traded away.
- **ADR 0007's five custom-property names are untouched.** This is layout, not colour.
- **The geometry stays DOM-free.** `analogClock` keeps taking a `size` in viewBox units and knowing
  nothing about the page; the mapping from units to pixels is CSS's job, which is also what keeps
  #30's `labelMargin` a host-owned parameter rather than a measurement inside the renderer.

## The shape of the fix

Five edits, all in `static/Styles.html`:

1. **`#display` gets a definite single column** — `grid-template-columns: minmax(0, 1fr)` — so a
   percentage width on `#dial` resolves against the display and not against a track the dial sized.
   This alone is what stops the notice's text length reaching the dial's width.
2. **`#display` gets definite rows** — `grid-template-rows: minmax(0, 1fr) auto`, and `height: 100vh`
   in place of `min-height` — so the dial's row is a definite height the dial can take a percentage
   of, and the notice takes height from the dial rather than width. `minmax(0, 1fr)` and not a bare
   `1fr`: an `fr` track is floored at its content's own height, and the dial's content wants to be as
   tall as the column is wide, so the track grew to 1877 px on a 1080-tall board and the page
   scrolled. Measured, not reasoned about — the first attempt did exactly that.
3. **The grid `gap` moves onto `#status` as a margin**, so `display: none` takes it away with the
   notice, and the margin is the label frame rather than 1.5rem — the dial is flush against that row
   and a card at six o'clock reaches as far past the viewBox as one at twelve. A gap could not do
   either job: it is charged between tracks whether or not the second holds anything.
4. **`#dial` is sized from that row, and the drawing fits the box.** `#dial svg` takes both axes at
   100% and `preserveAspectRatio` (default `xMidYMid meet`) scales the square drawing to the shorter
   one and centres it on the other. That is "keep the board's height, centre in the remaining width"
   on any landscape board, and it clamps to the width on a portrait one, with no distortion either
   way and no dependence on the SVG's own attributes.
5. **ADR 0009's panel is left to #39 as a grid column**, and deliberately not reserved here by a
   width expression. A `--panel-share` seam was built and then removed: the panel's pixels are a
   share of the dial (180 against 600) while the dial is sized from the *height*, so a reserve taken
   out of the dial's box either mis-centres the drawing inside it — measured 65 px out at share 0.3
   on 1920×1080, with 130 px of dead space — or has to know a number CSS cannot see. A second grid
   column has neither problem: this column becomes the remainder, and "centred in the width that
   remains after the panel" is then the same sentence as the ADR's, with nothing to keep in step.

## The frame the labels need, which the change makes binding

The issue's three "worth settling" items include the `2vmin` padding, "which is 21.6 px a side at
1080 and unexplained". Measuring it turned it into the substantive part of this change.

`2vmin` was never the constraint. A 600 px dial centred in a 1080 px page had **240 px of slack**
above it, and that slack is what floating labels — which paint outside the SVG box by design — were
using. Sizing the dial to the board takes the slack away, so the padding becomes the whole of the
allowance. Rendered at 1920×1080 with the sizing fix and the old padding, cards leave the viewport:
20.3 px above the frame on `?now=03:00&freeze=1`, 22.1 px below on `?scale=1h`.

How far out a card may go is bounded by the renderer, not by the fixture:

- **Horizontally, 50.4 units.** `labelWidthLimit` holds a card's *edges* within
  `clockBox.width × OVERFLOW_RATIO` = 58.4 units of the 584-unit box, whose own edge is inset 8
  units from the viewBox — so 58.4 − 8.
- **Vertically, 49.9 units.** A four-line card (`MAX_LINES` 3, plus #35's duration line) is 104.1
  units tall at the dial's 17.52-unit label font, and its centre sits on the locus at
  `outerRadius × 1.02` = 297.84 — so 297.84 + 52.06 − 300.

Rendered, the worst any sweep of long-titled events reaches is **49.37 units on the 12-hour dial and
49.89 on the 1-hour one**, against the fixture's own 25.4 — which is why the fixture passing is not
evidence.

A frame of `A` per cent of the shorter viewport axis leaves `600A / (100 − 2A)` units beside a dial
sized from what is left, so covering 50.4 needs **7.19%**. `7.3vmin` provides 51.3 units, and the
0.9 of cushion costs 2.2 px of dial on a 1080-tall board.

Paying for it is a real cost, and it is the one number to retune if #39 allocates differently:

| frame | dial at 1920×1080 | share of height | clips a card? |
| --- | --- | --- | --- |
| `2vmin` (today's) | 1036.8 | 96.0% | yes — at 12, 6, and on the 1-hour dial |
| `4vmin` | 995.8 | 92.2% | only past the fixture's worst case |
| **`7.3vmin`** | **922.3** | **85.4%** | **no** |

A clipped card wins the argument: a card exists *because* its title did not fit its arc, so the dial
holds no other copy of it.

## As built, measured

Headless Chromium against `build/preview.html`, `getScreenCTM()` for px-per-unit so the figure is
the drawing rather than its box:

| viewport | before | after (notice hidden) | after (notice up) |
| --- | --- | --- | --- |
| 1920×1080 | 600 (1.000 px/unit) | **922.3** (1.5372) | 807.9 (1.3465) |
| 1280×800 | 600 | **683.2** (1.1387) | 598.4 |
| 3840×2160 | 600 | **1844.7** (3.0744) | 1615.9 |
| 1024×768 | 600 | **655.9** (1.0931) | 574.5 |
| 1080×1920 | 600 | **922.3**, width-bound | 922.3, width-bound |

Two properties that were the point, and hold in the table: the dial scales with the board, and the
two "after" columns differ by the notice's *height* only — a short notice and a 1021.7 px one give
the same dial, where before they gave 600 and 950.

No card leaves the viewport in any of the five viewports × seven pinned states × notice shown/hidden.

## What is deferred, and why

- **The panel's 180 units** stay zero until #39 allocates them. The property is the seam.
- **The dial still loses 12% of its height when a notice is up** (922.3 → 807.9 at 1920×1080): the
  notice's own line, plus the label frame above it, plus the page's frame below it.
  Width is fully decoupled; height is not, because the notice is a grid sibling and a long one
  wraps. Reserving a fixed row for a notice that may be one line or two is a guess, and the
  alternative — taking the notice out of flow — puts it over the 6 o'clock arcs on a height-bound
  dial. On a healthy board the notice is hidden, so 922.3 is the operative figure.
- **Reclaiming the label frame by clamping cards instead of framing them (#121).** `clampLabelPosition`
  already holds a card's edges inside the box horizontally and only its *centre* vertically; making
  the vertical clamp edge-based would let the frame shrink toward `2vmin` and hand the height back
  to the dial. That changes where cards land, over the band and the numerals, which is #30's and
  #98's territory rather than this issue's.
- **A CI guard on rendered size.** #115 is explicit that nothing in the client suite can catch this:
  jsdom has no layout, so `getBoundingClientRect` is 0 everywhere. The measurement is taken here with
  headless Chromium and recorded in the PR; a *standing* guard needs a browser in the runner, which
  is #101's subsystem and its three open decisions.

## The test that missed it, and the one landed instead

Nothing tested laid-out size and nothing in vitest can. What vitest *can* hold is the half of the
property that is structural rather than laid out — the two facts that, together, were the mechanism:

- `#display` declares a definite column, so no auto track can be sized from an item's max-content.
- `#dial`'s width expression does not resolve a percentage against a track the dial contributes to.

Both are assertions over `static/Styles.html`, which is already parsed and asserted on by
`src/client/preview-template.test.ts`'s neighbours. They are weaker than a rendered measurement and
are labelled as such; the rendered numbers live in the PR.
