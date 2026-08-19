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
| the other 14 | — | ≥ 4.10 | untouched | — | kept |

**Two colours move, and they are the two the issue names.** Every other colour the dial can receive
— including all eleven of Google's own event colours, which are light — is returned exactly as
authored. No title flips.

The issue comment's table listed 🔵 and 🟣 as moving by a fraction of an 8-bit step; that was
computed against a different set of hexes (`#2563eb`, `#9333ea`) than `COLOR_EMOJI_MAP` holds. On the
real palette they clear 3:1 outright and are not touched at all.

### It does not propagate into the elapsed state

#27's outline is derived from the authored colour, and measured against `DIAL_BACKGROUND` —
`#16181d`, which is the face's ground rather than the band's, the error #74 corrects. Derived from
the floored colour instead it would move by **one 8-bit step** (⚫ `#7b8189` → `#7a8189`,
🟤 `#af724d` → `#af724c`), so the two are interchangeable and the outline is left reading the
authored colour: the elapsed treatment is #27/#74's, and this change stays out of it. The same
comparison against the band's ground, which is where #87 will move that call, is also one step
(`#747b83` → `#747b84`), so the conclusion holds either side of that merge.

### It dissolves the separator problem rather than trading it

The separator is `var(--card)`, and #74's plan records why the obvious fix for it is worse than the
defect: a boundary stroke resolved to 4.5:1 against the band gives ⚫ `#747b83` — **the colour an
elapsed ⚫ arc's outline will take once #87 lands**, and 1.09:1 from the `#7b8189` it takes today.
So every live arc would carry the mark that means "this one is over". Flooring the fill needs no
such trade — it gives the existing separator something to work against:

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
- **A floating label's connector** (#93), which strokes the authored colour on the page ground at
  `CONNECTOR_OPACITY = 0.6`. Same class of defect, different element, and it is not the arc's
  extent — measured (⚫ **1.15:1**, 🟤 1.68, 🟣 2.46, 🔵 2.60) and filed rather than folded in.
  It needs its own call at its own alpha, not the arc's floored value: 0.6 mixes back more ground
  than 0.85 does, so reusing the fill's answer would under-correct.

  Worth saying plainly, because deferring it **creates** an asymmetry rather than preserving one:
  before this change a ⚫ arc and its connector were both invisible, and the fixture floats ⚫ Staff
  Debrief deliberately. After it, the arc is a solid readable block joined to its label by nothing.
  That is a smaller defect than the one being fixed, and it is a new shape of it.
- **`adjustForContrast`'s blend target** (#95). It picks by thresholding the ground's luminance at
  0.5, where the black/white crossover is at 0.1791, so on a mid-tone ground it blends toward the
  *nearer* extreme and can miss a floor the other one reaches. Latent — its one caller measures
  against `#16181d` — and not corrected here, because that call site is what #87 is editing.
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

## What the render showed

Built, served `build/preview.html`, and compared 4× crops against the same crops built from `main`
at `2678871`. Three things the numbers above would not have told us:

- **The defect is worse than "an arc with low contrast".** Before, the two ⚫ arcs and the bare band
  between them are *one* dark region: the 🟤 ⚽ arc appears to float unattached, and the two
  `var(--card)` separators bounding the ⚫ arcs mark nothing at all. It is not that ⚫ Staff Debrief
  reads faintly — it is that a viewer counting blocks on that stretch of band counts one, and there
  are three. After, three blocks with visible boundaries.
- **Filled and elapsed are not confusable, and the margin is shape rather than colour.** The two
  greys are close — a live ⚫ body paints `#595f68` against the elapsed outline's `#7b8189`, **1.64:1**
  apart — so if the cue were colour this would be a problem. It is not: `ELAPSED_FILL_OPACITY` is 0,
  so an elapsed arc is a hollow outline and a live one a solid body, and at 1× the difference is not
  subtle. Worth restating because it means the elapsed treatment is now carrying the whole
  distinction for these two colours, where before the fill's absence was invisible anyway.
- **The drain seam on ⚫ is visible for the first time.** Before, a draining ⚫ arc ramped from
  invisible to invisible, which is the mechanical reason #71 survived two releases. This is the one
  state the fixture could not show unpinned (#76), and it is why the pin was worth having.

Two adjacencies checked and cleared rather than assumed:

- **The title on a floored fill.** White drops from 15.46:1 to **6.44:1** on ⚫ and 8.47:1 to
  **6.42:1** on 🟤 — the cost of a lighter body, and both still well clear of AA. Nothing else moves,
  since no other colour is touched.
- **`--border`, the dial's own furniture grey** (`#6b7280`, the face outline and minute ticks) is
  **1.33:1** from a painted ⚫ body, so a ⚫ event is now drawn in nearly the colour the dial uses for
  structure. They never abut — `FACE_GAP_RATIO` leaves bare `--page` between the face circle and the
  band — and the render confirms no confusion at 1×, but it is the reason to look again if the gap
  ever closes.
