# A seam the fixture refresh can be tested through, and the frozen-clock assertion

**Status:** done — shipped in [#128](https://github.com/BenSeymourODB/clock-face-schedule/pull/128)
**Issue:** [#80](https://github.com/BenSeymourODB/clock-face-schedule/issues/80)
**Docs:** [../DESIGN.md](../DESIGN.md) (ADR 0005, browser-local time), `src/shared/clock/time-source.ts`
(#72's one seam), `src/client/sample-events.ts` (#62's recurrence)

## What is left of #80, and what is not

The defect #80 describes — `refreshFixture` reading `new Date()` while the dial draws a pinned
window, so a display left on `?demo=1&now=…&freeze=1` empties after about thirteen hours — **is
already fixed on `main`**, reconciled when #79 merged after #75 rather than by a later change. The
call site reads `now()` and carries the reasoning. Verified at `f2a19b3`.

What is not on `main` is the half the issue is explicit about:

> **A test that would catch it.** Neither PR's suite fails on the combination, since each tests its
> own half. The assertion is that a frozen clock emits the same copy set twice, however much real
> time passes between the two calls.

`sample-events.test.ts` covers `fixtureCopyIndices` at the function — given a window, which copies
reach it. Nothing covers the **consumer**: which clock that window is derived from. That is the one
edit that reintroduces the bug, and it is a one-word edit.

## Why the guard needs an extraction first

`refreshFixture` is a closure inside `startDisplay` inside `src/client/main.ts`, which is an entry
point: it calls `startDisplay()` at import and reaches for `document`, `google.script.run` and
`window.setInterval`. Nothing in the suite imports it, and importing it to reach one closure would
drag the bridge and the diagnostics panel in with it.

So the loop moves to `src/client/fixture-refresh.ts` as `fixtureRefresher({ scale, pin, now,
setEvents })`, taking the clock as a `TimeSource` — the type #72 already defines for exactly this.
Nothing about the behaviour changes; the extraction is what makes the clock a parameter rather than
a free variable, and a parameter is what a test can pin.

`main.ts` keeps deriving the scale and the pin and keeps owning the interval. The unit owns the two
things that are actually load-bearing and were untested: the anchor is taken **once**, at
construction, and the copy set is compared against the last one emitted so `setEvents` — which
redraws every arc — is called only when the set changes.

## The assertions, and why each one bites

Fake system time (`vi.setSystemTime`) rather than an injected `readRealClock`, deliberately. An
injected real clock cannot catch the regression: a literal `new Date()` inside the loop ignores the
injection, and real time does not advance during a test, so the emitted set would come out the same
twice and the assertion would pass on the broken code. Faking the system clock makes `new Date()`
itself move.

| assertion | what breaks it |
| --- | --- |
| a frozen clock emits once, with real time advanced 14 h then 40 days between calls | reading `new Date()` (or `Date.now()`) instead of the seam |
| every emitted event starts within a day of the **pinned** instant | tiling the copies into one clock's window while the dial draws another's |
| 🟡 Lunch draws at 04:30 on the pinned *day*, and copy 0 keeps its bare ids | taking the anchor from real time — the only mutation the re-emission counts miss |
| each scale's own fixture ids, in a window admitting at most two copies | dropping the scale plumbing, so the 1-hour dial draws the 12-hour fixture |
| an unpinned clock advanced 14 h emits a second, later copy set | a dedupe that never re-emits, i.e. #62 undone |
| an unpinned clock advanced one minute emits nothing further | dropping the copy-set comparison, so every poll redraws every arc |

The pin sits three days before the fake load time deliberately: midnight of *today* is the same
instant whichever clock is read, so a same-day pin cannot discriminate — the 12-hour fixture's copy
set is `[0, 1]` from either window.

The scale row is there because sweeping both scales through the other assertions buys nothing on its
own. Replacing either `demoFixture(scale)` or `dialScale(scale)` with the literal `"12h"` left all
1,289 tests green, and `demoFixture` has no other caller and no spec of its own — a `SCALES` sweep
that reads as coverage and is not. The fixture half shows in the ids (the two fixtures share only
"n" and "w"); the window half shows in the copy count, since the 1-hour fixture inside an 11-hour
window admits nine copies against two.

Both pins are exercised: `?now=…&freeze=1` (displaced *and* frozen) and `?freeze=1` alone — the
"second, quieter half" #80 names, where the origin *is* real time and the copy set must still hold
still. Both scales too: the 1-hour window is 55 minutes wide, so 14 hours of real time is fifteen
window-widths there against a bit over one on the 12-hour dial.

## Not in scope

- **The `?demo=1` + evening pin note** ("worth checking while there"). Measured, and it is a real
  defect: README says a pinned evening dial is empty, a guard agrees, and the dial draws fifteen
  arcs — both count one fixture copy while the app draws every copy since #62. Filed as
  [#127](https://github.com/BenSeymourODB/clock-face-schedule/issues/127) with the figures rather
  than fixed here. It wants doing beside #104, which is open on the state descriptions in the same
  README table and for the same reason; correcting the counts alone would leave the rows above them
  describing the same pre-recurrence dial.
- **Retitling #80 rather than closing it.** The PR closes it on the reading that the assertion was
  the outstanding half; whether the maintainer would rather it stayed open under a narrower title is
  theirs to say, and nothing here depends on which.
