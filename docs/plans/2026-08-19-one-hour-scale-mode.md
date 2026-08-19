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
face gap 11.68). Everything else is a fraction of that.

| | value | units |
| --- | --- | --- |
| Outer numeral ring, 12h / 1h | 0.72 / 0.70 | 147.2 / 143.1 |
| Inner hour ring (1h only) | 0.50 | 102.2 |
| Hour hand, 12h / 1h | 0.64 / 0.43 | 130.8 / 87.9 |
| Inner ring ink (cap height, ±0.35em) | — | 95.0 – 109.4 |
| Hour-hand tip inside that ink | — | 7.1 |
| Inner ring → outer ring, ink to ink | — | 20.6 |
| Inner ring → AM/PM, ink to ink | — | 17.1 |

## What rendering found that the tests did not

Three defects, all invisible to a green suite, all found by looking at `build/preview.html`.

**1. Titles past 360° read upside down — and this is a live bug on the shipped 12-hour dial.**
`describeTextArc` decides which way to run its baseline from `midAngle > 90 && midAngle < 270`,
against an angle the rest of the pipeline deliberately never reduces (#33). Every arc past a
revolution therefore fails the test. Measured off the rendered DOM by comparing each baseline's
sweep flag against the half of the dial it actually sits on:

| build | 12-hour dial at 23:00 | 1-hour dial |
| --- | --- | --- |
| before | **4 title lines upside down** (🎂 Reading and Snacks, 🧸 Free Play) | 🍽️ Break upside down |
| after | none | none |

Fixed by reducing the angle modulo 360 **for the reading-direction test only** — the path itself
still runs at the angles it was given, so nothing moves. One line, and a case in
`text-arc.test.ts` for each of the wrapped, unwrapped and negative forms.

**2. Two-digit minute values collide with the hour markers at three and nine.** Only there: a
numeral's width adds straight onto its radius on the horizontal spokes, and barely counts on the
vertical ones. The 12-hour dial never showed it because its only two-digit numeral, "12", is at
the top.

| | clearance to the marker's inner end |
| --- | --- |
| 12-hour "3" / "9" | 13.65 |
| 12-hour "12" — its own tightest numeral anywhere | 6.32 |
| 1-hour "15" / "45" at the 0.72 ring | **3.75** — reads as a dash welded to the number |
| 1-hour "15" / "45" at the 0.70 ring | 7.82 |

Paid for by pulling the 1-hour outer ring in 0.02, which is where `RADIUS.numeralOneHour` comes
from. That still leaves 13.8 units to the inner hour ring, so the cost falls on the side with room.

**3. The 1-hour fixture had no elapsed arc**, so the preview showed filled and draining but not
elapsed — and #66 asks for the three to be judged together. "Register" now ends two minutes before
load, which makes it the elapsed *and* the leading-edge-crossing case at once; a leading-edge
crosser can never be wider than the 5-minute look-behind, so 18° is its natural size.

Each has a test alongside it. The clearance test was checked by reverting `numeralOneHour` to 0.72
and confirming it fails.
