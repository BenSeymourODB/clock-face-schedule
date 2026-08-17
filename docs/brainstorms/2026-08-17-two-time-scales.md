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

## Developed proposal: selectable scale modes

The leading candidate. A two-state toggle between a **1-hour** and a **12-hour** view, rather than
showing both scales at once.

| | 1-hour view | 12-hour view |
| --- | --- | --- |
| Numerals | 5-minute values (0, 5, 10 … 55) in the hour numbers' positions | hour numbers only |
| Hour numbers | pulled inward, greyed to de-emphasise | normal |
| Hour hand | greyed | normal |
| Minute hand | normal | greyed |
| Events shown | those overlapping the next 60 minutes | those overlapping the period |

The de-emphasis is what makes it work: both hands and both numeral sets stay present, so the dial is
never lying about the time — it is only saying which scale it is currently *about*. That answers the
"which scale am I looking at" hazard without a label.

**Why the density is better than showing both.** In a 60-minute window the dial runs at 6° per
minute — 12× the current resolution. Overlaps that are unreadable slivers today become legible arcs,
so the mode may largely dissolve the density problem inside the window rather than adding to it.

### Open questions

**Rolling window or clock hour?** Putting 5-minute numerals in the hour positions implies the
numerals are *fixed* (0 at twelve o'clock, 15 at three, and so on), which keeps the minute hand
pointing where it naturally would. But "the next 60 minutes" from 10:45 runs to 11:45, so arcs must
**wrap through the twelve position**. That is natural on a clock face and probably right — but it is
a case the geometry does not currently handle at all: `calculateArcAngles` clamps to the window
rather than wrapping, `describeArc` assumes a single non-wrapping sweep, and `assignRings` sorts by
start angle, which is meaningless across a wrap. Costing this is the first thing to do, because it
may dominate the work.

**Does a toggle violate "no interaction required"?** Constraint 2 says the display must be complete
standing still, and neither mode is complete on its own — one hides minute detail, the other hides
most of the day. The honest reading is that the *toggle* is fine as configuration but a problem as a
live control, because a person glancing at the wall has no way to know the mode was changed.

Worth considering **automatic** switching as a variant, or as well: default to 12-hour, and drop to
1-hour when the next event starts within some threshold. That keeps the constraint intact and puts
the resolution where it matters exactly when it matters. It also removes the "who left it in the
wrong mode" failure, which on a shared classroom display is a real one.

**Is greying the hour hand safe?** It is the answer to "which hour is it". Greyed, with the hour
numerals also pulled in and dimmed, a viewer could lose that anchor — which matters most for the
people this is for. Probably fine, since both are still drawn, but worth looking at rather than
assuming.

---

## Window-edge feathering — done (#22), and the mode work inherits it

Part of the proposal above, but it fixed something that was already wrong, so it shipped ahead of
the mode work. Any window frequently begins or ends mid-event; the arc now terminates at the
boundary as before, but ramps to nothing over the last few degrees so it visibly *continues past*
the edge rather than stopping at it.

What landed, so a scale mode does not have to rediscover it:

- **`calculateTrueArcAngles` reports which ends it clamped**, as `continuesBefore` / `continuesAfter`
  on `ClockEvent`. A 1-hour window would set the same two flags against its own bounds, and
  everything downstream follows.
- **`computeArcFeathers` (`shared/clock/feather.ts`) owns the depth**: 10°, capped at 35% of the arc
  per end. The cap matters — a short event *at* the boundary is the one most worth seeing, and an
  uncapped fade erases it. At 6°/minute a 1-hour window's arcs are 12× wider, so the fixed depth
  will want revisiting there; the ratio cap will not.
- **A luminance `<mask>`, not a tinted fill.** The arc carries a `var(--card)` separator stroke
  around its whole outline, so fading only the fill leaves a crisp line capping the boundary — the
  exact thing the fade exists to deny. Masking the path takes fill and stroke together.
- **The gradient is painted onto a wedge, not the mask's whole box.** A `linearGradient` pads its end
  stops across the entire plane, and an arc past 180° curves back into the region behind its own
  start — bounding the gradient to the feather wedge is what stops it masking the far end.
- **The chord approximation is fine.** A gradient axis is straight and the arc is not, but a radial
  offset is perpendicular to that axis and so projects onto it only to second order. Over ten
  degrees it is not visible.
- **Text is not faded.** The fade is a property of the band; blurring the event's name helps nobody.

Two decisions the issue raised and this settled: **both** ends feather, since an event that started
before the window is misrepresented exactly as badly as one running past it; and the fade
**supplements** `MIN_ARC_DEGREES` rather than replacing it — the ratio cap is what keeps a floored
arc visible, not a change to the floor.

---

## Other directions

Unevaluated. Listed to give a fresh session something to push against, not as a shortlist.

**Both scales at once — an inner "next hour" ring and an outer "next 12 hours" ring.** Considered and
set aside as the likely-too-dense option: each ring still needs concentric stacking for its own
overlaps, so a busy hour would be competing for radial space twice over. Kept because some version
may work — perhaps the inner ring showing only the *current and next* event rather than everything,
which would bound its depth at two. Recorded as #24.

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
  plausibly the space a second band would need. Filed as #23; relevant here.
- **The minimum-width floor would need revisiting** under any scheme that makes short events
  legible on their own terms.

## What would settle it

A mock-up, not an argument. Any of these can be rendered as a static SVG against the fixture
schedule in `src/client/sample-events.ts` and looked at from across a room — which is how the last
four legibility defects were found, all of them invisible in measurements and specs.
