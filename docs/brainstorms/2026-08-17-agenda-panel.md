# Brainstorm: an agenda panel beside the dial

**Status:** decomposed into #36 and its sub-issues. This document remains the reasoning; the issues
carry the work and record which parts are ready to build and which still need decisions.

## What it is

A vertical strip of event cards to one side of the dial, listing the current and upcoming events
of **the current day** — not the current 12-hour period.

Each card carries the event's colour and emoji by the same rules the arcs use, its title, and its
start and end times underneath. Two display modes, and in both a horizontal **playhead** in the
second hand's colour is drawn across the cards to show where the day has got to.

## Why it belongs here

The README is careful that this is a visual aid and not a calendar app, and it justifies the dial
by what a conventional agenda *cannot* do — show how much of the day is left. The reverse is also
true, and the dial has been living with it:

- **The dial never states a time.** It shows shape and proportion. A teacher who needs to say "we
  finish at twenty past" has to read it off the hands.
- **The dial shows half a day.** A morning glance cannot see the afternoon at all.
- **All-day events are dropped entirely.** `filterEventsForPeriod` discards them because they have
  no start or end angle. There is currently nowhere for them to go. The panel is that place, and
  adding it closes a gap that exists today rather than only adding surface.

So the two halves answer different questions and neither substitutes for the other. That is the
argument for the panel, and it is a good one.

## The two display modes

**Whole day.** Every event in the day, cards fixed in place, playhead travelling down the column.

**Scrolling.** The current event is held at a fixed position and highlighted, in the manner of an
iOS picker wheel; the column moves past it as the day advances.

These are **not the same mechanism at two zoom levels**, and the difference is worth being explicit
about before anyone builds it:

| | Whole day | Scrolling |
| --- | --- | --- |
| Cards | fixed | move |
| Playhead | moves down the column | fixed at the highlight |
| What the eye tracks | the line | the card arriving |

In scrolling mode the playhead and the highlight line are the same object, and the playhead's
travel *within* the highlighted card is what shows progress through the current event. When the
event ends the wheel has to advance and the playhead effectively jumps back to the top of the next
card. Whether that advance is an instant cut or a smooth scroll — and over how long — is unspecified
and is the mode's one real animation decision.

## The playhead

Colour: the second hand's token, `var(--destructive)`. Note it borrows the **token**, not the hand —
`showSeconds` is a parameter and the hand can be off, at which point a "same colour as the second
hand" rule has no referent on screen.

Position within a card, 0 at the card's top:

```
(currentTime − eventStart) / (eventEnd − eventStart)
```

**Card height comes from title-wrap needs, not duration.** This is deliberate and it is the right
call: height proportional to duration would make a five-minute event an unreadable sliver, which is
exactly the failure the arcs already have and the [two-time-scales
brainstorm](2026-08-17-two-time-scales.md) exists to fix. Re-importing it into the agenda would be
a poor trade.

But it has a consequence the feature has to own.

### The playhead's speed means nothing, and that is the central tension

Because height is set by text and position is set by time, the line moves at a different speed over
every card — fast down a short-titled hour, slow down a two-line ten-minute transition. A video
editor's playhead moves at constant speed because its timeline is linear in time; this one is
linear in *text*.

For most readers that is a non-issue: the times are printed on the card. For **the people this
product is specifically for** — the README names students who cannot do clock arithmetic quickly —
a moving line whose speed does not correspond to anything is a risk, because motion is precisely
the channel they are most likely to read intuitively rather than decode. A line that crawls can
mean "this is dragging" when it means "this title wrapped".

Not a reason to drop it. It is a reason to **look at it moving before committing**, and to consider
cheap mitigations: a duration bar on each card whose *length* is honest even when the card's height
is not; or a minimum card height so the variance is compressed; or accepting it and relying on the
printed times.

### Two cases the formula does not define

