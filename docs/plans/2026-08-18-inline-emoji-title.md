# Render the event emoji inline with the title

**Status:** done
**Issue:** [#23](https://github.com/BenSeymourODB/clock-face-schedule/issues/23)
**Docs:** [docs/DESIGN.md](../DESIGN.md); the
[two-time-scales brainstorm](../brainstorms/2026-08-17-two-time-scales.md) motivates reclaiming
radial space but does not specify this change

## What this is for

Titles are authored `🟡 🍽️ Lunch`. Today the dial strips the colour dot, then draws `🍽️` on its
own radial line beneath `Lunch`. This makes them one string, `🍽️ Lunch`, wherever the title
renders — on the arc or in a floating label — matching how the event was written and how a
person would read it aloud, and freeing the radial space the stacked emoji used to need.

## What stays separate

- `ClockEvent.cleanTitle` and `.eventEmoji` are unchanged — still split, still used to build the
  combined string at render time via a new `combineTitleWithEmoji` helper. No new field on
  `ClockEvent`: the combination is cheap and call-site-local, and adding a stored field would mean
  every existing test literal that builds a `ClockEvent` by hand needs an extra field it doesn't
  care about.
- The colour-dot emoji stays stripped. Only `eventEmoji` goes inline.

## The width problem

`pack-lines.ts` budgets in characters, one width unit each (`CHAR_WIDTH_RATIO`). An emoji is
roughly double that. Once an emoji can appear mid-string (as the first "word" of a combined
title), every place that counts or slices characters needs to treat one as two units and never
split it. `visualWidth()` and a small glyph tokenizer take over from raw `.length`/`.slice()` in
`pack-lines.ts`; `fit-label.ts`'s card-width calculation switches from `.length` to `visualWidth`
for the same reason.

## Where the standalone glyph still earns its place

The separately-drawn radial emoji (`event-emoji-<id>`) survives in exactly one case: an arc past
the 10° emoji floor but short of the 20° title floor, whose title still fits its budget — in
practice an emoji-only title. There, no title renders on the arc and no label is created either,
so the glyph is the only thing naming the event.

**Revised during the visual pass.** The first attempt also kept the glyph when a floating label had
taken the title over, reasoning that the band would otherwise be an anonymous stripe. Rendering
showed that is a collision: on the fixture's conference event the glyph landed at x∈[91,122]
y∈[166,188] against a card whose last line spanned x∈[-1,99] y∈[156,173]. The label already
carries the emoji inline, so the arc copy bought an overlap for no new information. Exactly one
surface carries the emoji now, and a test asserts that.

## `emoji.ts` is not re-exported from the barrel

Deliberate, and load-bearing. Its consumers are all inside `src/shared/clock/` and import it
directly. Re-exporting it put a top-level `new RegExp` in the barrel's graph, and esbuild will not
drop a top-level construction it cannot prove pure — so the whole sequence string travelled into the
**server** bundle (+549 bytes) even though `parseEventTitle` is tree-shaken out of it there.
`/* @__PURE__ */` did not help. Both patterns are now built lazily on first use and cached, which
also keeps `packLine` from recompiling one per measured word. The server bundle is byte-identical to
`main` again.

## Emoji are grapheme clusters, not code points

Also found by rendering. `parseEventTitle` matched only the first code point of `👩‍🏫`, left
`‍🏫 Parent…` as the title, and recombining inserted a space *inside* the sequence — the label drew
`👩 ‍🏫`. The width pattern in `pack-lines.ts` and the prefix pattern in `clock-utils.ts` had drifted,
so both now come from one definition in `src/shared/clock/emoji.ts`, which consumes whole ZWJ
sequences, skin-tone modifiers, regional-indicator flags, keycaps and tag-sequence subdivision flags
(`🏴󠁧󠁢󠁳󠁣󠁴󠁿` — plausible input for a UK school, and it failed in exactly the `👩‍🏫` way until a review
caught it).

Measured on the rendered dial: an emoji occupies ~1.30× font size against the 1.20× this models,
while plain characters occupy ~0.48× against a modelled 0.60×. The text over-estimate dominates, so
nothing overflows — the widest emoji-bearing line uses 77.1% of its arc, against 88.2% for
text-only "Assembly".

## Wrapping rules

- An emoji costs **2** width units; a plain character 1.
- A run of **up to 3** emoji packs as one unbreakable token, so `🧸 🪀 Free Play` keeps the bear and
  the yo-yo on one line. A longer run becomes ordinary words, so the packer may break it wherever
  the line runs out — it is a strip of pictures with no syllable to protect.
  - Chunking a long run into *fixed* groups of three, which this first did, is not the same thing
    and packs worse: it left `🧸 🪀 ⚽ 🎲 🚀 Free Play` overflowing with five of line one's fourteen
    units unused, where free breaking fits it in two lines.
- The boundary between an emoji and the following word is an ordinary break opportunity, so a
  narrow arc may put `🍽️` above `Lunch` rather than overflowing.
- A truncation never cuts through a sequence: it keeps the whole emoji or drops it.

## Phases

1. **Text layer** — `emoji.ts` (new: the shared sequence pattern, `visualWidth`, `sliceToWidth`,
   `emojiRunLength`), `pack-lines.ts` (emoji-weighted packing and run merging), `fit-label.ts`
   (weighted card width), `clock-utils.ts` (`combineTitleWithEmoji`, shared prefix pattern).
2. **Renderer** — `event-arc.ts` (inline title, glyph gated to the narrow-arc case, single
   aria-label), `analog-clock.ts` (combined string to the floating label).
3. **Visual pass** — build, serve `preview.html`, screenshot and measure. This is the phase that
   found both real defects; neither was visible to a green suite.

## Known limitation: the width model under-charges a pure-emoji line

An emoji renders ~1.30× font size where this charges 1.20× (`2 × CHAR_WIDTH_RATIO`), while a plain
character renders ~0.48× against a charged 0.60×. On any line carrying text the over-charge on the
text dominates and the line comes out narrower than budgeted. On a line of **nothing but emoji**
there is no text to absorb it, so the rendered line can reach ~104–108% of its budget.

Not raised to 2.2 units: it would ripple through the "an emoji costs two units" story and every test
asserting it, to buy an 8% margin on a case that does not currently occur. The fixture now contains
a space-free run (`🪀🎈`, adjacent because only the *leading* emoji is stripped), and it renders at
**64.9%** of its arc — the worst line on the dial remains text-only "Assembly" at 88.2%. Revisit if
a real schedule produces an emoji-only title on a narrow arc.

## Fixture additions

- `h` "🟣 🧸 🪀🎈 Free Play" at 08:20–09:25 — an emoji run that must wrap as one token, deliberately
  space-free after the first glyph so it exercises the width model's worst case. Sited in the clear
  gap so it does not deepen the existing three-deep cluster.
- `i` "🟤 ⚽" at 04:02–04:26 — 12°, the only shape that still draws a standalone radial glyph.
- `f` gains a `👩‍🏫`, making it the overflow-to-label case *and* the ZWJ-sequence case.
