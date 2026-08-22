# Brainstorm: concurrent events in the agenda panel, and what a cursor can mean there

**Status:** open reasoning for #40 (the playhead) and #41 (the display modes), neither of which is
ready to build. Nothing here is decided. It adds two things the issues did not have: the concurrency
and speed figures #40 flags as risks are now **measured** rather than intuited, and the panel is
shown to have a concurrency defect **today**, before any cursor exists. Two inputs from the owner
(2026-08-22) are folded in and are treated as settled: **the cards may be set smaller than they are
now**, and **every card must state its start and end times** — which is #169, and which ADR 0009's
third amendment already makes affordable.

**Issue:** #40 and #41, under the #36 epic. The defect in "What the panel does today" is not filed.
**Docs:** `docs/brainstorms/2026-08-17-agenda-panel.md` (the panel's purpose and the original
statement of this problem), ADR 0009 and its third amendment (the 180 units, the 21.26 body, the
270.7 ceiling), #169 (the times line), #174 (the type lever, decided; the width lever, held for
#138), #70 (why the panel carries names at all).

## What the panel does today, rendered

Built at 1920×1080 and looked at, which is what found this. At **`?now=01:45&freeze=1`** the panel
draws five cards — 🎮 Game Time, 🔴 Deadline, 🟣 Study Skills, 🟠 Swimming Group B, 🟡 Tidy Up — as a
plain vertical sequence. **Four of those five are running at that instant**, and the dial a few
hundred units to the left draws the same four as concentric rings, which is the whole point of the
dial.

> **The two halves of the display contradict each other about the same five events at the same
> moment.** The dial says "these are simultaneous"; the panel says "these happen one after another".

The unpinned frame carries a quieter version of it: `⚫ Staff Debrie...` (04:00–04:30) is drawn
directly above `🟤 ⚽` (04:02–04:26), and ⚽ runs entirely *inside* Staff Debrief. Two consecutive
cards, nothing to say they are concurrent.

Two smaller things the same screenshots show, both relevant to what a cursor would be added to:

- **No card says whether it is running.** In the unpinned frame 🟡 Tidy Up is draining on the dial and
  its card is indistinguishable from the four future ones beside it.
- **No card says when anything happens.** The trailing line is a duration (`44 min`), which is #169.

So the concurrency problem is not a consequence of adding a cursor. **It is a defect the panel
already has, and the cursor is what would make it visible.** That reordering matters: a design that
only makes the cursor coherent, without making concurrency legible, fixes the smaller half.

## The reframe: a cursor is a claim about the axis

One horizontal line across a column asserts that **the column's vertical axis is time**. The panel's
axis is not time — it is *order*, and card height comes from title wrapping (deliberately, and
correctly: `docs/brainstorms/2026-08-17-agenda-panel.md` rejects duration-proportional height because
it re-imports the sliver failure the two-time-scales work exists to fix).

Concurrency is therefore not a special case to patch. **It is the proof that the axis is not time.**
Everything below follows from choosing one of three answers to that, and the interesting result is
that the two cases #40 lists as undefined — gaps and overlaps — are the *same* case: both are
positions on a time axis that the list's order does not have.

### How often the line has no honest position — measured

Swept at one-minute steps over each fixture's whole span:

| | 12-hour fixture | 1-hour fixture |
| --- | --- | --- |
| span | 14.08 h | 1.30 h |
| minutes with **2+ events running** | 144/845 = **17.04%** (2.40 h) | 14/78 = **17.95%** |
| minutes with **nothing running** (#40's gap case) | 99/845 = 11.72%, longest gap 55 min | 6/78 = 7.69% |
| most running at once | **4** | 3 |
| **minutes with exactly one honest cursor position** | **71.24%** | 74.36% |

Cursors a frame would need, swept at five minutes over the drawn column at 21.26:

| cursors | 0 | 1 | 2 | 3 | 4 |
| --- | --- | --- | --- | --- | --- |
| share of frames | 11.24% | 71.60% | 8.28% | 7.10% | 1.78% |

**A single line is right for about seven-tenths of the day**, and the fixture is a plausible
classroom shape rather than an adversarial one. That is the number the "pick one as primary" answers
have to be worth.

### The speed risk, quantified for the first time

#40 says the line's speed "means nothing" and asks for it to be looked at. It can also be priced:

- **Within one drawn column** (unpinned pin, 21.26): the line crosses 🟠 Reading and Snacks at 1.27
  units a minute and ⚫ Staff Debrief at 3.18 — a **2.50×** spread visible in one glance.
- **Across the fixture**: 📚 Reading (10 min) and 🟢 Aftercare (145 min) both draw a **65.53-unit
  card**, so two cards of identical height are crossed at **14.50×** different speeds. On the 1-hour
  fixture, 17.88×.

Identical geometry, order-of-magnitude different speeds. For an audience that reads motion
intuitively rather than decoding it, that is the risk #40 names, and 14.5× is what it is worth.

## What the owner's two inputs change

**Smaller type.** ADR 0009's third amendment already takes the body to **21.26** (#174, decided
2026-08-22, not yet built — 26 is what renders). The owner's note here says smaller still is
legible, so the exchange rate is worth having in one place:

