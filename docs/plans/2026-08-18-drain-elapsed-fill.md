**Status:** in review
**Issue:** #28
**Docs:** #26 (binary elapsed outline), #22 (feather mask, retargeted here), #27 (event-colour
contrast, not addressed here)

# Drain an event's fill at the current time

## What this ships

An event currently in progress now shows a continuous split rather than the binary
live/elapsed state #26 introduced: the portion before "now" reads as #26's hollow-outline
treatment, the portion after "now" keeps its solid fill, and a short gradient at the boundary
keeps the seam from reading as a rendering glitch.

## Correction to the issue's own premise

The issue reasons that a short gradient "may read better" than #22's 10°/35%-of-arc feather
because "the boundary sits under the hour hand, which is itself a strong marker... a ramp
shorter than the hand is wide will be hidden by it."

Measured against the current geometry (`analog-clock.ts`, `clock-face.ts`, default 600-unit
dial): the hour hand's tip sits at radius **130.8**, the arc band's inner edge at **216.1** —
an **85-unit gap**. The hand never reaches the band at all, so nothing drawn there is hidden by
it regardless of gradient width. The feather constants (`FEATHER_DEGREES = 10`,
`FEATHER_MAX_SPAN_RATIO = 0.35`) are reused unchanged rather than inventing a shorter, unmotivated
one.

## Shape

Reuses the fill/separator/outline split #26 already put in place (see the code comment at
`event-arc.ts`'s single-fill-path test: "so a drain mask (#28) always has something to target").
Each event still renders exactly one `d` (the full arc), never split into two paths — only the
**masks** vary by state:

- **Elapsed fraction.** `computeDrainFraction(trueStartAngle, trueEndAngle, nowAngle)` — pure,
  returns `undefined` outside the event's true bounds (those stay the existing binary
  live/elapsed states), else the fraction of true duration completed. Computed from *true*
  (window-clamped) angles rather than the *drawn* (width-floored) ones, so `MIN_ARC_DEGREES`
  widening a short event never distorts how "into it" the boundary reads.
- **Boundary + fades.** `computeDrainMasks(startAngle, endAngle, fraction)` maps the fraction onto
  the *drawn* geometry (`boundaryAngle`), then produces two `FeatherSpan`s anchored there — one
  fading the fill in toward what's left, one fading the halo+outline in toward what's spent —
  using the exact feather shape from #22, just pointed at `now` instead of a window edge.
- **Masks.** The existing `featherMask` builder is generalised to take a flat span list instead of
  the `{start?, end?}` shape, so it can carry the window-edge feathers *and* the drain spans in one
  pass. When not draining, fill and stroke share one mask exactly as today — zero behavioural
  change to the pure-live and pure-elapsed paths. When draining, the fill gets its own mask
  (feathers + drain-toward-remaining) and the halo/outline get a second one (feathers +
  drain-toward-spent), since the two need to become visible in opposite directions from the same
  boundary.
- **Border split.** `data-arc-part="separator"` (the live `var(--card)` band) renders whenever the
  event has not fully elapsed, `data-arc-part="halo"` (renamed from #26's overloaded reuse of
  `"separator"`) plus `"outline"` render whenever it has fully elapsed *or* is draining. A draining
  arc therefore carries three border-ish paths simultaneously, each masked to only the region it
  applies to.

## Update cadence

The issue's sibling (#25) flags that a moving boundary needs roughly a per-minute rebuild rather
than the existing per-rollover one. Rather than mutating gradient/mask coordinates in place (the
`clock-face.ts` hand-transform pattern), this ships the simpler option: `analogClock.setTime`
gains a third rebuild trigger — an event is currently in progress — alongside period rollover and
the elapsed-set changing. A full `renderEvents()` at 1 Hz while something is in progress is the
same order of DOM work the codebase already accepts at rollover and elapsed-boundary crossings;
in-place mutation is a possible follow-up if a real device shows the rebuild cost matters, filed
as a deferred issue rather than built speculatively here.

## Deferred (per the issue's own "still open" list)

- Composing a drain fade with a feather fade when both spans land close enough to overlap (a very
  short event that is both window-clamped and mid-drain). The mask-building code unions the spans;
  it does not resolve genuine overlap. Rare and degenerate; not exercised by the fixture.
- The in-place gradient update mentioned above.
- Whatever #27 decides about event-colour contrast — the outline's colour-on-dial-background
  problem is unchanged and already tracked there.
