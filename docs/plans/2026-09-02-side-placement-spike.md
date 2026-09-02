# Plan: the side-placement comparison spike

**Status:** in progress — the spike renders the fork; the three decisions in #138 stay open and #138
says what is outstanding
**Issue:** #138
**Docs:** `docs/brainstorms/2026-08-21-label-placement-fork.md` (the reasoning either branch must
keep), ADR 0009 in `docs/DESIGN.md` (the allocation every locus figure is spent out of)

## What is being built, and what is deliberately not

The owner's call on #138, 2026-08-22: *"build the comparison spike and settle the fork by looking"* —
side placement **behind a flag**, rendered against the ring, judged from the pictures. Explicitly
**not** a commitment to Branch B, and not an answer to the body's three decisions; the spike is what
answers them.

So the shipped dial must be untouched. The flag is query-string only, the default path is byte-for-byte
the ring, and nothing is written to `PropertiesService`: a spike is not a preference, and a board that
had accidentally stored one would keep drawing an experiment after the experiment ended.

## The spike's first step, done: the stale tables re-run at the measured grants

The 2026-09-02 comment on #138 leaves this for whoever takes the spike — every locus figure on the
issue and in the brainstorm is costed against a margin 8.4% low, and ADR 0009's fourth amendment
tells a reader to re-run them before briefing this. Re-run here against the grants #213 measured off
the running client (**244.1** on 16:9, **175.0** on 16:10, panel drawn), driving the shipped
`floatingLabelGeometry` over θ ∈ [45°, 135°] at 0.5° steps with the longest fixture title
(`👩‍🏫 Parent Teacher Conference Planning Committee`) and a duration line offered.

