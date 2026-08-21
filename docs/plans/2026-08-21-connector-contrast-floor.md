**Status:** in review
**Issue:** [#93 — A floating label's connector is 1.15:1 on the page for ⚫, so the line tying a card
to its arc is not there](https://github.com/BenSeymourODB/clock-face-schedule/issues/93)
**Docs:** #66 (the same floor on a filled arc's body, and where `adjustCompositeForContrast` comes
from), #74 (the ground the band and the page actually have), #27 (the 4.5:1 stroke floor, and why
this is not it), #30 / #88 (floating-label geometry, which owns where this line *is*), #29 (the
card's own colour treatment), ADR 0007 (theme tokens), ADR 0003 (nothing derived server-side)

# Floor the connector's colour, so the line tying a card to its arc exists

## The defect

`floating-label.ts` strokes the connector in the authored event colour at `CONNECTOR_OPACITY = 0.6`
over the page's `#0c0e12`. Composited, four of the nine colour-dots fall below WCAG 1.4.11's 3:1
floor for a graphical object, and the worst two are not faint lines but no line:

| colour | connector, composited | vs the page |
| --- | --- | --- |
| ⚫ gray-800 `#1F2937` | `#171e28` | **1.15** |
| 🟤 amber-800 `#92400E` | `#5c2c10` | **1.68** |
| 🟣 purple-500 `#A855F7` | `#6a399b` | **2.46** |
| 🔴 red-500 `#EF4444` | `#96393b` | **2.48** |
| 🔵 blue-500 `#3B82F6` | `#28549b` | **2.60** |
| 🟢 green-500 `#22C55E` | `#1a7c40` | 3.68 |
| 🟡 yellow-500 `#EAB308` | `#91710c` | 4.20 |
| ⚪ gray-100 `#F3F4F6` | `#97989b` | 6.70 |
| 🟠 orange-500 `#F97316` | `#9c4a13` | 3.12 |

Reproduced with `adjustCompositeForContrast`'s own primitives rather than quoted from the issue; the
issue's table omitted 🔴, which fails at 2.48. The connector exists to say *which arc this card
belongs to*, and a card whose connector cannot be seen is a name with no event attached.

## The fix

One call, the same shape as #66's `arcFillColor`:

```ts
export function connectorColor(color: string): string {
  return adjustCompositeForContrast(color, BAND_BACKGROUND, CONNECTOR_OPACITY, CONNECTOR_MIN_CONTRAST);
}
```

Reusing the arc's floored fill would under-correct — 0.85 mixes back less ground than 0.6 does — so
the connector needs its own call at its own alpha. `BAND_BACKGROUND` is `--page`'s hex and the only
place it is spelled (Styles.html points at that name); the connector runs across the page, so it is
the right ground and not merely the nearest constant.

### Why 3:1 and not #27's 4.5:1

Measured over the palette plus Google's eleven plus the fallback:

| floor | palette colours moved | what they become |
| --- | --- | --- |
| **3:1** | 5 of 9 — 🔴 🔵 🟣 ⚫ 🟤 | `#f26b6b` `#5895f7` `#b975f9` `#90959b` `#bd8b6c` |
| 4.5:1 | **8 of 9** — everything but ⚪ | `#f8b1b1` `#fcb380` `#edbd27` `#6cd894` `#a3c4fb` `#d8b4fb` `#c0c3c6` `#d9bdab` |

At 4.5:1 all but one connector becomes a pastel wash of itself, which costs the element its *other*
job: matching its arc's colour is half of how a viewer pairs the two. 1.4.11's floor for a non-text
graphical object is 3:1 — the same reasoning, and the same number, #66 settled for a filled arc's
body. It leaves the connector at 3:1 against the page exactly where the ⚫ fill it points at is also
floored to 3:1, so the tie is as visible as the thing it ties to.

## What rendering found, and what it means for this change

**No connector on this dial draws a single visible pixel, and none can.** Measured on the built
preview across the default view, all five pinned times in README's table, and both fixtures:

