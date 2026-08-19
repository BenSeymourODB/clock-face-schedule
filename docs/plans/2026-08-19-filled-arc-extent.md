**Status:** in review
**Issue:** #66
**Docs:** #27 (the outline's contrast pass, which scoped itself to strokes), #26 (elapsed outlines),
#74 (the ground the band actually has), #15 (visibility must not depend on a calendar-chosen
colour), ADR 0007 (theme tokens), `docs/plans/2026-08-18-contrast-safe-event-colours.md`

# Give a filled arc's body a floor, so its extent can be read

## The defect

A viewer reads how long a block lasts from where its body starts and stops. For the two darkest
palette colours the body does not read at all: composited at the arcs' `fill-opacity` of 0.85 over
the band's ground `#0c0e12`, ⚫ gray-800 measures **1.25:1** and 🟤 amber-800 **2.28:1**.

What reveals a ⚫ arc today is incidental — the title sitting on it, and the `var(--card)` separator
tracing its boundary. The separator is itself only **1.15:1 against a ⚫ fill**, so it marks the
edge only where an adjacent arc supplies the contrast. On the fixture, ⚫ Staff Debrief and Planning
reads as a dark *gap* beside the 🟤 ⚽ arc rather than as a block of its own.

#27 scoped its contrast adjustment to strokes on the stated reasoning that "a filled arc does not
need it — `readableTextColor` already guarantees its text." That holds for the text and not for the
extent, and it is the extent this display is for.

## Why the obvious fix was rejected, and why it is now the right one

The issue's own body rejects "apply #27 to fills too" because lightening ⚫ toward `#7b8189` flips
its title from white to black, making the change a redesign rather than a patch. **That objection is
threshold-dependent, and false at the threshold the standard actually asks for.** #27 floors at
4.5:1, WCAG AA for *text*. A filled arc is a non-text object, and WCAG 1.4.11's floor for one is
**3:1**.

`readableTextColor`'s black/white crossover for ⚫ sits at a floor of **3.34:1**:

| floor | ⚫ fill | its title |
| --- | --- | --- |
| 2:1 | `#47505b` | white |
| **3:1** | `#666d77` | white |
| 3.34:1 | `#70767f` | the crossover |
| 3.5:1 | `#737a82` | **black** |
| 4.5:1 — #27's stroke floor | `#888e95` | **black** |

3:1 is the largest round floor that leaves every palette title exactly where it is.

## Measured, against the palette the code actually uses

`COLOR_EMOJI_MAP` in `clock-utils.ts`, `EVENT_COLORS` and `DEFAULT_COLOR` in `map-event.ts` — all
21 colours the dial can be handed, floored on the **composited** value rather than the authored one,
since the 15% of ground `fill-opacity` mixes back in is part of what a viewer sees:

| colour | authored | composited | floored | now | title |
| --- | --- | --- | --- | --- | --- |
| ⚫ gray-800 | `#1F2937` | **1.25** | `#666d77` | 3.00 | white, kept |
| 🟤 amber-800 | `#92400E` | **2.28** | `#a25b30` | 3.01 | white, kept |
| 🟣 purple-500 | `#A855F7` | 3.81 | untouched | — | black, kept |
| 🔴 red-500 | `#EF4444` | 3.96 | untouched | — | black, kept |
| 🔵 blue-500 | `#3B82F6` | 4.10 | untouched | — | black, kept |
| g11 Tomato | `#dc2127` | 3.10 | untouched | — | white, kept |
| the other 15 | — | ≥ 4.20 | untouched | — | kept |

**Two colours move, and they are the two the issue names.** Every other colour the dial can receive
— including all eleven of Google's own event colours, which are light — is returned exactly as
authored. No title flips.

The issue comment's table listed 🔵 and 🟣 as moving by a fraction of an 8-bit step; that was
computed against a different set of hexes (`#2563eb`, `#9333ea`) than `COLOR_EMOJI_MAP` holds. On the
real palette they clear 3:1 outright and are not touched at all.

### It does not propagate into the elapsed state

#27's outline is derived from the authored colour. Derived from the floored one instead it would
move by **one 8-bit step** (⚫ `#747b83` → `#747b84`, 🟤 `#aa6b44` → `#ab6b44`), so the two are
interchangeable and the outline is left reading the authored colour — the elapsed treatment is
#27/#74's, and this change stays out of it.

### It dissolves the separator problem rather than trading it

The separator is `var(--card)`, and #74's plan records why the obvious fix for it is worse than the
defect: a boundary stroke resolved to 4.5:1 against the band gives ⚫ `#747b83`, *the same colour an
elapsed ⚫ arc's outline takes*, so every live arc would carry the mark that means "this one is
over". Flooring the fill needs no such trade — it gives the existing separator something to work
against:

| | separator vs fill, before | after |
| --- | --- | --- |
| ⚫ | 1.15 | **2.76** |
| 🟤 | 2.10 | **2.77** |

## What ships

1. **`adjustCompositeForContrast(color, background, alpha, minRatio)`** in
   `src/shared/clock/contrast.ts`, beside `adjustForContrast`. Same minimal hue-preserving blend
   toward the ground's far extreme, same binary search; the difference is that the predicate is
   measured on `compositeOver(background, candidate, alpha)` rather than on the candidate itself.
   At `alpha = 1` it reduces exactly to `adjustForContrast`, which is asserted rather than claimed.
2. **`event-arc.ts` floors the fill once, at the top**, and uses the floored colour everywhere the
   painted fill is the subject: the fill path, `readableTextColor` for a live title, and the
   `compositeOver` / `textFlipCoverage` pair that decides where a draining title changes colour.
   Deriving the title from the floored fill is more correct anyway — `readableTextColor`'s own
   comment admits it ignores `fill-opacity`, and the floored value is nearer what is painted.
3. **The outline keeps reading the authored colour** (see above).

## Not in scope

- **The elapsed outline's ground (#74).** Untouched; `adjustForContrast(color, …)` keeps whichever
  constant `main` holds.
- **The separator's own colour (#66's second option).** Rejected above and by #74's plan; the
  floored fill is what makes it unnecessary.
- **A floating label's connector**, which strokes the authored colour on the page ground at
  `CONNECTOR_OPACITY`. Same class of defect, different element, and it is not the arc's extent —
  measured and filed separately rather than folded in here.
- **Theme-awareness of the ground (#81).** `BAND_BACKGROUND` is still a literal.

## Phases

1. **The shared function and its spec** — pure, node-testable, with the `alpha = 1` equivalence and
   the monotonicity/minimality properties `adjustForContrast`'s spec already pins.
2. **The renderer** — floor once, thread it through fill, title and drain seam; specs asserting the
   ⚫ fill is no longer the authored hex, that its composited value clears 3:1, and that a colour
   already clearing it is painted exactly as authored.
3. **Visual pass** — the filled / elapsed / draining trio together, which is what the issue asks
   for: `?now=04:15&freeze=1` puts ⚫ Staff Debrief and 🟤 ⚽ mid-drain, and the unpinned preview has
   ⚫ Assembly future and the cluster elapsed. Confirm the floored ⚫ reads as a block *without*
   reading as elapsed.