| body | mm, 4 ft board | distance/150 | chars a line at 180 | 3-line cards fitting |
| --- | --- | --- | --- | --- |
| 26.00 — as it renders | 45.11 | 6.77 m | 9 | 5 |
| **21.26 — as decided** | 36.89 | 5.53 m | **12** | **6** |
| 17.52 — the floating-label body | 30.40 | 4.56 m | 14 | 7 |
| 15.00 | 26.03 | 3.90 m | 17 | 8 |
| 13.00 | 22.55 | 3.38 m | 19 | 9 |
| 11.00 | 19.09 | 2.86 m | 23 | 10 |

Every unit an indent, a rail or a lane takes is bought out of this table. That is the currency the
options below are priced in.

**Times on every card (#169).** `HH:MM–HH:MM` is 11 characters and fits from 21.26 down, so #169
stops being blocked and becomes a layout cost. Rendered on the fixture at the unpinned pin, with a
real times line in place of the duration:

| body | cards drawn, times line | times line kept on | cards with no trailing line at all |
| --- | --- | --- | --- |
| 21.26 | **7** | 7 of 7 | 11 |
| 17.52 | 8 | 8 of 8 | 11 |
| 15.00 | 9 | 9 of 9 | 11 |

**The times line costs four of the eleven remaining events at 21.26.** A smaller face for the times
only (the #144 shape) saves 8.76 units a card at 15, 11.56 at 13, 14.36 at 11 — and buys a seventh
card only at an 11-unit times face.

### The times do not solve concurrency, and the reason is the product's own argument

With `04:00–04:30` above `04:02–04:26`, a reader **can** work out that the two overlap. That reader
is doing clock arithmetic, and the README names people who find clock arithmetic hard as the audience
this is built for. Concurrency has to be **perceivable, not merely decodable** — which is the same
argument that put concentric rings on the dial rather than a list. So the times line is necessary and
is not an answer here.

## Family A — make the axis time, and put concurrent events side by side

The honest version of the original suggestion: if the column is a timeline, one line is correct, and
overlapping events must be in lanes because they occupy the same y.

**Measured, it does not survive the width.** The fixed overhead of a card — border stroke, the
12-unit swatch reserve, and 2 × 6 of padding — is 25.40 units at 17.52, and lanes pay it each:

| lanes | overhead | share of the 180-unit column, before a single glyph |
| --- | --- | --- |
| 1 | 25.40 | 14.11% |
| 2 | 55.80 | **31.00%** |
| 3 | 86.20 | 47.89% |
| 4 | 116.60 | **64.78%** |

Characters a line, as the cards are actually built:

| body | 1 lane | 2 | 3 | 4 |
| --- | --- | --- | --- | --- |
| 26.00 | 9 | 3 | 1 | 0 |
| **21.26** | **12** | **4** | 2 | 1 |
| 17.52 | 14 | 5 | 2 | 1 |
| 13.00 | 19 | 8 | 4 | 2 |

Priced again with **every per-lane overhead removed** — no lane swatch, no lane border, one shared
padding, a 4-unit internal gap — which is the best case lanes can have:

| body | 1 | 2 | 3 | 4 |
| --- | --- | --- | --- | --- |
| 21.26 | 13 | **6** | 4 | 3 |
| 17.52 | 15 | 7 | 5 | 3 |
| 13.00 | 21 | 10 | 6 | 4 |

Against what a lane has to carry — 25 titles and 69 words across both fixtures: median word **5**
characters, 75th percentile 7, longest **10**; six words need nine or more (Conference, Reflection,
Breakfast, Committee, Aftercare, Reminders); median *title* 13 characters.

> **Two lanes hold 6 characters at 21.26 in the best case and 4 as built** — under the fixture's
> median title and under its longest single word. At the 270.7-unit ceiling #174 prices, two lanes
> reach 8. Four lanes, which the fixture's cluster needs, reach 3.

**And the timeline costs reach as well as width.** A lane layout whose y is not time is not a
timeline, so heights must be duration-proportional, and then a one-line card sets the shortest event
that can carry a name:

| body | one-line card | 2h window | 3h | 4h | 6h | 12h |
| --- | --- | --- | --- | --- | --- | --- |
| 21.26 | 35.76 | 7.15 min | 10.73 | 14.31 | 21.46 | 42.92 |
| 17.52 | 30.53 | 6.11 min | 9.16 | 12.21 | 18.32 | 36.63 |

Events falling below a one-line card, of the 25 across both fixtures, at 21.26: **5** at a 2-hour
window, 6 at 3h, 8 at 4h, 9 at 6h, **13** at 12h. Meanwhile the list as it stands reaches a mean of
**4.06 h** ahead at 21.26 (3.34 at 26, 4.42 at 17.52, 5.58 at 13).

**So a timeline honest about a ten-minute event covers under three hours — less than the list already
reaches — and that is before lanes take the width.** This family re-imports exactly the failure the
brainstorm rejected it for, and the arithmetic agrees with the prose.

**Variant worth naming and rejecting with it:** an *elastic* axis, with a minimum card height so short
events stay legible. It buys the heights back and gives up the one property the family exists for —
the axis stops being linear, so the cursor's speed is a lie again, and lanes still cost the same
width.

## Family B — dissolve the cursor into the cards

Drop the shared line. Give **every card its own progress indicator**. Then *n* concurrent events have
*n* indicators, each correct, and concurrency stops being a case at all — including the four-deep
one, and including the 11.24% of frames where nothing is running and there is simply nothing to draw.

This is the family that makes the problem disappear rather than absorbing it, and it is nearly free.

- **B1 — drain the card.** The dial's own elapsed/draining treatment (#26/#28), applied to the card:
  the spent part of the card reads as spent. **Zero new units, zero characters** — it reuses geometry
  the card already draws. Its strongest argument is not the cost: the panel and the dial would then
  say the same thing the same way, where today the panel says nothing about state at all.
- **B2 — drain the swatch.** The 8-unit identity patch runs the card's full inner height and is
  already where the eye goes. Zero units. **The risk is that it is the identity channel** — #118
  added it precisely because a card had none, and the light half of the palette washes to ~1.00:1
  without it. Draining *value* while keeping hue may hold; that is a looking question, not an
  arithmetic one.
- **B3 — a rule under the text.** An explicit 4-unit progress bar per card: 4 units a card, **4.01%
  of the column over six cards.** More literal than B1 and it reads as a bar rather than as damage,
  at a real but small cost.
- **B4 — say it in words.** "12 min left" instead of, or beside, a moving mark. The most literal
  possible answer for readers who cannot do clock arithmetic, and it competes for the same trailing
  line the times now occupy — so it costs characters, not units.

**What this family gives up:** the single line was also a *whole-column* reading — "the day has got
to here". Per-card indicators answer "how far through each event", never "how far through the day".
Whether that second reading is the panel's job at all is the open question, and Family C is what
answers it if it is.

## Family C — keep the list, move the time axis somewhere it is real

- **C1 — an hour rail.** A narrow ruler down one side of the column, linear in time, carrying the now
  marker. Affordable: a two-character hour label needs **15.60 units at 13** or 21.02 at 17.52, and
  taking 16–20 units off the column costs **two characters a line at 21.26** (12 → 10).
  **The catch, which is the fork's real cost:** the rail is linear in time and the cards are not, so a
  bracket tying a card to its extent on the rail cannot sit at both the card's y and the time's y.
  Draw it at the card's y and the rail's scale is a lie; draw it at the time's y and connectors cross
  other cards. With six to eight cards over four hours that is a lot of crossing lines. A rail carrying
  **only the now marker and the hours**, with no per-card bracket, avoids it entirely and still gives
  the whole-column reading Family B loses.
  A rail printing each event's *own* times is a different price and not affordable: `HH:MM` needs
  **52.56 units at 17.52**, which costs five characters a line (12 → 7).
- **C2 — the dial is the rail.** Draw no cursor in the panel at all. The dial already answers "where
  has the day got to" — with hands, against numerals at 28.62 units, in the middle of the board — and
  the panel answers "what is it called and when". **Zero cost**, and it should be the baseline every
  other option is measured against, because #40 has never been priced against doing nothing.

## Cross-cutting: how the list states concurrency at all

Independent of the cursor, and still needed under every family above — B and C both leave concurrent
events as adjacent cards, which is the defect rendered at the top of this document.

| | what it costs | what it buys |
| --- | --- | --- |
| **Indent the nested event** | 12 units = 1 character at 21.26; 16 units = 2 | cheap, conventional, reads as nesting |
| **A spine down a concurrent run** | same units as an indent | reads as *grouping* rather than as hierarchy |
| **One group card, k titles** | 2 concurrent = 95.29 u (15.93% of the column) at 21.26; 3 = 125.06 (20.90%); 4 = 154.82 (25.88%) | cheaper than k separate cards, and it *states* the concurrency; but one line per event at 12 characters ellipsizes hard |
| **A word — "+ 2 at the same time"** | one line, only in the ~17% of minutes it applies | no structural change; weakest perceptually |
| **Nothing; let the times say it** | free | fails the audience argument above |

The group card is the one that interacts with #41: in scrolling mode the highlighted position holds
"what is running", and what is running is 2+ events for 17% of the day — so **the highlight is
naturally a group slot rather than a card slot**, and sizing it for four is 25.88% of the column.

## Where the measurements point — not a decision

Family A is the only one measurement can close on its own: at any body size the panel can legibly
use, two lanes cannot carry the fixture's own titles, and the timeline that would justify lanes
covers less of the day than the list already does. Recording it so it is not re-proposed.

Between B and C the arithmetic does not decide, and it should not: B is free and makes concurrency a
non-case; C keeps the whole-column reading B gives up. **They also compose** — per-card drains plus an
hour rail carrying only "now" is the combination that answers both questions, at two characters a
line. That is the shape worth rendering first.

## Still undecided

1. **Whether the panel owes a whole-column "where the day has got to" reading at all**, given the dial
   is on the same screen doing exactly that. Everything else here follows from it. C2 is the free
   answer and has never been tested against #40.
2. **Which per-card indicator**, if Family B — card, swatch, or explicit rule — and whether draining
   the swatch damages the identity channel #118 built.
3. **How far the type goes.** The table above is the exchange rate; 21.26 is decided and anything past
   it is new. Indents, rails and group cards are all paid for out of it.
4. **What the times line displaces.** It costs four of eleven events at 21.26, and a countdown (B4)
   wants the same line.
5. **#41's highlight slot**, if it must hold a group rather than a card.

## What would settle it

Render, per `CLAUDE.md` — the character budgets come from `CHAR_WIDTH_RATIO = 0.6`, which is
deliberately crude, and distance/150 is an AV convention rather than a measurement of these glyphs.
Three pins are enough, and they must be named, because the panel's contents **do** vary with `?now=`
(a `?now=` pin is displaced, so the fixture re-anchors to midnight and the phase moves — unlike the
unpinned dial, whose states are invariant):

| pin | what the panel is being judged on |
| --- | --- |
| `?now=01:45&freeze=1` | the worst case — **five cards, four of them running at once**. Not currently in the README's pin table, which reaches this cluster at `01:30` where only three are running. |
| `?now=04:15&freeze=1` | one event nested wholly inside another (⚽ inside Staff Debrief), both draining |
| unpinned | one running, one future overlap, nothing concurrent — the case that must not be the only one looked at |

**A gap the fixture has.** The unpinned frame — the one anybody who opens the preview sees without
knowing to ask — has exactly **one** event running and no concurrent pair. Two cards running at once
is reachable only by pinning. That is the shape of #71/#76 exactly: a drain that drained nothing
shipped through two releases because the default picture did not contain one. So the fixture probably
wants a second event straddling the +3:00 anchor beside 🟡 Tidy Up.

**It is not free, and the constraint should be recorded with the suggestion:** 🟡 Tidy Up currently
overlaps only 🔴 Deadline, deliberately, so that it opens no fifth ring and the four-deep cluster
keeps its thickness. Anything added beside it trades the panel's default concurrency case against the
dial's ring-depth budget, and that trade needs deciding rather than discovering.
