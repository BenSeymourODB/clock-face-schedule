# Brainstorm needed: the dial cannot distinguish minutes from hours

**Status:** open problem, no preferred direction yet. Written to be picked up cold.

## The observation

A clock face encodes time at **two scales at once**. The hour hand makes one revolution per
12 hours; the minute hand makes one per hour. That is why a glance can answer both "roughly when
in the day is it" and "how far into this hour are we" — the same circle carries both, at a 12×
difference in resolution, and the two hands are told apart by length and weight.

**The event arcs only use the outer scale.** Angular extent maps duration onto the 12-hour
revolution and nothing else:

| Duration | Arc span | |
| --- | --- | --- |
| 5 minutes | 2.5° | widened to 7.5° by the minimum-width floor |
| 15 minutes | 7.5° | |
| 30 minutes | 15° | |
| 1 hour | 30° | |
| 3 hours | 90° | |

So 0.5° per minute. A 20-minute event and a 40-minute event differ by 10° — about the width of the
gap between two minute ticks. At a glance, across a room, every sub-hour event is "a sliver".

## Why this matters more than it looks

The README commits this project to answering *"how much of the day is left"* and *"how long until
the next thing"* for people who find clock arithmetic hard. Duration is not a secondary attribute
here; it is the content.

And the resolution is worst exactly where the use case is densest. **A classroom day is mostly
sub-hour events** — lesson periods, transitions, interventions, appointments. The arcs are precise
about the three-hour block nobody needed help with and vague about the 25-minute one somebody did.

Two smaller aggravations feed into it:

- **`MIN_ARC_DEGREES` actively destroys duration information.** Anything under 15 minutes is drawn
  at 7.5°, so a 5-minute event and a 15-minute event are *identical* on the dial. That floor exists
  so short events stay visible at all, which is a real need — but it means the shortest events
  carry no duration signal whatsoever.
- **Nothing else encodes duration.** Not thickness (that is overlap depth now), not colour (that is
  identity), not text. Angular extent is the only channel, and it is the saturated one.

## What any answer has to keep

Constraints, not preferences — a solution that breaks these is solving a different problem:

1. **Position must still mean clock time.** The reason a dial beats a list is that "now" and "next"
   are in the same spatial frame as the hands. Any remapping that decouples arc position from where
   the hands point throws away the whole advantage.
2. **No interaction.** Nothing behind a tap, hover, or menu. It must be right standing still.
3. **Legible at distance**, on a projector, at poor contrast.
4. **Not colour alone.** Colour is already carrying event identity, and has to survive colour
   vision deficiency and a washed-out projector.
5. **It must not need a second glance to interpret.** If a viewer has to work out which scale they
   are looking at, the tool has failed the people it is for.

## Starting directions

Unevaluated. Listed to give a fresh session something to push against, not as a shortlist.

**A second band at minute scale.** Borrow the minute hand's scale: an inner or outer band where one
revolution is one hour, showing only the current (and perhaps next) hour at 6° per minute — 12× the
resolution. Keeps both scales visible simultaneously, exactly as the hands do. Costs radial space,
and needs the two bands to be instantly distinguishable so nobody misreads one for the other.

**A fisheye on now.** Render the current hour at minute scale and the rest of the day at hour scale
on the same band, with a visible seam. Preserves one continuous ring; breaks constraint 1 partially,
since arc position no longer maps uniformly onto hand position.

**Redundant duration encoding.** Put the duration on the arc as text ("25 min") or encode it in a
texture or end-cap treatment. Does not improve *comparison* between arcs, but makes absolute
duration readable — possibly enough, and much cheaper than a second scale.

**Make the arcs countable against the minute ticks.** The ticks already sit at 6° intervals — one
per minute of the *hour* hand's travel, i.e. 12 minutes of dial time each. If arcs visibly began and
ended on tick boundaries, duration could be counted rather than estimated. Requires the ticks to be
legible at distance, which the legibility pass improved but did not aim at.

**Radial length instead of angular.** Encode duration as how far an arc extends inward or outward.
Frees the angular axis to mean only start time. Almost certainly breaks the clock metaphor and
collides with overlap stacking, which already owns the radial axis — recorded for completeness.

**Accept it and change the window.** A 12-hour dial is the source of the compression. A 6-hour or
"next 4 hours" dial doubles or triples angular resolution for free, at the cost of not showing the
whole day. Worth pricing before building anything clever, since it may be that the window is simply
wrong for a classroom rather than the encoding.

## Interactions to be aware of

- **Radial space is now contested.** The legibility pass spent the freed radius on a wider band, and
  overlap stacking divides that band by cluster depth. A second scale-band competes with both.
- **Inline emoji would free radial room.** Emoji currently sit on their own radial line beneath the
  title, and the two nearly collide on a two-line title. Rendering the emoji inline with the title
  text as authored (`🍽️ Lunch`) would reclaim roughly a third of the ring's height — which is
  plausibly the space a second band would need. Filed separately; relevant here.
- **The minimum-width floor would need revisiting** under any scheme that makes short events
  legible on their own terms.

## What would settle it

A mock-up, not an argument. Any of these can be rendered as a static SVG against the fixture
schedule in `src/client/sample-events.ts` and looked at from across a room — which is how the last
four legibility defects were found, all of them invisible in measurements and specs.
