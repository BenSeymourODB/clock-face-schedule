# Brainstorm: a teacher-set countdown timer on the face

**Status:** feature sketch, specified but not costed. Written to be picked up cold.

## What it is

A control that lets the teacher set a countdown. While it runs, a circular progress pie is drawn
**on the clock face, under the hands**. Two display modes, chosen when the timer is set:

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

## What would settle it

Two mock-ups, looked at from across a room:

1. The sector starting at twelve versus starting at the minute hand — the question above.
2. A numeral sitting on the sector's edge, at each of the three contrast directions.

Neither is answerable from a specification, and both are cheap to render statically against the
fixture schedule.