| state | connectors | anchor inside its own card | visible units |
| --- | --- | --- | --- |
| default (12h) | 4 | 4 | **0** |
| `?now=03:00` | 5 | 5 | **0** |
| `?now=01:30` | 4 | 4 | **0** |
| `?now=04:15` | 4 | 4 | **0** |
| `?now=08:30` | 3 | 3 | **0** |
| `?now=11:00` | 5 | 5 | **0** |
| `?scale=1h` | 3 | 3 | **0** |
| `?scale=1h&now=04:15` | 1 | 1 | **0** |

The cause is arithmetic rather than accident. `analog-clock.ts` puts a card's centre at
`labelRadius = outerRadius × 1.02`, so the card centre is `0.02 × outerRadius` — **5.84 units** on a
600-unit dial — beyond the anchor on the band's outer edge. The card's own radial half-extent is at
least its half-height, `(labelFontSize × 1.4 + 2 × RECT_PADDING_Y) / 2 = 0.042 × outerRadius + 3`,
which exceeds `0.02 × outerRadius` at **every** dial size; at 3 and 9 o'clock the relevant extent is
the half-*width*, which is larger again. So the anchor is always inside the card, the card's rects
are painted after the connector inside the same `<g>`, and the line is always covered.

That is #30 / #88's geometry and not this change's to move — filed as #117 rather than widened into
this one, with the assertion that would have caught it. It does mean the honest claim for this PR is narrow, and it is stated that
way: **this change makes the connector correct, not yet visible.** The render below shows it on the
real dial with `LABEL_RADIUS_RATIO` temporarily raised — an experiment, not a committed change —
because that is the only way to see the element at all today.

Sampled off the rendered preview, `⚫ Assembly`'s connector at every tenth of its length sits on
`#c7cbd1` — its own card's washed field — while the two colours the issue names are the ones a
viewer would see if the line were exposed.

Two consequences worth stating as figures rather than as prose:

- **`?now=04:15&freeze=1` before and after differs by 16 pixels** of 5,184,000, none by more than
  17/255 — sub-pixel antialiasing where a stroke's half-width pokes past a card's corner. That is
  the whole visible effect of this change on the dial as it stands.
- With `LABEL_RADIUS_RATIO` raised to 0.25 purely to expose the element, the same pin gives all four
  connectors clear of their cards, and the rendered pixels carry the defect and the fix:

| connector | before, sampled | after, sampled |
| --- | --- | --- |
| ⚫ Assembly | `#171e28` on `#0c0e12` — **1.15** | `#5a5e64` — **2.96** |
| ⚫ Staff Debrief | **1.15** | **2.96** |
| 🔵 Yoga | `#27539b` — **2.57** | `#395e9b` — **2.99** |
| 🔵 Parent Teacher … | **2.57** | **2.99** |

The sampled figures land 0.01–0.04 under the computed 3.00/3.03 because the peak pixel of a
1.4-unit hairline is already blended a little toward the ground; the attribute is exact and the
paint is what a 8-bit screen can do with it.

## Scope

- [x] `connectorColor` in `floating-label.ts`, exported so a spec asks what is painted rather than
      keeping its own copy of the floor and the alpha (the mistake #74 was)
- [x] The connector strokes it; the card's wash and border keep the authored colour, which is
      correct — they sit on the light `--card-foreground` field, not on the page
- [x] Targeted specs: the palette's five failing colours are floored, the four that pass are
      returned untouched, and the *painted* ratio clears 3:1 for every colour the dial can receive
- [x] One spec pinning that the connector is floored while the wash and border are not, so a later
      "tidy-up" cannot quietly floor all three and shift the card's colour
- [x] Render the fixture before and after; record that the element is occluded, and show the change
      on the dial with the locus temporarily widened

## Not in scope

- **The occlusion**, which is `LABEL_RADIUS_RATIO` and belongs with #30 / #88 — **#117**.
- **The card's wash and border**, which measure 1.000–1.476:1 and 1.00–2.14:1 against the field they
  sit on — ⚪ washes to `#f2f4f8` exactly, so a light event's card carries no colour at all. A
  different element on a different ground with a design decision attached, so **#118** rather than
  folded in. Note it contradicts the premise in #93's body that "the card's own linework is fine":
  #29's 10.9:1 figure is the card's *text* on the washed field, not its wash or its border.
- **#30's collision work**, which will move this line. The issue asked whether to wait for it; the
  answer taken is no, because a colour is not a position.
