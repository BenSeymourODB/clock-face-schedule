# One clock read at load, so the first frame is reproducible

**Status:** done — shipped in [#155](https://github.com/BenSeymourODB/clock-face-schedule/pull/155)
**Issue:** [#152](https://github.com/BenSeymourODB/clock-face-schedule/issues/152)
**Docs:** `CLAUDE.md` ("Render before you believe it works" — the habit this corrupts), ADR 0005
(browser-local time), #80 / #62 (why the anchor is read once at load), #76 (🔴 Deadline's boundary,
called out there as a near miss), #150 / #153 (where the two-drain frame was measured)

## The defect, restated in one line

`main.ts` reads the clock twice on the way up — once for the dial, later for the fixture anchor —
and the demo fixture's `at(3, 0)` event ends **exactly** on the anchor boundary. So for however long
the append and the label measurement take, the anchor is later than the time the first frame is drawn
at, 🔴 Deadline has not finished yet by the dial's own clock, and the load frame carries a drain that
is gone one tick later.

Measured on `build/preview.html` at 1920×1080 before the change, sampling the `linearGradient` id
list as the page settles:

| after load | drain gradients |
| --- | --- |
| 150 ms | `arc-drain-b-drain`, `arc-drain-n-drain` |
| 300 ms | `arc-drain-b-drain`, `arc-drain-n-drain` |
| 600 ms | `arc-drain-b-drain`, `arc-drain-n-drain` |
| 1200 ms | `arc-drain-n-drain` |
| 2500 ms | `arc-drain-n-drain` |

`TICK_INTERVAL_MS` is 1,000, which is exactly the persistence.

## The remedy taken, and the two declined

#152 lists three. **Remedy 1**: hoist one `const loadedAt = now()` in `main.ts` and hand it to both
`analogClock` and `fixtureRefresher`.

- *Move `"b"`'s end off the boundary* leaves the two-clock race in place for the next event that
  lands on one, and the fixture is deliberately the stress case (`CLAUDE.md`) — an event ending
  exactly on the boundary is a case worth keeping, not one worth authoring away.
- *Document the first second* is enforceable only by whoever remembers to wait, and the habit it
  would ask them to keep is the one already written down and already broken by it.

Remedy 1 is the only one that makes the load frame deterministic, which is the property the review
habit needs: a screenshot taken at 150 ms and one taken at 2 s have to be the same picture.

## What moves

`fixtureRefresher` currently takes its own anchor read from the `now` it is handed:

```ts
const anchor = fixtureAnchor(pin, now(), scale);
```

That read becomes a **required `loadedAt` option**, and `now` keeps its one remaining job — the
moving window, read on every refresh. The seam #80 and #62 argue for does not move: the anchor is
still taken once, at load, and still never re-read. What changes is *whose* load instant it is.

Required rather than defaulted, deliberately. A default of `now()` would let a caller that forgot the
parameter reproduce the bug silently, which is the same failure mode as the generated build footer
(ADR 0002) and gets the same answer: make the omission impossible rather than survivable.

`main.ts` then reads the clock once for the whole of the load:

```ts
const loadedAt = now();
const clock = analogClock({ …, time: loadedAt });
…
const refreshFixture = fixtureRefresher({ scale, pin: clockPin, loadedAt, now, setEvents });
```

Nothing else needs to change. The pinned cases are already immune — `createTimeSource` on a frozen
pin returns one instant however often it is called — so this is a fix for the unpinned load, which is
the one a reviewer opens by default.

## Why the boundary then reads as elapsed rather than as a drain

Worth stating, since the fix makes an event end at *exactly* the frame's `now` rather than avoiding
the coincidence. `computeDrainFraction` is strict at both ends:

```ts
if (nowAngle <= trueStartAngle || nowAngle >= trueEndAngle) return undefined;
```

With `anchor = loadedAt − 3h`, 🔴 Deadline's `at(3, 0)` end is `loadedAt` exactly, so `nowAngle ===
trueEndAngle` and it draws no drain — and on the next tick it is past, so it draws none then either.
The arc is elapsed in both frames, which is the same picture at 150 ms and at 2 s.

This is the strictness #153 had to separate from `hasEventInProgress`, which is inclusive at the
start. Both stay as they are; only the clock read moves.

## Tests

Two, in `fixture-refresh.test.ts`, which already fakes the system clock for exactly this class of
bug (#80's regression is the same shape: a read of the wrong clock that no count of emissions could
see).

1. **The mechanism, fixture-agnostic and scale-swept.** Construct one refresher with the system
   clock still at `loadedAt` and another with it advanced past it, and assert the two hand the dial
   the *same events*. On `main` every timestamp in the second differs by the elapsed delay, so this
   fails there for both scales; after the change the anchor cannot see the delay at all.
2. **The symptom, as #152 reports it.** With the clock advanced between the two reads, exactly one
   of the emitted arcs is mid-drain at the dial's own `loadedAt` — asserted through
   `computeDrainFraction` on resolved angles, which is what actually decides a drain (#153), not
   through `hasEventInProgress`, which disagrees on precisely this boundary.

The second is 12-hour only, and that is a measurement rather than an omission: the 1-hour fixture's
nearest event to its own boundary is `"p"`, ending `at(3)` against a 5-minute look-behind, so a
sub-second delay cannot move it across `now`. The race is scale-independent; the *visible* drain it
produces is the 12-hour fixture's boundary coincidence.

## Verify by rendering

The issue's own recipe: sample the gradient id list at 150 ms and at 2 s on the unpinned preview.
They must agree, and both must carry `arc-drain-n-drain` alone. A screenshot of the load frame goes
in the PR beside one taken after it settles — the point being that they are the same picture.
