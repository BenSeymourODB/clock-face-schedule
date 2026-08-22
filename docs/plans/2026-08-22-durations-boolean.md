# Whether durations are shown is one setting, not four gates

**Status:** done — shipped in [#191](https://github.com/BenSeymourODB/clock-face-schedule/pull/191)
**Issue:** [#178](https://github.com/BenSeymourODB/clock-face-schedule/issues/178)
**Docs:** [`docs/brainstorms/2026-08-22-toggles-and-the-duration-promise.md`](../brainstorms/2026-08-22-toggles-and-the-duration-promise.md)
(the four candidate meanings and why three of them are dead),
[#179](https://github.com/BenSeymourODB/clock-face-schedule/pull/179) (the sweep behind them),
[ADR 0008](../DESIGN.md) (a mode nobody knows was changed — the hazard this setting has the worst
case of), [#175](https://github.com/BenSeymourODB/clock-face-schedule/pull/175) (the redirect that
filed #178), [#34](https://github.com/BenSeymourODB/clock-face-schedule/issues/34) / `chosenScale`
(the URL-parameter shape this copies)

## What is decided, and by whom

The owner, redirecting #175: *"if we're going to offer to show event durations on arcs and cards we
should make that a configurable option for the teacher to set, and it should be a boolean one: do or
don't show event durations, across the board."* The fallback chain — `arc → card → panel`, with the
panel explicitly **not** guaranteed — is decided in
[#178's comment of 2026-08-22](https://github.com/BenSeymourODB/clock-face-schedule/issues/178#issuecomment-5378277897),
along with the default (`flag(true)`) and the control (URL parameter now, the top bar later).

What that comment also decides is the wording, and it is the part that bounds this plan:

> **The honest wording is #179's meaning 3, with meaning 2 as the destination:** every card states
> its length, and an arc states it whenever it carries a title.

and the sequencing:

> Buildable before #146 only as a partial chain, and the partial version should say so rather than
> claiming the promise.

**This is the partial version.** It ships the switch and the three readers. It does not close the 89
duration-less cards that meaning 3 needs — that is #177's growth work — and it does not reach the
379 arcs with no identification at all, which is #146's. Both stay open and the PR says so.

## Why a switch is not "today's behaviour with a flag on it"

Option 3 of #178's body — *arc and card where they fit, silent elsewhere* — is ruled out explicitly
as the answer to the promise question. It is not ruled out as a **step**, and the distinction is what
the measurement supports: with the switch **off** the display is consistent by construction, because
no surface draws a duration at all. The illegible state #178 was filed about is the mixed one, and
off is the only state currently reachable that is not mixed.

Off also buys room rather than merely removing text, which is worth measuring rather than asserting:

- the arc gets back the line `fitDurationLine` takes under a one-line title (#35);
- every floating card is cleared against one line fewer, because `fitLabelToClearedWidth` starts at
  `maxLines + 1` whenever a trailing line is on offer, so a card that offers a duration is charged
  for it whether or not it draws one (#183's mechanism, arriving here as a benefit);
- the panel card drops its trailing line, freeing a line of the column's 26-unit body.

## The shape

One preference, three readers, one parameter.

### The preference

`showEventDurations: flag(true)` in `src/shared/preferences.ts`. The registry's own rule is that *"a
key here is a promise that something reads it"*, which is why #178 is where it lands rather than
being guessed at when the registry was written: this change is the readers.

`true` is the default because an unconfigured board then changes nothing but the consistency — the
weaker of the two directions ADR 0008 warns about, since a board that has never been configured
still shows what it shows today.

### The parameter

`?durations=1` / `?durations=0`, in exactly `chosenScale`'s shape and for exactly its reason: the
deployed page runs in an HtmlService iframe on a rotating origin, so the browser never sees the URL
the viewer typed. `doGet` passes the parameter through **as authored** onto the mount, the client
falls back to its own query string, and `build/preview.html` — which has no server and arrives with
the attribute stripped to `""` — is served by the query string alone.

The parameter's alphabet is the preference's own (`1` / `0`), parsed by
`PREFERENCES.showEventDurations.parse`. One parser, so the URL form and the stored form cannot
drift, and an unrecognised value falls through to the stored preference rather than being repaired.

Resolution order, most specific first: templated attribute → the page's own query string → the
stored preference → the registry default. The parameter overriding the store is the whole point of
it — #178 asks for *"a URL parameter for checking it on the device"*, and a store that won could
only ever be checked from a workstation.

### The three readers

| surface | site | today | gated |
| --- | --- | --- | --- |
| the arc | `event-arc.ts`, `fitDurationLine` under a one-line title | 336 arcs (16.6%) | not called at all when off |
| the floating card | `analog-clock.ts`, the `duration` handed to `floatingLabelGeometry` | 407 cards (20.1%) | `undefined`, which is the path a sub-minute event already takes |
| the panel card | `panel-layout.ts`, `agendaEntries`' `trailing` | 974 of 974 | `undefined`, same path |

Each reader takes a boolean rather than reaching for the store: `src/shared/` cannot see the client,
`agendaEntries` is pure, and a renderer that read a preference itself would be untestable at the one
place the property matters.

## Phases

1. **The preference and the parameter.** Registry entry, `doGet` pass-through, `Index.html`
   attribute, and the client's resolution — with the ordering asserted at each layer.
2. **The three readers.** One boolean threaded to each, defaulting to `true` so a caller that does
   not care keeps today's behaviour, and asserted at the rendered attribute rather than at the call.
3. **Render and measure.** `?now=23:30` (the worst pin, 2 of 13) and `?now=05:00` (the best, 8 of
   14), on and off, at 16:9 with `#status` hidden. What off buys goes in the PR as a measured
   before/after, not as the prose above.

## What this deliberately does not do

- **It does not force a card to state its length.** `planOptionalLines` still declines a duration
  where the line would cost a collision (#136), so with the switch on the 89 duration-less cards
  remain. That is meaning 3's other half and it is #177's, because the answer is to grow the card,
  not to accept the collision.
- **It does not promote anything to a card.** #146's 379.
- **It does not touch either arc gate.** #179 measured relaxing the lone-arc rule at 31 arcs (1.5%)
  and withdrew the "correctness tidy-up" framing: the rule is a legibility gate, and freeing depth 2
  would draw duration text at 9.99 units where the card channel deliberately uses 17.52.
- **It does not add a visible control.** The switch waits on the top bar (#85, #47). #179's finding
  is that ADR 0008's hazard binds *harder* here than on any other preference — a hidden duration is
  indistinguishable from one that did not fit — which is an argument for the bar, not for holding
  the setting until the bar exists.
