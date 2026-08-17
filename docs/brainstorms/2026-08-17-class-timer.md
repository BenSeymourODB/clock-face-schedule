# Brainstorm: a teacher-set countdown timer on the face

**Status:** feature sketch, specified but not costed. Written to be picked up cold.

## What it is

A control that lets the teacher set a countdown. While it runs, a circular progress pie is drawn
**on the clock face, beneath the hands** — see the layering section below, which measures why the
hands cannot go underneath it. Two display modes, chosen when the timer is set:

- **Loading** — the coloured sector starts empty and grows to full as the timer completes.
- **Vanishing** — it starts full and shrinks to nothing.

Both sweep clockwise. An audio cue plays when the timer finishes.

## Why this one is different from everything else here

Every feature so far has been about rendering a calendar nobody touches. This one is a **control a
teacher operates during a lesson**, and it broadens the product from a passive display into a class
time-management tool. That is a deliberate widening of scope, and it is what makes ADR 0008
necessary — up to now there was nothing to put in a control bar.

It also fits the stated purpose rather than stretching it. "Ten more minutes" is the same
abstraction the dial already exists to remove; a pie that visibly empties is the same answer,
applied to an interval the calendar does not know about.

## Loading or vanishing — both, and the choice matters

Worth recording why this is a real option and not indecision. **Vanishing** shows time *remaining*,
which is what "how long have I got" asks, and it matches the sand-timer and Time Timer devices
already common in the classrooms this is aimed at. **Loading** shows work *done*, which is the more
encouraging framing for a task a student is grinding through.

They suit different moments and the teacher setting the timer knows which. Keep both.

## The open question the spec does not answer: where does the sector start?

"Progress clockwise" does not say from where, and the two answers are meaningfully different.

**From twelve o'clock**, always. The loading.io convention. Unambiguous, works for any duration,
reads instantly as a progress indicator and not as anything clock-related.

**From the current minute-hand position**, so the sector's leading edge lands where the minute hand
will be when the timer expires. This is much more interesting: it makes the timer *legible against
the clock itself*, so "when the hand reaches there, we stop" needs no arithmetic at all — which is
precisely the abstraction-removal the whole project is built on. It would also mean the sector
edge and the minute hand converge visibly, which is a strong end-of-timer signal on its own.

It only works for timers under an hour, and the sector edge collides with the minute hand near the
end — at which point they overlap, which is either the best part of the idea or the thing that
kills it. **This is the first thing to mock up.** If it works, it is a better feature than the one
specified.

## Problems to solve

### Numeral contrast, on a background that moves

The face draws light numerals and ticks on a near-black ground. A filled coloured sector under them
changes the background of *some* numerals and not others, and the boundary sweeps as the timer runs.

This is #15 again — white arc titles measured 1.9:1 on yellow — but harder, because `readableTextColor`
picks one colour for one element against one known background, and here a single numeral can straddle
the sector edge with different backgrounds under its left and right halves. There is no per-element
answer to that.

The workable directions are all about not creating the situation:

- **Keep the sector inside the numeral ring**, so it never passes under a numeral at all. Cheapest,
  costs the pie some radius, and the face has radius to spare since the legibility pass moved the
  numerals inward.
- **Give the numerals a halo** — a contrasting outline or a subtle backing disc — so they survive
  any background. Standard, and it works, but it changes how the face looks when no timer is running
  unless it is applied conditionally, and conditional styling is how the emoji/title collision went
  unnoticed for so long.
- **Keep the sector low-opacity.** Weakest option: it protects the numerals by making the timer hard
  to read, and the timer is the thing the room is watching.

Inset is probably right. Verify by looking, not by measuring — a ratio computed against the sector's
fill says nothing about a glyph sitting half on and half off its edge.

### The pie competes with the arcs

Both are coloured sectors, both sweep clockwise, both start at twelve under the default answer above.
A large timer wedge can read as an enormous event arc.

Two things separate them and both should be deliberate: **radius** (the arcs own the outer band, the
pie is inside the face) and **fill style** (the arcs are annular sectors with a separator stroke; the
pie is a solid disc sector from the centre). Colour cannot be the distinguisher — the arcs already
own the palette, and the timer will collide with whatever it picks.

### Audio, on a platform with strong opinions about it

The good news is that **the autoplay problem solves itself here**: the timer is started by a teacher
tapping a control, so an `AudioContext` can be unlocked on that gesture and reused when the timer
expires minutes later. No sound is ever attempted without a prior user gesture in the same page.

The rest needs care:

- **Ship no audio file.** There is no path on an origin we control that serves a binary asset
  (see Platform constraints), and a data-URI WAV inflates the inlined HTML on every page load. A
  Web Audio oscillator with a short envelope needs no asset, no network, and no CSP exception.
- **The sandbox iframe is not ours.** The page runs in a nested cross-origin sandboxed iframe whose
  `allow=` attributes Apps Script sets, not us. Whether audio survives that has to be checked on the
  hardware — fold it into #10 alongside the colour-emoji font and the overnight rollover.
