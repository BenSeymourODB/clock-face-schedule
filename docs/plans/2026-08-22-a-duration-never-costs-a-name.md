# A duration line never bought with a character of the title

**Status:** in progress — [#141](https://github.com/BenSeymourODB/clock-face-schedule/issues/141) outstanding until this ships
**Issue:** [#141](https://github.com/BenSeymourODB/clock-face-schedule/issues/141)
**Docs:** [#136](https://github.com/BenSeymourODB/clock-face-schedule/issues/136) /
[#142](https://github.com/BenSeymourODB/clock-face-schedule/pull/142) (the pass that hands the line
back, where this was measured), [#35](https://github.com/BenSeymourODB/clock-face-schedule/issues/35)
/ [#68](https://github.com/BenSeymourODB/clock-face-schedule/issues/68) (the duration channel and
the pass that declines it), [#98](https://github.com/BenSeymourODB/clock-face-schedule/issues/98)
(the priority ordering this is judged against),
[#144](https://github.com/BenSeymourODB/clock-face-schedule/issues/144) /
[#145](https://github.com/BenSeymourODB/clock-face-schedule/issues/145) (the two the arithmetic here
does *not* settle), `docs/brainstorms/2026-08-21-label-placement-fork.md` (which records this as
#142's deferred half)

## The mechanism, restated

`floatingLabelGeometry` sizes a card's *width* against the tallest it may become, so a card that asks
for a duration is cleared against `MAX_LINES + 1` and comes out narrower — before a character is
placed. `fitLabelToWidth` then wraps the title into that tighter budget, and past it truncates with
an ellipsis. The duration is not paid for out of empty space; it is paid for out of the title.

That is correct where the payment is a **re-wrap** — the same words across different lines — and
wrong where it is a **truncation**, because an ellipsis is a silent loss. `Swimming Group B Kit Check
and...` does not tell a reader what was dropped, and the card exists at all *because* the arc could
not carry that name. The duration is recoverable from the arc's own angular extent by anyone willing
to do the arithmetic; the name is recoverable from nothing.

## What it costs today, measured

`build/preview.html` at 1920×1080, both scales, every 15 minutes — 192 pinned states, 496 cards —
comparing the built preview against a build with the offer suppressed entirely, so each card is read
at both of its sizes rather than inferred:

| | cards |
| --- | --- |
| gained a duration line | **407** |
| …title text unchanged | 358 (87.9%) |
| …title **re-wrapped**, same words | 28 |
| …title **newly ellipsized** | 20 |
| …already-ellipsized title **cut deeper** | 1 |

So 49 cards pay something and **21 of them pay in characters — 237 characters of event name across
the sweep.** The issue's own figures (10 gained, 4 with a title cost) were measured against #142's
branch before [#148](https://github.com/BenSeymourODB/clock-face-schedule/pull/148) granted the
labels the board's spare width; the margin widens every card, so both columns grew.

**The last row is a case the issue does not name.** At `?now=13:15` the 👩‍🏫 card goes from
`👩‍🏫 Parent Teacher / Conference / Planning...` to `👩‍🏫 Parent / Teacher / Conference...` — already
ellipsized either way, so "declines only where the title would *newly* ellipsize" lets it through,
and `Planning` disappears. The rule shipped here is keyed on the characters shown rather than on the
marker, so it catches that one with the other twenty.

## The decision, and how it was settled

#141 lists four answers. Two are ruled out on the numbers and one on looking:

- **Accept it** — what ships today. Costs the 237 characters above.
- **Size the card against the lines it actually uses.** Removes the cost at its source and
  reintroduces the circular dependency `faceClearanceLimit`'s docstring exists to avoid. Out of
  scope here; it wants a fixed point of its own.
- **Decline any change to the rendered lines.** Costs 28 of the 49 gains — measured as 386 duration
  lines against this rule's 358 — to buy nothing a reader can see.
- **Decline only where characters are lost.** 386 duration lines, and **zero** characters of name
  given up. Shipped.

The last two differ only on whether a re-wrap counts, which #141 correctly calls a looking question.
Rendered at `?now=10:30&freeze=1`, where the two disagree on the 🎂 card:

| | the card |
| --- | --- |
| decline any change | `🎂 Reading and` / `Snacks` — no duration |
| **decline only a loss** | `🎂 Reading` / `and Snacks` / `1 hr 15` |

The re-wrapped card reads at least as well — the break is better balanced, if anything — and it
states the event's length. Giving `1 hr 15` up to keep a line break is not a trade this display
should make.

## Shape

`keepsItsName` in `src/shared/clock/duration-cost.ts`, pure and node-testable, comparing the two
laid-out line arrays the renderer already has. `analogClock` withholds the offer — `grown: null` —
where it returns false, so the decision lands *before* `planOptionalLines`: the text cost depends on
the card's own width budget and not on its neighbours, so there is nothing for the fixed point to
reconsider. `grow-labels.ts` stays geometric, which is what its own header asks for.

Two details the comparison has to get right, both guarded:

- **Whitespace is dropped rather than normalised.** `packLines` may break a run of emoji between
  glyphs that had no space between them, so re-joining the lines would invent one and read as a
  change. Comparing the non-space characters is indifferent to where a line broke, and a truncation
  only ever removes characters from the end, so a shorter result is always a real loss.
- **The duration line is checked for, not assumed.** `fitLabelToWidth` drops a trailing line it
  cannot fit rather than widening the card, so a grown card can come back carrying the narrower
  width and no duration at all — worse than declining even with the title intact. The fixture
  produces no such card in 192 states; the rule refuses it anyway rather than relying on that.

## Not in scope

- **#145** — an event whose *arc* title wraps to two lines can state its duration nowhere. A
  different surface question, and its own table shows a smaller face cannot open it.
- **#144** — setting the duration line in a smaller face. Independent of this rule: it would shrink
  the height the card is cleared against, which changes how often the rule has anything to refuse,
  and its own measurement says it buys zero characters a line at the positions where width is
  scarce.
- **The 21 cards that keep their name and lose a duration.** They are the point of the change rather
  than a residue, but where the *panel* (#36) lands, a name the band cannot carry has somewhere else
  to go and this trade gets cheaper. Noted rather than deferred: nothing here blocks it.
