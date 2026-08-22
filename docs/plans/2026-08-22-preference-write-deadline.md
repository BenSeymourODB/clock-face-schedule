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
- **The deadline rejects**, so `drain` runs on the existing `sent.then(drain, drain)` path and there
  is no second code path to keep correct.

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

One wrapper, applied at both send sites:

```ts
function withDeadline<T>(sent: PromiseLike<T>): Promise<T>
```

It arms the injected timer, races it against `sent`, and cancels it on either outcome. Both existing
send paths keep their shapes — `save(…)` and `reset(…)` are simply wrapped — so `drain` and `adopt`
are unchanged.

Three properties fall out of the promise's own settle-once semantics rather than out of new code, and
each is worth an assertion because each is a way the fix could be worse than the stall:

- **A late answer cannot drain twice.** Once the deadline has rejected, the outer promise is settled;
  the real answer arriving afterwards resolves nothing. Without that, a slow-but-alive write would
  send the queue's next entry at the deadline *and again* on its own completion — the second send
  racing whatever the first one started, which is exactly #84's defect.
- **A late reset echo is not adopted.** A timed-out reset is a failed reset, and a failed reset does
  not adopt. Adopting an echo that arrived after the store had moved on would apply a reading of the
  layer beneath that a later write has already superseded.
- **A settled write disarms its deadline.** Otherwise every write on a board left up for weeks leaves
  a live timer behind it, and a stray one firing while a *different* write is in flight would abandon
  that healthy write's turn.

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

`src/client/preferences.test.ts`, a new `the store, with a write that never settles` block. Every
assertion is on the sequence of writes, as the #84 block's own header requires — the deadline is the
mechanism and the property is that the queue keeps moving.

The one that matters is the **negative** one: a write that never settles must not stop the next write
from being sent. Asserting only that the timer fires would pass without testing the property this
issue exists to protect.

- a queued write is sent once the abandoned one's deadline passes (**fails on `main`** — never sent)
- the abandoned write's own value is not resent, matching the failed-write policy
- a reset that never settles is abandoned the same way, and the queue moves
- a write settling normally sends its follow-up at the settle, not at the deadline
- a settled write's deadline is cancelled, so no stray timer is left armed
- a late answer after the deadline does not send the next write a second time
- a late reset echo after the deadline is not adopted
- the deadline the store asks for is 10 s
- a timed-out write is reported to the console, so the failure leaves a trace on a board nobody is
  watching

That last one is the one addition beyond the decision's list, and it is a line rather than a
mechanism. `main.ts` already logs `preference not saved` / `preference not reset` for the sibling
failure, and those logs sit *upstream* of this wrapper — so without a line here a timed-out write
would be the only failure in this store with no record anywhere.

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
