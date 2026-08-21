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

Nothing else needs to change, and every pinned case is already immune — for two different reasons,
which is worth splitting because only one of them is the obvious one:

- `?freeze=1`, with or without `?now=`, because `createTimeSource` on a frozen pin returns one
  instant however often it is called.
- `?now=` **without** `freeze`, where two reads genuinely differ — `origin + (Date.now() −
  createdAt)` — but a displaced pin is anchored through `getDayStart`, which quantises to midnight.
  A sub-second difference cannot move that, short of a load spanning midnight itself.

So this is a fix for the unpinned load, which is the one a reviewer opens by default.

## Why the boundary then reads as elapsed rather than as a drain

Worth stating, since the fix makes an event end at *exactly* the frame's `now` rather than avoiding
the coincidence. `computeDrainFraction` is strict at both ends:

```ts
if (nowAngle <= trueStartAngle || nowAngle >= trueEndAngle) return undefined;
```

With `anchor = loadedAt − 3h`, 🔴 Deadline's `at(3, 0)` end is `loadedAt` exactly, so `nowAngle ===
trueEndAngle` and it draws no drain — and on the next tick it is past, so it draws none then either.
The arc is elapsed in both frames, which is the same picture at 150 ms and at 2 s.

**On this boundary the two functions agree**, and an earlier draft of this document had that
backwards. `hasEventInProgress` is `start <= now && now < end` — inclusive at the start, *exclusive*
at the end — so an event ending exactly at `now` is out by both measures. The disagreement #153 is
about is at the **start** boundary, where an event beginning exactly at `now` keeps the rebuild
cadence ticking and draws no drain. Both stay as they are; only the clock read moves.

## Tests

Three in `fixture-refresh.test.ts`, which already fakes the system clock for exactly this class of
bug (#80's regression is the same shape: a read of the wrong clock that no count of emissions could
see), plus one on the load path itself.

1. **The mechanism, fixture-agnostic and scale-swept.** Construct one refresher with the system
   clock still at `loadedAt` and another with it advanced past it, and assert the two hand the dial
   the *same events*. On `main` every timestamp in the second differs by the elapsed delay, so this
   fails there for both scales; after the change the anchor cannot see the delay at all.
2. **The symptom, as #152 reports it.** With the clock advanced between the two reads, exactly one
   of the emitted arcs is mid-drain at the dial's own `loadedAt` — asserted through
   `computeDrainFraction` on resolved angles, which is what actually decides a drain, rather than
   through `hasEventInProgress`, which is one boolean over the whole set and so cannot say *which*
   arc drains.
3. **The pinned dial, held where it already was.** Not a regression risk today (see the two
   immunities above), and that is the point: it is the case a later reader "simplifying" the anchor
   back to a local read would still see pass, and pinned dials are what every screenshot in this
   repo is judged on.

The second is 12-hour only, and that is a measurement rather than an omission. On the 1-hour fixture
a later anchor can only *gain* a drain by dragging an event's end past `now` — `"p"` ends `at(3)`
against a 5-minute look-behind, so **120 s** of margin — or *lose* one by dragging a start past it —
`"q"` begins `at(4)`, so **60 s**, which is the binding figure and still sixty ticks away. The race
is scale-independent; the *visible* drain it produces is the 12-hour fixture's boundary coincidence.

### And one on the load path, because that is where the bug was

Both files the bug touched were already fully covered, and the bug was the *order* the host called
them in. So the required `loadedAt` option closes the omission (`main.ts` cannot forget to pass one)
but not the wrong value: **`loadedAt: now()` at the call site typechecks, keeps all 1,508 tests
green, and puts both drains straight back on the built preview.** Verified by doing it.

`main.ts` is a top-level script and has no spec, so `main-load-order.test.ts` reads it as source —
the only place that shape is visible — and asserts the dial's `time` and the refresher's `loadedAt`
name one identifier, that the identifier is a bare variable rather than a call, that the refresher's
arguments contain no clock read, and that exactly one `now()` read precedes the dial. A source-shape
assertion buys nothing about behaviour and rots if the load path is restructured, so every pattern is
required to match and a miss throws saying so — the answer `clock-pin.test.ts` already gives for
README's prose.

The same argument retires `analogClock`'s `time = new Date()` default in passing. All six call sites
already pass a time, so requiring it costs nothing, and what it removes is a clock read outside
#72's `?now` / `?freeze` seam that a future caller could reach for by omission.

## Verify by rendering

The issue's own recipe: sample the gradient id list at 150 ms and at 2 s on the unpinned preview.
Measured on the built preview at 1920×1080, at 150, 300, 600, 1,200 and 2,500 ms, the list is the
same four entries throughout — `arc-fade-z-start`, `arc-fade-n-drain`, `arc-drain-n-drain`,
`arc-fade-y-end` — of which exactly one is a drain. Before the change, `arc-drain-b-drain` was a
fifth entry at the first three samples and gone by the fourth.

The picture, too, and it is visible rather than only a DOM difference — the remaining fill at
🔴 Deadline's tip is sub-pixel, so this could have gone the other way. Diffing the four-deep cluster
at 3× between the load frame and the settled frame *within one load*: **981 pixels** past 16/255 on
`main` (max channel delta 228), against **1** after (max 38, which is 2.35 s of legitimate drain
motion). `main`'s differing pixels all sit in one 19 × 35 CSS-px box at 🔴 Deadline's end, and what
they show is the elapsed outline's **end cap missing** — the arc terminates open at 150 ms, reading
as damage, and is closed again at 2,500 ms.

Three pinned dials (`?now=04:15`, `03:00`, `08:30`, each frozen) render pixel-identical before and
after: 0 of 2,073,600 on all three, which is the immunity argument above, measured.
