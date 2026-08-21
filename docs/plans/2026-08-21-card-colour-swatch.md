**Status:** done — shipped in [#160](https://github.com/BenSeymourODB/clock-face-schedule/pull/160)
**Issue:** [#118 — A light event's card carries no colour at all — ⚪ washes to its own field exactly
(1.000:1) and its border reads 1.00 inside](https://github.com/BenSeymourODB/clock-face-schedule/issues/118)
**Docs:** #30's decision comments (the swatch's 8-unit width and 4-unit gap, and the character cost
that made the wide one free), #29 (the wash and border this leaves alone), #93 / #66 (the 3:1 floor
for a graphical object, and why flooring a *colour* was declined), #117 (the connector, the other
identity channel and absent at every dial size), #38 (`event-card.ts`, shared with the agenda card),
ADR 0007 (the five theme tokens), ADR 0003 (nothing derived server-side)

# Give every card a colour swatch, so a light event's card says which arc it belongs to

## The defect

A floating label carries three channels tying it to its arc, and for a light colour all three are
absent at once:

| channel | ⚪ gray-100 `#F3F4F6` |
| --- | --- |
| the 20% wash over `--card-foreground` | **1.001:1** against the un-washed field |
| the border, `--card-foreground` + 40% of the colour | **1.001:1** |
| the connector | covered by its own card at every dial size (#117) |

The emoji is stripped from a card's title, so nothing else on the card carries the event's identity.
A card exists *because* its arc was too narrow to hold its own title, so the pairing has to be made
across a gap — and at ⚪ there is nothing to make it with.

## The decision, and the one thing it does not settle

The owner settled the remedy on #118: **give the card its colour back as a glyph**, taking the route
#30 already specified and costed for list-labels — a slim **vertical colour swatch, 8 units wide with
a 4-unit gap, before the title** — extended to every card rather than only merged ones. A rect over
an emoji deliberately: it costs no glyph and cannot be dropped by a font fallback (#91).

#30's arithmetic is what makes the wide one free. At `CHAR_WIDTH_RATIO = 0.6` and the dial's 17.52
label font a character is 10.512 units, so a 4-unit swatch and an 8-unit swatch floor to the same
integer: **one character a line** on both 16:9 (13 → 12) and 16:10 (8 → 7).

**What the decision does not settle is whether a bare rect is visible**, and measuring says it is
not. The swatch is full-opacity paint on the card's own washed field, so for the light half of the
palette it reproduces the defect it was chosen to fix:

| swatch, against the field it sits on | ratio |
| --- | --- |
| ⚪ gray-100 | **1.001** |
| Graphite `#e1e1e1` | 1.148 |
| Banana `#fbd75b` | 1.207 |
| Sage `#7ae7bf` | 1.270 |
| ⚫ gray-800 | 9.030 |

Nine of the twenty-one colours the dial can be handed land under 1.5:1. So the swatch needs an
**outline**, and the outline — not the fill — is what carries the 3:1 floor:

| outline, `var(--card)` over the field | outside | inside the fill |
| --- | --- | --- |
| ⚪, full opacity | **16.13** | 16.14 |
| Graphite | 15.58 | 13.58 |
| ⚫ | 10.93 | 1.21 |
| every colour, full opacity | **≥ 10.93** | — |
| every colour, at 0.4 | ≤ 2.50 | — |

Outlining rather than flooring the fill is the point: #118 rejected flooring the border because it
"darkens a light colour away from its authored hue, which is the move #93 declined at 4.5:1 for the
connector". An outline keeps the authored hue exactly and buys the patch an edge, which is the
property that was missing. ⚫'s outline vanishing *into* its own fill at 1.21:1 is correct rather than
a defect — the patch reads as one dark block, and its boundary against the field is 10.93:1.

The wash and the border stay exactly as #29 set them, per the decision: they are not doing the
identity job, but the card's *shape* is 11.9–17.5:1 on the page and never in doubt.

## The change

1. **`src/shared/clock/card-swatch.ts`** — the constants and the arithmetic, pure and node-testable:
   the swatch's rect inside a card's box, and the x the text centres on once the reserve is taken.
2. **`event-card.ts`** draws the swatch between the wash and the border's text, and centres each line
   in the room that remains rather than in the whole card. Shared with the agenda card by #38, so
   both surfaces get it from one place.
3. **`floating-label.ts`** takes the reserve out of the width budget before wrapping and adds it back
   to the card's width, so a card's **total** width bound is unchanged: every existing guard on the
   face clearance, the horizontal clamp and the label allowance holds by construction.

## The cost, measured rather than assumed

A card is centred on the locus and grows about its own centre, so a wider card reaches further into
the band — #98, which `floating-label.test.ts` pins at 90° and 270°. Those figures move, and the new
ones are recorded there and on #98. The face-clearance bound does not move: it is a bound on the
card's total width, and the reserve is taken out of the text budget rather than added to it.

## Verification

`?now=03:00&freeze=1` per the decision comment: it carries a ⚪ card (⚪ Breakfast Club) with a ⚫ card
beside it — the two ends of the palette failing in opposite directions, and the swatch has to work at
both.
