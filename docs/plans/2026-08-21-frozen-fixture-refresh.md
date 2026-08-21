# A seam the fixture refresh can be tested through, and the frozen-clock assertion

**Status:** in progress — outstanding as [#80](https://github.com/BenSeymourODB/clock-face-schedule/issues/80)
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
| the emitted events all intersect the **pinned** window, and copy 0 keeps its bare ids | deriving the window from one clock and the anchor from another |
| an unpinned clock advanced 14 h emits a second, later copy set | a dedupe that never re-emits, i.e. #62 undone |
| an unpinned clock advanced one minute emits nothing further | dropping the copy-set comparison, so every poll redraws every arc |

Both pins are exercised: `?now=…&freeze=1` (displaced *and* frozen) and `?freeze=1` alone — the
"second, quieter half" #80 names, where the origin *is* real time and the copy set must still hold
still. Both scales too: the 1-hour window is 55 minutes wide, so 14 hours of real time is fifteen
window-widths there against a bit over one on the 12-hour dial.

## Not in scope

- **The `?demo=1` + evening pin note** ("worth checking while there"). Measured and reported on
  #104, which owns README's state descriptions, rather than edited here — a fixture-state table is
  that issue's subject and half-correcting it would make its eventual fix harder to review.
- **Closing or retitling #80.** The fix landing in passing is worth recording, but which of those
  the issue becomes is the maintainer's call.
