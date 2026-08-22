# A deadline on a preference write, so one that never settles cannot silence the store

**Status:** done — shipped in [#168](https://github.com/BenSeymourODB/clock-face-schedule/pull/168)
**Issue:** [#122 — A preference save that never settles stalls every save after it, where the old
fire-and-forget could not](https://github.com/BenSeymourODB/clock-face-schedule/issues/122)
**Docs:** #84 (the single-flight queue this is the cost of), #83 (`resetPreferences`, the second
writing operation through the same queue), #31 / #82 (why preferences are server-side at all), ADR
0006 (a healthy round trip is 0.5–2 s, which is where the 10 s comes from), `docs/DESIGN.md` —
platform constraints, on the rotating origin that makes a bridge call able to neither succeed nor
fail

## What is decided, and by whom

Everything. #122's decision comment settles all four parts, and this plan exists to record the
mechanism they imply rather than to re-open any of them:

> **Decided: treat a timed-out write as failed and drain, at 10 seconds, with an injectable clock.**

- **Failed and drain**, not fatal and stop. For an unattended wall display the recovery path is worth
  more than the certainty: a store that stops persisting until someone reloads the board is a worse
  end state than a rare out-of-order write, and the stall has *no symptom* — the screen stays
  correct, and only a reload reveals it.
- **10 seconds.** ADR 0006 prices a healthy round trip at 0.5–2 s, so 10 s is five times the slow
  end. Not 2 s, which would race routinely on a loaded board; not 60 s, which leaves a minute of dead
  queue per occurrence and gives most of the value back.
- **An injectable clock**, because the store is pure today apart from the `save` it is handed, and
  reaching for `setTimeout` inside it would need fake timers in a suite that currently uses none.
- **A timed-out write is treated as failed**, so it reaches `drain` and the queue moves.

The fourth is the one this plan departs from in *mechanism* while keeping in *outcome*, and it is
recorded in "The road not taken" below rather than left for a reader to notice. #122 asks for the
deadline to **reject**, so that `drain` runs on the existing `sent.then(drain, drain)` path. It does
not reject; the timer ends the turn directly. The reason is a property the rejecting version quietly
loses.

## The defect, as a sequence

`preferenceStore` holds at most one write in flight and sends the next when that one settles. `drain`
runs on fulfilment *and* rejection, so a failed write costs its own value and not the ones behind it.
What it does not cover is a promise that does neither:

```
set({ timerMuted: true })          → sent; the bridge never answers
set({ timerDurationSeconds: 900 }) → queued
set({ showSeconds: false })        → coalesced into the same queued patch

writing stays true forever
nothing is ever written again, for the life of the page
```

On a board that has been up for a fortnight, "the life of the page" is a fortnight. This is the one
axis on which #84's fix can be worse than the fire-and-forget it replaced: that could lose a write
and could order two wrongly, but it could not *stop writing*.

`callServer` rejects through `withFailureHandler`, and a missing footer entry rejects synchronously
inside the promise constructor, so an ordinary error settles. What is left is a bridge that neither
succeeds nor fails: the sandboxed iframe torn down mid-call, or the origin rotating while a call is
out.

## The mechanism

`writeTurn()` — one write's **turn** at the queue. It arms the injected timer and returns an
`end(finish)` that runs at most once, so the turn is closed by whichever of the server's answer and
the deadline arrives first. Both send sites call it, and the answer handlers become `end(drain)`:

```ts
const end = writeTurn();
save(encodePreferences(patch)).then(
  () => end(drain),
  () => end(drain)
);
```

`over`, a boolean per turn, is what makes it once, and it carries the correctness:

- **A late answer cannot drain twice.** The deadline has already closed the turn, so the real answer
  arriving afterwards does nothing. Without that, a slow-but-alive write would send the queue's next
  entry at the deadline *and again* on its own completion — the second send racing whatever the first
  started, which is exactly #84's defect arriving as the cure for the stall.
- **A late reset echo is not adopted.** A timed-out reset is a failed reset, and a failed reset does
  not adopt. This is more load-bearing than it first looks: after the deadline drains, a value set
  since is *sent* rather than queued, so `adopt`'s "only where nothing is queued for this key" guard
  cannot speak for it, and the echo would clobber a newer user value with nothing to stop it.
- **`over` is per turn, so a stale timer cannot reach a later write either.** It finds its own turn
  over and returns.

### What cancelling is actually for

Worth stating precisely, because the obvious answer is wrong and was written down here first.
Cancelling the timer on an answer is **not** what stops a stale deadline draining a later write —
`over` does that, per the point above, and it is unreachable by construction rather than merely
guarded. Nor does an uncancelled timer accumulate: `setTimeout` is one-shot, so live timers are
bounded by the writes of the last ten seconds however long the board has been up.

What cancelling protects is the **log**. An uncancelled timer firing after its write succeeded would
print an abandoned-write line for a write that landed. So the warning goes *inside* the turn, where
`end` runs it only if the deadline is what ended the turn — true by construction rather than by
`clearTimeout` winning a race. Cancelling is then housekeeping: a wasted callback, not a defect.

### The road not taken

The rejecting version #122 asks for is a wrapper — `withDeadline(sent)`, a `Promise.race` between the
answer and a timer — and it is genuinely tidier in two ways: settle-once comes from the promise rather
than from an `over` flag, and neither send site changes.

It is not built because it silently converts a documented synchronous throw into an asynchronous
rejection. `sendValues` puts its `.then` *inside* the `try` deliberately, and the comment says why: a
`save` returning something un-thenable throws there, and that throw has to reach the `catch` rather
than escaping into a click handler with the queue shut. Wrap the call in a `Promise` executor and the
throw becomes a rejection instead — the queue still drains, a microtask later, but the existing
comment stops being true and the property stops being synchronous. Keeping the turn explicit costs a
boolean and keeps that path exactly as it was.

One hazard the wrapper would not have, and which the explicit version therefore has to close by hand:
`end` closes over the canceller, so a `schedule` firing its callback synchronously would reach it in
the temporal dead zone and throw out of `set` — permanent silence, the failure this whole change
exists to remove. `let cancel: () => void = () => undefined` before `end`, assigned after, is the
whole of the fix. Only a spec supplies a `schedule` and none does that, but the option is public on an
exported interface and one line is cheaper than trusting it.

## The 10 seconds, and the race it does and does not reintroduce

The decision's own arithmetic, restated so the constant is not a bare number in the source:

| | round trip | verdict |
| --- | --- | --- |
| ADR 0006, healthy | 0.5–2 s | settles well inside the deadline |
| **the deadline** | **10 s** | 5× the slow end of a healthy trip |
| 2 s | — | races a merely-loaded board routinely |
| 60 s | — | a minute of dead queue per occurrence |

Being honest about what is bought: past 10 s a slow-but-alive write **does** race the one behind it,
which is #84's defect in the timeout case only. That is the trade the decision made deliberately, and
the reason 10 s rather than 2 s is the number: the race has to be rarer than the stall it prevents.

## Tests

`src/client/preferences.test.ts`, a new `the store, with a write that never settles` block — thirteen
assertions. The one that matters is the **negative** one: a write that never settles must not stop the
next write from being sent. Asserting only that the timer fires would pass without testing the
property this issue exists to protect.

- a queued write is sent once the abandoned one's deadline passes (**fails on `main`** — never sent)
- the abandoned write's own value is not resent, matching the failed-write policy
- a reset that never settles is abandoned the same way, and the queue moves
- a write settling normally sends its follow-up at the settle, not at the deadline
- a settled write's deadline is cancelled, so no stray timer is left armed
- a late answer after the deadline does not send the next write a second time
- a late reset echo after the deadline is not adopted
- the write *after* an abandoned one gets a deadline of its own — a bridge that has stopped answering
  stops answering every write, so arming once would shut the queue one write later
- a synchronous throw from either `save` or `reset` still drains at once, and disarms
- the deadline the store asks for is 10 s
- a store built with no injected clock arms a real `window.setTimeout`
- a timed-out write is reported to the console

**Most are on the sequence of writes, as the #84 block's header requires; three are not, and the
exception is deliberate.** `clock.delays`, `clock.armed()` and the `setTimeout` spy pin the timer
itself. The 10 s is a decision from #122 rather than plumbing, and the spy is the only thing standing
between the deadline and never reaching a board — every other spec injects a clock, so a default that
armed nothing would leave all of them green.

The console line is the one addition beyond the decision's list, and it is a line rather than a
mechanism. `main.ts` already logs `preference not saved` / `preference not reset` for the sibling
failure, and those logs sit *upstream* of this deadline — so without a line here a timed-out write
would be the only failure in this store with no record anywhere. The visible-surface half of it is
#167.

### One property that is structural rather than tested

The log's truthfulness — that an abandoned-write line never describes a write that succeeded. Moving
the warning back outside the turn fails **no** spec, because `cancel` makes the stray-fire state
unreachable, so there is no state a test can put the store in to observe it. It is held by where the
line sits, not by an assertion, which is why the reasoning is in the source beside it.

## Not in scope

**Nothing on the dial changes**, so there is no screenshot to take: this is `preferenceStore`'s queue
and its spec. No geometry, no colour, no text, and nothing server-side. The preview is checked for the
one thing that could regress — that the page still loads and the dial still draws.

**Surfacing store health in `?check=1`** is deliberately left out, and filed as #167. #122 calls it
*"a good idea independently"* that *"does not require the store to give up to be worth having"*, and
it is a different thing from this change: this one keeps the queue moving, that one would tell a
human the bridge is not answering.

**No retry of an abandoned write.** The store's existing bargain — a lost write costs the next
reload's memory of a setting rather than interrupting a lesson — covers a timed-out write for exactly
the reasons it covers a refused one, and a retry loop on a display left up for weeks costs more than
the setting does.