1. **Gaps.** At 10:47 with nothing running from 10:40 to 11:00, the fraction is above 1 for the
   previous event and below 0 for the next. Where is the line? Sitting on the boundary between two
   cards is the obvious answer and probably wrong — free time is the thing a viewer most wants to
   see, and collapsing it to a hairline hides it. A gap may need to be a card of its own.
2. **Overlaps.** The dial exists partly *because* events overlap — that is what concentric rings
   are for. Two overlapping events are two cards at two different fractions, and one line cannot be
   at both. Either the panel nests or indents overlapping events, or it picks one as primary, or
   the line splits. Unresolved, and it is the harder of the two.

## What it must keep

Inherited, not negotiable:

1. **Legible at distance**, on a projector, at poor contrast. This governs how many cards fit far
   more than the panel's height does — see below.
2. **Not colour alone.** Card colour carries event identity and must survive colour vision
   deficiency and a washed-out projector.
3. **Card text must use `readableTextColor`.** Cards sit on event colours, which the calendar
   supplies and no token describes. A fixed white measured **1.9:1 on the palette's yellow** when
   the arcs did it (#15). The helper exists; the panel must not re-solve it by eye.
4. **Same parse, same colours.** `parseEventTitle` decides the colour-dot prefix, the event emoji
   and the clean title. The panel and the arc must not disagree about any of the three.
5. **The same card styling as a floating label.** Both draw an event as a coloured card, and two
   independent card styles for the same underlying thing would read as two products on one screen.
   #29 takes Material's surface-tint model — the event's colour composited over the chip at a low
   opacity — and factors wash, border, radius, padding and text colour into one shared place. The
   panel should consume that rather than restyling. The two differ in *layout*, not in *style*: a
   label is positioned on a locus and carries a connector, a card is stacked in a column and carries
   its start and end times.

## Things that will come up

**Legibility caps the card count, and that argues scrolling should be the default.** At a size a
classroom can read from the back, a panel holds few cards — perhaps five or six. A fourteen-event
day does not fit in whole-day mode at any usable size. Whole-day mode is therefore the *special*
case, not the general one, and treating it as the default would make the panel fail worst on the
busiest days.

**A toggle is configuration, not a control.** Same hazard the 1h/12h toggle has: a person glancing
at a wall display has no way to know the mode was changed. Anyone who changes it must be standing
in front of it. See ADR 0008 for where the control lives.

**The layout stops being square, and the panel is not the only claimant.** The dial currently fills
a square viewBox on a page with nothing beside it. On a 16:9 board there is horizontal room going
spare, so this is the feature that finally uses it — but it is a real layout change, and the dial's
own size must not be the thing that pays for the panel.

Note that **#21 established a competing claim on exactly that room.** Floating labels are supposed
to sit outside the dial, and the dial is inscribed in the frame with an 8-unit margin, so there is
barely an outside: at 9 o'clock a label had 25.7 units of width to work with. That was mitigated by
wrapping and by pulling the label ring inward, at the cost of cards now sitting over the arc band.
The durable fix is the same horizontal room this panel wants. Deciding the layout here means
deciding it for labels too — how much of the width the panel takes determines whether labels get
their margin back or stay on the band.

**The server fetch needs widening, once.** `main.ts` requests `[periodStart, periodStart + 12h)`.
The panel needs the whole day. Widen that single request and let `filterEventsForPeriod` narrow it
for the dial — one round trip, one cache key, and the key already includes the window so nothing
goes stale. Two separate calls would double the `google.script.run` latency for no benefit.

**Empty days.** The dial degrades gracefully to a bare face. A tall empty column does not; it needs
something deliberate to say.

**All-day events need a card shape of their own** — they have times to display in the sense that
they have none, and the playhead formula divides by their duration.

## What would settle it

A mock-up against the fixture schedule in `src/client/sample-events.ts`, looked at from across a
room. Every legibility defect found on this project so far was invisible in the measurements and
obvious on screen — white-on-yellow at 1.9:1, the emoji/title collision, titles reading bottom-up.
The playhead's variable speed is the same kind of question and will answer the same way.