- **The board may be muted, and often will be.** Audio therefore **cannot be the only completion
  signal.** A visible end state is required, not optional — that is a correctness requirement for
  deaf and hard-of-hearing students and for every room with the volume down.
- **A sudden noise is a problem for part of this audience.** Sensory sensitivity travels with several
  of the difficulties the README names. The cue should be gentle by default and mutable, and "mute"
  must remain fully functional rather than degrading the timer.

### State, ticking, and reloads

- **Reuse the existing tick.** The dial already advances every second; a second interval for the
  timer would drift against it and cost nothing but inconsistency.
- **The timer must survive a re-render.** `renderEvents()` rebuilds the arc layer on period rollover
  and on every poll response. A timer layer that is a sibling of the arcs, not a child, gets this for
  free — but it has to be built that way from the start.
- **A reload loses the timer.** The Apps Script origin rotates between sessions, so nothing persisted
  client-side survives, and a server round trip to recover a countdown is worse than losing it. This
  is acceptable — but it should be a named decision rather than a discovered one, because a timer
  that silently vanishes when a board wakes from sleep will read as a bug.

### The control itself

One timer, not several. On a touch board with a teacher standing at the front mid-lesson, **preset
buttons** (1 / 2 / 5 / 10 / 20 minutes) beat any numeric entry field, and a running timer needs
exactly two affordances: cancel, and add a minute. Placement is ADR 0008.

## Candidate encoding: one concentric band per minute

Sketched as a candidate, not a decision — there are many ways to draw a timer radially.

**A fixed outer diameter, always**, whatever the duration, subdivided into one concentric band per
minute. The innermost is a solid disc; the rest are rings. In **vanishing** mode the bands drain
outside-in, so the timer shrinks toward the centre and the final minute is the solid disc — the most
visually emphatic state, arriving exactly when attention matters most. In **loading** mode the bands
build outward, which needs an **outline at the full radius** so a viewer can see where the growth
will stop.

Within a band, the partial sweep runs clockwise and shows seconds.

### What is strong about it

**It makes minutes countable rather than estimable.** That is the same argument that settled #26 in
favour of hollow-versus-filled over opacity: a categorical difference reads across a room where a
graded one does not. "Three rings left" survives distance, projection and a glance; "the wedge is
about 60% full" does not.

It also carries **two scales at once** — rings for minutes, sweep for seconds — which is precisely
what the dial itself cannot do for events, and the reason the
[two-time-scales brainstorm](2026-08-17-two-time-scales.md) exists. Worth noticing that the timer
solves by *subdivision* a problem the event band tries to solve by *window*.

### The ceiling is about ten minutes, not an hour

The timer must stay inside the numeral ring to avoid the contrast problem above. Numerals sit at
0.72 of the face radius, so on a 600-unit dial the timer has roughly **130 units of radius** to work
with. Divided into equal bands, against the 12.1-unit floor #9 already established as the thinnest
readable ring:

| Minutes | Band thickness | |
| --- | --- | --- |
| 2 | 65.0 | |
| 5 | 26.0 | |
| 8 | 16.3 | |
| 9 | 14.4 | the practical maximum — see layering below |
| 10 | 13.0 | just clears, but only if the timer keeps the full radius |
| 12 | 10.8 | **too thin** |
| 20 | 6.5 | **too thin** |
| 60 | 2.2 | **unusable** |

So the proposed 1-hour cap is far beyond what this encoding supports; the real limit is around ten
bands. That is not fatal — **scale the unit instead of the count.** One band per minute up to ten,
then one band per five minutes, so an hour is twelve bands and still countable. The cap belongs on
*bands*, not on duration.

### Equal thickness is not equal area, and the sketch's own example shows it

Equal-thickness bands make counting easy and area misleading. On the sketched 2-minute timer the
outer ring has **three times the area** of the inner disc, so at a glance a half-spent timer looks
two-thirds spent.

Equal-*area* bands fix the impression and break the counting: bands would thin toward the outside,
which is exactly where the draining happens and where thickness is already scarcest. Equal thickness
is probably right — counting is the feature — but the discrepancy should be seen before it is
accepted, because "looks nearly done when it is half done" is the kind of error this display exists
to prevent.

### The second hand *is* the drain edge — settled

Anchor every band's seam at the **seconds-past-the-minute at which the timer was started**, rather
than at twelve o'clock. Both properties then hold at once:

- Adding 60 seconds preserves seconds-past-the-minute, so **every band is exactly one minute** and
  the ring count answers "how many minutes left" exactly.
- The drain edge within a band sits at `seam + (elapsed mod 60) × 6°`, which reduces to
  `secondsOf(now) × 6°` — **the second hand's own angle**, identically, for any start offset.

So the second hand does not merely resemble the drain edge; it is the drain edge. It consumes the
band ahead of it as it sweeps, and the remaining arc always runs from the hand clockwise round to
the seam. Verified against fractional start offsets as well as whole seconds.