Cross-checks before believing any of it: the ring locus reproduces **562.7** for the sector's worst
card bottom (#138's own figure) and **204.4 / 87.6 units into the band** (#184's 87.56), and the
furthest card edge saturates at exactly the board limit, 544.1 and 475.0 — the clamp binding, as it
should.

| 16:9, margin 244.1 | width budget | chars | lines | clearance (band 292) | worst bottom (`#status` 600) |
| --- | --- | --- | --- | --- | --- |
| ring 297.84 — today | 155.2 | 12 | 4 | 204.4 | **562.7** |
| R = 340 | 250.4 | 19 | 4 | 204.4 | 571.7 |
| **R = 380 — the width optimum** | **328.2** | **29** | **3** | 205.3 | 596.2 |
| ADR circle, 418.1 | 252.1 | 19 | 4 | 245.8 | 635.4 |
| **band-clearing, 451.8** | 184.2 | 13 | 4 | **292.0** | **659.3** |

| 16:10, margin 175.0 | width budget | chars | lines | clearance | worst bottom |
| --- | --- | --- | --- | --- | --- |
| ring 297.84 — today | 155.2 | 12 | 4 | 204.4 | **562.7** |
| **R = 340 — the width optimum** | **250.4** | **19** | 4 | 204.4 | 580.2 |
| ADR circle, 383.5 | 183.0 | 13 | 4 | 237.7 | 611.0 |
| **band-clearing, 427.0** | 87.1 | 6 | 4 | **292.1** | **641.7** |

Three things move, and one of them moves against the direction the 2026-09-02 comment expected:

1. **The band-clearing locus moves *outward*, not inward: 413.2 → 451.8 on 16:9, 382.1 → 427.0 on
   16:10.** A larger grant is a wider card, a wider card has more radial extent, and more extent has
   to be pushed further out to clear the band. So the favourable correction to *width* is an
   unfavourable one to Option B's vertical overshoot: **+59.3 units past `#status`**, against the
   +32.0 the issue prices it at.
2. **The width optimum is at R ≈ 380 on 16:9 and R ≈ 340 on 16:10** — 29 and 19 characters a line,
   against the ring's 12. `CLAUDE.md`'s recorded lesson ("pushing labels outward has an optimum")
   arriving again at the new grants, and the optimum is *inside* the ADR circle on both boards.
3. **No locus in the sector keeps a card above `#status`.** The best is the ring itself at 562.7;
   R = 320 is already at 578.3 and everything wider is past 600. `#138`'s *"cannot reach the status
   line at all"* holds only at today's radius — which is the correction the second decision-mode
   comment made, now re-measured at the real grants.

That is the fork stated in one line: **the ring's radius is the only one that clears `#status`, R ≈ 380
is the only one that buys the characters, and only R ≈ 452 clears the band.** Three properties, three
radii, and the spike's job is to show what each looks like.

## What the flag does

Two parameters, query-string only, on the preview and behind `?demo=1` on the deployed app:

- `?labels=sides` — confine every card to two side sectors instead of spacing them round the ring.
- `?locus=<number>` — override the label locus radius in viewBox units. Works on the ring too, which
  is the cheap way to sweep radii on a board without a rebuild.
- `?locus=wide` — ADR 0009's `292 + (m + 8)/2` from the *granted* margin, so it tracks the board.

`?locus=` is what makes the flag worth having over three hard-coded variants: the three radii above
are measured against *this* fixture, and a maintainer looking at a real calendar can walk them.

**There is deliberately no `?locus=clear`.** A band-clearing mode would have to *solve* for the
radius, and the second decision-mode comment measured that the implicit equation
`R = 292 + extent(θ) + gap` never settles for 26.1% of cases at 16:9 — a bounded limit cycle of mean
amplitude 27.6 units, because `charBudget` floors to whole characters. The remedy is a scan, and a
scan over the sector costs thousands of layout passes on every render of a dial that rebuilds once a
minute. The band-clearing radius is a *measured number* instead — 452 on 16:9, 427 on 16:10 — and
`?locus=452` is the same picture at none of the cost. If the fork lands on that locus, solving it
properly is its own piece of work rather than a spike's.

## Sector assignment and order — decision 1's default, and no more

Right-half anchors to the right sector, left-half to the left, each card's bearing **clamped into the
sector and kept in its anchor's own angular order**. That is #138's stated default ("ordered by time
down each side... matches the existing clockwise sort") with one deliberate difference recorded here:
the order is *angular*, so on the left sector later events sit higher rather than lower. "Early high,
late low" and "matches the clockwise sort" contradict each other on the left half of a dial, and
keeping a card near its own arc is the property decision 1 says actually costs something.

Crowding is resolved by spreading, not by even spacing: cards start at their clamped anchor bearing
and are pushed apart only as far as their own heights demand, inside the sector's bounds. An
uncrowded card therefore stays next to its arc, and a full sector degrades to even spacing. Where the
sector cannot hold them all, the pass distributes evenly and leaves the overlap to `stackLabels`,
which still runs — whether displacement remains necessary under side placement is decision 3's second
half, and the honest way to answer it is to leave it in and count how often it fires.

The angular separation a card needs is taken from its height at its *clamped anchor* bearing, one
pass. Height depends on bearing depends on height; the spike takes the first-pass height rather than
iterating, for the same reason the locus is scanned rather than solved.

## Phases

1. **Shared geometry.** `src/shared/clock/side-placement.ts` — sector assignment, the min-gap spread,
   and the locus rules that need no layout. Unit-tested in node.
2. **Renderer.** `cardAngle` on `FloatingLabelParams` (the card's bearing, defaulting to the anchor's,
   so the connector keeps pointing at the arc); `labelPlacement` and `labelLocus` on `analogClock`;
   the band-clearing scan beside `floatingLabelGeometry`. Tested under jsdom on rendered attributes.
3. **Host.** `?labels=` and `?locus=` in `main.ts`, README's parameter table, and the pin table if
   the numbers there move (they must not — the default path is unchanged).
4. **Visual pass.** Render `?now=11:00`, `?now=13:00`, `?now=19:00` and unpinned, at 1920×1080 and
   1920×1200, for the ring and for `sides` at each of the three radii. Look at them, attach them, and
   report what the pictures say that the tables do not.

## What this plan does not decide

All three of #138's decisions, and the fork itself. The spike hands the maintainer pictures and the
numbers above; #138 stays open with the options as the two decision-mode comments state them.
