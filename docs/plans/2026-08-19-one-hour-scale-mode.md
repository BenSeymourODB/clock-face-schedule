# A 1-hour scale mode

**Status:** in progress
**Issue:** #34 (sub-issue of epic #32)
**Docs:** `docs/brainstorms/2026-08-17-two-time-scales.md`, ADR 0005, ADR 0007, ADR 0008

## What this delivers

A second dial scale in which one revolution is **60 minutes rather than 720**, so the band runs at
**6° per minute — 12× today's resolution**. In a classroom day made mostly of sub-hour events, that
is the difference between "a sliver" and "an arc you can read the name off".

Both scales stay drawn in both modes. What changes is which one is *emphasised*, and that is the
whole mechanism: the dial never lies about the time, it only says which scale it is currently
about. That answers the brainstorm's constraint 5 ("must not need a second glance to interpret")
without a label.

| | 1-hour view | 12-hour view |
| --- | --- | --- |
| Outer numerals | 5-minute values (0, 5, 10 … 55) in the hour positions | hour numbers 1–12 |
| Hour numbers | a second ring, pulled inward, greyed | the outer ring, normal |
| Hour hand | greyed, shortened to reach the inner ring | normal |
| Minute hand | normal | greyed |
| Events shown | 5 minutes behind → 50 minutes ahead | 3 hours behind → 8 hours ahead (#25) |

## Decisions already settled, and where

Recorded so a later reader does not re-open them:

- **A persistent toggle, not automatic switching** — issue #34's own comment. A switch that stays on
  screen showing its own position is its own indicator, which is what defuses ADR 0008's hazard.
- **Greying the hour hand is safe, and better than safe** — #34's body. The hour hand and the
  pulled-in hour numerals share one grey, which is what says they are one scale.
- **The 1h window is 5 minutes back / 50 minutes ahead**, not the literal next hour — #34's body.
  Reusing #25's geometry would show only the next 40 minutes and the previous 15.
- **Angles are never reduced modulo 360** — #33/#25. Every window here wraps; `describeArc`'s
  `largeArcFlag` derives from `endAngle − startAngle`, and `assignRings` needs a monotonic sort.

Worth noticing that 5 + 50 = **55 minutes = 330°**, the same band and the same 30° gap #25 arrived
at for the 12-hour view. The window track reads identically in both modes, which was not designed
for and is worth keeping.

## Why the hour hand shortens as well as greys

The issue asks only for grey. Rendering says grey is not enough on its own, and the repo has already
written down why: `RADIUS`'s own comment in `clock-face.ts` records that the inherited hand lengths
"asked a viewer to extrapolate along a line to a mark it never touches, which is exactly the small
act of inference this dial exists to remove."

Pulling the hour numerals inward without pulling the hour hand in with them re-creates exactly that
defect — the hand would cross its own numerals mid-shaft and point at nothing. So the 1h hour hand
keeps the *relationship* the 12h hand has to its numerals (tip stopping just inside the glyph) at
the new radius, and de-emphasis comes from being both shorter and greyer.

## Phases

1. **Shared scale geometry** (`src/shared/clock/scale.ts`, node-tested). A `DialScale` descriptor
   carrying `periodMinutes` / `lookbehindMinutes` / `lookaheadMinutes`, the angle origin for a
   scale, and the drawn window for a scale. `periodMinutes` threads through `angleForTime`,
   `calculateTrueArcAngles`, `calculateArcAngles` and `eventsToClockEvents` as a defaulted trailing
   parameter, so every existing caller keeps the 720-minute behaviour untouched.
2. **The 1-hour face** (`clock-face.ts`, jsdom-tested). Minute values on the outer ring, a greyed
   inner ring of hour numbers, the two hands' emphasis swapped per mode.
3. **Wiring and the fixture** (`analog-clock.ts`, `main.ts`, `static/Index.html`,
   `sample-events.ts`). Mode selection, and a fixture built of sub-hour events so the mode can be
   judged on the thing it exists to fix.
4. **Visual pass.** Render both modes, screenshot, measure the clearances that were designed above.

## What is deliberately not here

- **The top-bar switch.** ADR 0008 records that whether the bar is always visible or reveals on
  interaction is *unsettled*, and #47 — the only other issue that would build a bar — is itself
  marked not-ready on four interaction decisions. Building a control now would settle that by
  accident. Mode selection is a URL parameter for this pass, exactly as `?demo=1` and `?check=1`
  are, and for the same reason: it has to be checkable on the board rather than on a workstation.
- **Persisting the mode.** #31 is the mechanism and is in flight; the switch is what would be
  persisted, and it does not exist yet.
- **Re-deriving the feather depth.** #34's body already retired this: #25 moved feathering to the
  window track, and at 6°/minute a fixed 10° feather is 1.7 minutes rather than 20. Left alone
  deliberately, not overlooked.
- **`MIN_ARC_DEGREES`.** It is a *visibility* floor expressed in degrees, so it stays 7.5° in both
  modes — which is 15 minutes at 12h and 1.25 minutes at 1h. That is the correct behaviour for a
  floor whose job is "an arc must be wide enough to see": in 1h mode almost nothing needs it.

## Measurements this design rests on

At the shipped 600-unit dial, `faceRadius` resolves to **204.4** (`outerRadius` 292, band 75.92,
face gap 11.68). Everything below is a fraction of that; see the phase-4 notes for what rendering
said about them.