*(An earlier draft of this section claimed the two goals were mutually exclusive. That was wrong,
and it came from assuming the seam had to sit at twelve o'clock.)*

Consequences worth building around:

- **The timer must force the second hand on.** `showSeconds` defaults to `false` on `analogClock`;
  `main.ts` happens to pass `true`, but a coupling this load-bearing cannot rest on a default. With
  the hand hidden the design loses the thing that makes it legible.
- **Durations that are not whole minutes need the odd seconds spent first.** A 2:30 timer should
  clear a 30-second *outermost* band before any whole minute begins. Put the remainder innermost
  instead and the timer ends mid-band, truncating the solid-disc finale — which is the part the room
  is watching. Spending it first also means every subsequent band shares one seam.
- **Loading mode inverts cleanly.** The filled arc runs from the seam to the second hand and grows
  behind it, so the same identity holds with the hand as the leading edge rather than the consuming
  one.

### Two more things to check

- **The hour and minute hands cross every band.** The second hand is now meaningful where it
  crosses — it is the drain edge — but the other two just chop the rings, and eight concentric rings
  interrupted twice may be much harder to count than the static drawing suggests. This is the first
  thing to render.
- **The loading outline and #25's track are the same device.** A rolling window wants a faint
  full-ring track to distinguish "nothing scheduled" from "not shown"; loading mode wants an outline
  to show where growth ends. One convention, used twice, rather than two similar-but-different marks
  on one screen.

### Layering: keep the hands on top, and outline them

Drawing the timer *over* the hands would stop the rings being chopped, but it costs far more than it
saves. The hands were lengthened so each reaches its own scale — 0.64 / 0.90 / 0.93 of the face
radius, up from 0.55 / 0.75 / 0.80 — which also bought the hour hand some clearance:

| Hand | Length | Was | Covered by a 130 timer |
| --- | --- | --- | --- |
| Hour | 130.8 | 112.4 | **essentially all of it** |
| Minute | 184.0 | 153.3 | 71% |
| Second | 190.1 | 163.5 | 68% |

**The hour hand still all but disappears.** Even lengthened it is barely longer than the timer is
wide, so there is no arrangement in which a full-radius timer leaves it readable. That is the answer
to "what time is it" gone for the duration of every timer, on a display whose entire purpose is
time-tracking — the same cost #21 judged unacceptable when floating labels covered the face.

**So the timer's radius is bounded by the hour hand, not by the numerals.** To leave a clearly
visible tip — say twelve units — the timer can have about **118** rather than the 130 assumed above,
which is 0.58 of the face radius. At the 12.1-unit readable floor that is **nine bands**, not ten:
one fewer minute before the unit has to scale.

So: **hands on top, with a contrasting outline** — a `var(--card)` halo so each hand reads against
whatever band it crosses. That is the same device already proposed for the numerals, which argues
for adopting it once and using it in both places. The second hand must be on top regardless, since
it is now the drain edge.

Worth noting the chopping problem may also have been overstated. The hands are 9.2 and 5.7 units
wide against bands of 13–26; a ring crossed by a 9-unit line is still visibly a ring. **Render it
before engineering around it.**

### A digital readout, and what it is really for

Showing the remaining time as text over the timer is more accessible, and not only as redundancy. A
countdown is already the *result* of the arithmetic, so it asks nothing of a reader who finds clock
arithmetic hard — there is no tension with the README's premise here. It also neutralises the
equal-area misreading above, since a number cannot be misjudged by area.

**The larger payoff is that it rescues long durations.** The band encoding tops out near ten rings;
a 45-minute timer cannot be banded legibly at any subdivision. A coarse ring plus a readout can.
That reframes the readout from an addition to **the mechanism that makes the 1-hour cap viable** —
and it may be the better answer to the ceiling than scaling the unit per band.

To resolve:

- **It wants a hub.** A small central area carrying no band gives the text one known background;
  without it the ground under the readout changes when the innermost disc drains, which revives the
  moving-background contrast problem in the middle of the dial. A hub also gives the hands' inner
  portions and the centre dot somewhere to live. The sketch's own drawing appears to show a hole in
  the middle, so this may already be the intent.
- **The period indicator is in the way.** It sits 71.5 below centre, well inside the timer radius.
  Move it, suppress it while a timer runs, or size the readout to clear it — but do not discover
  the collision after building.
- **Toggleable is reasonable**, with ADR 0008's caveat that a toggle is configuration rather than a
  live control. It matters less here than for the scale modes: a timer is transient and whoever set
  it is standing at the board. A cheaper alternative to a toggle is showing the readout **only in
  the final minute**, when precision matters most and the rings have run out anyway.

## What would settle it

Mock-ups, looked at from across a room:

1. The sector starting at twelve versus starting at the minute hand — the question above.
2. A numeral sitting on the sector's edge, at each of the three contrast directions.
3. Eight concentric bands crossed by the hour and minute hands, with and without hand outlines —
   the cheapest way to find out whether the chopping is a real problem or an imagined one.
4. A banded timer with and without the digital readout, to judge the user's own worry that the
   combination is overwhelming rather than multi-modal.

Neither is answerable from a specification, and both are cheap to render statically against the
fixture schedule.
