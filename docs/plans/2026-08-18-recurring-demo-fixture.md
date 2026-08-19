# Recur the demo fixture, so a long-running display never empties

**Status:** in review
**Issue:** [#62](https://github.com/BenSeymourODB/clock-face-schedule/issues/62)
**Docs:** [../DESIGN.md](../DESIGN.md) (ADR 0005), `src/client/sample-events.ts`

## The bug

`#25` replaced the fixed 12-hour period with a rolling window that moves continuously, and the
fixture is anchored to `getRollingWindow(now).windowStart` **once, at load**. Real time keeps
advancing; the fixture's absolute timestamps do not. So the window walks off the fixture and the
dial empties.

Measured against the live fixture (14 events, window 660 minutes wide, `now` at anchor + 180):

| Hours after load | Events still in the window |
| --- | --- |
| 0 | 14 |
| 4 | 9 |
| 8 | 4 |
| 11 | 1 |
| 13.5 | **0** |

A display left on `?demo=1` overnight — the accidental case, not the intended one — is blank by
morning.

## Why not "re-anchor to the current window"

The first option in the issue is to regenerate the fixture on the poll interval, re-anchoring to
the window that is live *then*. That empties nothing, but it breaks something worse: the anchor is
`now − 3h`, so **every event's offset relative to `now` becomes a constant**, and the elapsed /
in-progress / future partition never changes. Nothing ever drains, nothing ages out, and the dial
stops showing the one thing it is for. #76 measured exactly that invariance as the reason the
drain masks of #71 survived two rounds of review.

## The fix: tile the fixture, with the period taken from its own span

The second option — "anchor to wall-clock time modulo some period, so they recur predictably" —
keeps time moving. Copy `k` of the fixture sits at `anchor + k × P`, and the dial is handed every
copy that reaches the window. Events then elapse, drain and age out exactly as they do today; what
changes is that a fresh copy arrives from the trailing edge before the old one has left the
leading one.

`P` is **not a chosen constant**. It is the fixture's own span — the earliest start to the latest
end, `−50 min` to `+795 min`, so `P = 845 min` (14.08 h) — derived from the generated events
rather than written down, so it stays correct when the fixture gains or loses an event. That
choice is what makes the tiling exact:

- **Copies abut and never overlap.** Copy `k`'s first event starts at the instant copy `k − 1`'s
  last event ends, so the seam adds no concurrency: peak overlap depth stays **3** at every phase,
  which is the depth the fixture was designed around. A period chosen by hand (12 h, say) would
  overlap the copies and manufacture a four-deep cluster nobody authored.
- **The load-time picture is unchanged, exactly.** At load the window is `[anchor, anchor + 660]`;
  copy `−1` ends at `anchor − 50` and copy `+1` starts at `anchor + 795`, so neither reaches it.
  Verified as a set comparison, not by eye: the events visible at load are the same 14, with the
  same ids. Every screenshot this repo has judged the fixture by still shows what it showed.
- **No phase is ever sparse.** Swept minute by minute across a full period, the window holds
  **10–14** events — floor first reached at phase 270 — against the 14 → 0 the current behaviour
  decays through. Over a week, at most two copies are ever emitted at once.

### Ids

Ids reach the DOM as `data-testid="event-arc-<id>"`, so copy 0 keeps its bare ids (`a`, `b`, `z`)
and only the neighbours are suffixed — `z@1`, `y@-1`. Nothing that refers to the fixture by id has
to know the recurrence exists.

### Where the work goes

- `src/client/sample-events.ts` — `sampleEvents` is untouched; `fixtureCopyIndices` and
  `recurringSampleEvents` are added beside it, both pure and both node-testable.
- `src/client/main.ts` — the demo branch keeps its load-time anchor and refreshes on the same
  interval as the real poll, re-emitting only when the set of copies actually changes. The clock
  already re-filters `currentEvents` against the live window on every render, so the scrolling
  itself needs no help; the refresh exists only to hand it copies it has not been given yet.

## Not in scope

- **Making the load-time picture contain an in-progress event** (#76). The tiling puts one in the
  window at most phases as a side effect, but at phase 0 it cannot: the fixture has nothing
  straddling `now`, which is #76's own open decision to settle.
- **Composing with `?now` / `?freeze`** (#72, PR #75). Two things for whoever merges second, and
  neither is automatic:
  - That PR routes every time read through `now()`, and `refreshFixture` reads `new Date()`. A
    frozen clock must freeze the copy set too: left reading real time, the copies walk out of the
    window the dial is still drawing and the demo goes blank after about two hours. The fix is to
    take the window from the same source the tick does.
  - That PR also introduces a `fixtureAnchor` helper, and this branch had a local of that name.
    Renamed to `anchor` here, since the collision would have shadowed the helper with no compile
    error and no failing test.
  A displaced pin re-anchors the fixture to midnight, which recurrence leaves alone — the phase is
  still measured from whatever anchor it is given.
