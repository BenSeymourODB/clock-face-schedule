# Render the event emoji inline with the title

**Status:** in progress
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

The separately-drawn radial emoji (`event-emoji-<id>`) isn't retired outright — only for the case
it was colliding in: a title rendered on the arc. When the title does *not* render on the arc
(too narrow for one at all, or handed off to a floating label), nothing else occupies that radial
line, so the standalone glyph stays as the only cue that the arc has a category at all.

## Phases

1. **Text layer** — `pack-lines.ts` (emoji-aware width/truncation), `fit-label.ts` (weighted
   width), `clock-utils.ts` (`combineTitleWithEmoji`). Unit tests in `pack-lines.test.ts`,
   `fit-title.test.ts`, `clock-utils.test.ts`.
2. **Renderer** — `event-arc.ts` (inline title text, standalone glyph gated on whether the title
   rendered, single aria-label format), `analog-clock.ts` (pass the combined string to the
   floating label). Update `event-arc.test.ts` for the new visibility rule; delete the
   collision test for a layout this change removes (arc title + standalone glyph can no longer
   coexist). Add an integration case in `analog-clock.test.ts` for the floating-label path.
3. **Visual pass** — build, serve `preview.html`, screenshot the existing two-line-title-with-emoji
   fixture case (`g`) and a new emoji-carrying overflow case, look for collisions.
