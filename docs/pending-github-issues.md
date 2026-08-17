# Pending GitHub issues

Drafted while GitHub was unavailable. **Delete this file once these are filed.**

---

## Floating labels have nowhere to go, so they cover the clock face

Found by rendering the dial after the legibility pass. Related to #16, which is landed — the
horizontal clamp works, and in doing so it revealed the real problem underneath.

### What happens

The label for a long title now lies **across the top of the dial, over the numerals 11, 12 and 1.**
Before the clamp it ran off the side and was clipped; now it is fully visible and in the way. Both
are bad; obscuring the clock is arguably worse, since the hands are the reference everything else is
read against.

### Why

Card width is `text.length × fontSize × 0.6 + 12`. The legibility pass raised the label's font from
14 to 21.3 units, so a 43-character title now needs **561 units on a 600-unit viewBox**. There is
no position outside the dial where that fits. The clamp does the only thing it can: pulls it inward
until its edges are inside the box, which is on top of the face.

So the clamp is not wrong — the card is simply too big for the dial, and no positioning rule fixes a
size problem.

### Directions

- **Wrap the label onto several lines.** The honest fix: the label exists because a title did not fit
  its arc, so a label that does not fit either should wrap rather than grow. Needs a width budget and
  a line-packing pass — `fit-title` already does the equivalent for arcs and may be reusable.
- **Give the label its own font scale**, not the arc band's. It sits outside the dial, so sizing it
  from the band is arbitrary. A fraction of the dial radius would keep cards proportionate.
- **Cap card width and ellipsise.** Cheapest, but reintroduces the truncation the label exists to
  avoid.
- **Draw labels over the arc band rather than beyond it**, where there is more room at the cost of
  covering an arc.

Wrapping plus an independent font scale is probably the answer, but it wants a mock-up.

### Note

The dial stays usable meanwhile — only overflowing titles become labels, and only long ones reach
across. It costs legibility of the face, not correctness of the schedule.

---

## Show both time scales at once, on two concentric rings

Set aside in favour of selectable scale modes, but kept because some version of it may work. See
[the two-time-scales brainstorm](brainstorms/2026-08-17-two-time-scales.md) for the problem it
addresses.

### The idea

An **inner ring** showing events in the next hour at minute scale (6° per minute), and an **outer
ring** showing the next 12 hours at hour scale (0.5° per minute). Both scales visible simultaneously,
mirroring how the two hands already work.

### Why it was set aside

Visual density. Each ring still needs concentric stacking for its own overlaps, so a busy hour is
competing for radial space twice: once to divide the inner ring by its overlap depth, and again
because the inner ring is itself only a fraction of the available band. The dial already loses text
at three-deep overlap on a full-width band; halving the band first would make that two-deep.

### The version that might work

Bound the inner ring's depth instead of letting it stack arbitrarily. If it showed only the
**current and next event** rather than everything in the hour, its depth is at most two by
construction, and it becomes a "what is happening now / what is next" strip at high resolution
rather than a second full schedule.

That is a different feature from the one that was rejected, and possibly a better one — it answers
"how long until the next thing" directly, which is one of the two questions the README names.

### Worth checking first

Whether the selectable-mode approach makes this redundant. If a 1-hour mode already gives minute
resolution when it matters, a permanent second ring may be paying radial space for something a mode
switch provides for free.

---

## Render the event emoji inline with the title, as authored

At present the emoji sits on its own radial line beneath the title. Titles are authored as
`🟡 🍽️ Lunch`, and rendering `🍽️ Lunch` as one string would match both the authoring and ordinary
reading.

### Why it is worth doing

- **It reclaims radial space.** Emoji and title stack radially and nearly collide: on a two-line
  title they needed 1.03 of the ring's height between them, and the legibility pass had to shrink
  both to fit. Inline, that contest disappears and the title can have the whole band.
- **It reads as language.** `🍽️ Lunch` is how the event was written and how a person would read it
  aloud. The current split presents the emoji as a separate symbol rather than part of the name.
- **It frees room a second scale-band might need** — see
  [the two-time-scales brainstorm](brainstorms/2026-08-17-two-time-scales.md).

### What it costs

- **`fit-title`'s character budget assumes uniform character width.** Emoji are roughly double-width
  and the current `CHAR_WIDTH_RATIO` of 0.6 would underestimate them, so titles with emoji would
  overflow their arc unpredictably. The budget needs to account for emoji width, which means the
  packing is no longer a pure character count.
- **The wide-arc case is the one that benefits.** On a narrow arc an inline emoji consumes scarce
  angular room that the title needs, where radially stacked it consumed radial room the title was not
  using. It may be right to do this only above some span, which reintroduces a mode.
- **Colour-dot prefixes stay stripped.** `🟡` selects the arc colour and must not be rendered; only
  the event emoji goes inline.

### Also worth checking

Whether the emoji should be dropped from the accessible name once it is part of the rendered title —
`aria-label` currently appends it separately, which would become a duplicate.
