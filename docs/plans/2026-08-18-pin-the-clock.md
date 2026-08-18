# Pin the dial to a chosen time

**Status:** in review
**Issue:** [#72](https://github.com/BenSeymourODB/clock-face-schedule/issues/72)
**Docs:** ADR 0005 (browser-local time is authoritative), ADR 0003 (no geometry server-side),
#25 (the rolling window the fixture is anchored to), #28 (the drain this makes reviewable),
#71 (the defect that hid behind the missing pin), #62 (fixture drift — adjacent, not fixed here)

## What this ships

One seam for "what time is it", and two URL parameters that move it:

- `?now=04:15` or `?now=2026-08-18T04:15` — the clock reads that instant and **runs on from it**.
- `&freeze=1` — the clock holds still, so a screenshot is reproducible. Usable alone, to stop the
  real clock without moving it.

Both work on the deployed app (templated through `doGet`, like `demo`) and in
`build/preview.html?now=…`, which has no server and reads its own query string. A pinned clock
labels itself on screen for the same reason demo mode does.

## The measurement that changed the design

The issue proposed `?now` on the premise that a pinned time selects which fixture states appear,
and offered `04:15` as giving "a mid-drain 🟤 ⚽ and ⚫ Staff Debrief with ⚫ Assembly elapsed".

**That is not what the fixture does, and no value of `?now` would make it true.**
`sample-events.ts` is anchored to `getRollingWindow(now).windowStart`, which is `now − 3h`. Every
event's offset *relative to now* is therefore a constant, and the elapsed / draining / future
partition is invariant under any change of `now`:

| Event | Start, relative to `now` | End | State at load |
| --- | --- | --- | --- |
| ⚪ Breakfast Club | −250 min | −160 min | elapsed, crosses the leading edge |
| 🎮 Game Time | −150 | −60 | elapsed |
| 🔴 Deadline | −120 | **0** | elapsed — ends *exactly* at `now` |
| 🟣 Study | −90 | −30 | elapsed |
| ⚫ Assembly | +15 | +60 | future |
| 🟤 ⚽ | +62 | +86 | future |
| ⚫ Staff Debrief | +60 | +90 | future |
| 🟡 Lunch | +90 | +140 | future |
| 🟠 🎂 Reading and Snacks | +220 | +295 | future |
| 📚 Reading | +300 | +310 | future |
| 🟣 🧸 Free Play | +320 | +385 | future |
| 🔵 Parent Teacher … | +390 | +460 | future |
| 🟢 Aftercare | +470 | +615 | future |

Four elapsed, nine future, and **nothing in progress** — `hasEventInProgress` is false at load, at
every time of day. So the preview has never once drawn a draining arc, which is the mechanical
reason #71 (the drain masks never draining) survived #28 *and* #27: reproducing a mid-drain arc was
not merely inconvenient, it was unreachable through the supported entry points.

The issue's `04:15` figures come from reading the fixture's `at(4, 2)` offsets as clock times. That
holds only when `windowStart` is midnight — i.e. when `now` is 03:00 — and even then ⚽ is 62
minutes in the future rather than mid-drain.

## Consequence: the pin has to move the fixture's phase

`?now` alone would deliver nothing on the demo dial beyond rotating the whole picture, so this
change also decides the fixture's anchor:

- **Unpinned** — anchor stays `getRollingWindow(now).windowStart`, exactly as #25 chose it, so the
  whole fixture lands inside whatever window is live at load.
- **Pinned** — anchor becomes `getDayStart(now)`, that day's midnight. The fixture's offsets then
  read as clock times, and the phase between `now` and the anchor becomes the pinned time of day.

The two coincide at `?now=03:00`, where midnight *is* `now − 3h`. So the default picture is "as if
pinned to 03:00", and the rule is one sentence: **pin the clock and the fixture pins to that day;
leave it live and the fixture follows the window.**

Rejected: anchoring the fixture to midnight unconditionally. That is what #25 moved away from, and
it would leave the fixture invisible outside a few hours of the day.

Not fixed here: the fixture still has nothing in progress when unpinned, so the drain is reachable
only *via* a pin. Adding a permanently mid-flight event changes the default picture every previous
visual review was judged against, which is the maintainer's call rather than a side effect of this
change. Filed separately.

## Where the seam lives

`src/shared/clock/time-source.ts`, pure and node-testable:

- `parseClockPin(now, freeze, reference)` → `ClockPin | null`. Accepts `HH:MM[:SS]` (that time on
  the reference date), `YYYY-MM-DD(T| )HH:MM[:SS]` (local), and the same with an explicit `Z` or
  `±HH:MM` offset. Anything else returns `null`.
- `createTimeSource(pin, readRealClock?)` → `() => Date`. Null pin reads the real clock; a frozen
  pin returns its origin forever; an unfrozen pin returns `origin + (real elapsed since creation)`.
- `describeClockPin(pin)` → the on-screen label.

**Unparseable input fails open to the real clock, and says nothing.** A wall showing the real time
is the safe wrong answer; a wall showing an invented time with no label is not.

`src/client/clock-pin.ts` reads the two values from the mount's `dataset` (server-templated) and
falls back to `location.search`, which is what makes the server-less preview work. Empty counts as
absent — the preview's scriptlet stripping leaves `data-now=""` behind, so that is the common case
rather than an edge one.

`doGet` passes the parameter through **as authored** and parses nothing: the browser is
authoritative for time (ADR 0005), and the server has no business deciding what "04:15" means.
`<?= ?>` rather than `<?!= ?>`, because this value comes from the URL.

## A trap worth naming

`data-demo="1"` sits inside a `<? if (showDemo) { ?>` guard, and the preview builder strips
scriptlets while **keeping what they guard** — which is exactly how demo mode is always on in the
preview. Writing `data-freeze="1"` the same way would have frozen every preview permanently. So
both new attributes are emitted unconditionally with a templated *value*
(`data-freeze="<?= freezeClock ?>"`), which strips to `""`. There is a test asserting that the
stripped template yields no pin.

## Phases

1. The shared seam and its tests.
2. Client wiring: `clock-pin.ts`, `main.ts` through the seam, the on-screen label, the fixture
   anchor, `doGet` and `Index.html`.
3. Visual pass: render the pinned states, screenshot, and write the times table from what was
   actually rendered rather than from what the offsets predict.

## The times table

Written in phase 3 from measurement, and kept in `README.md` where a contributor looks for it.
