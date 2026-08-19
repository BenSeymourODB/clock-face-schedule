**Status:** in review
**Issue:** #74
**Docs:** #27 (the elapsed outline's contrast pass), #26 (elapsed outlines), #66 (the filled arc's
own extent — the separator question resolves there), ADR 0007 (theme tokens),
`docs/plans/2026-08-18-contrast-safe-event-colours.md`

# Measure the elapsed outline against the ground the band actually has

## The defect

`event-arc.ts` carried one background constant, `DIAL_BACKGROUND = "#16181d"`, documented as the
value `--card` holds in `Styles.html`. That is accurate about `--card` — and `--card` is the fill of
`clock-face-bg`, the **face circle**. The arc band is not drawn on the face. `analog-clock.ts` sets

```
outerRadius = size / 2 − EDGE_MARGIN          // 292 at the default 600
clockRadius = outerRadius − arcThickness      // 216.08, the band's inner edge
faceRadius  = clockRadius − outerRadius × FACE_GAP_RATIO   // 204.4
```

so the face stops at 204.4 and the band runs 216.08–292. The 11.68 units between them, and
everything outside the face, is `--page`, `#0c0e12`.

One call read the wrong constant: `adjustForContrast(color, DIAL_BACKGROUND, OUTLINE_MIN_CONTRAST)`,
#27's elapsed-outline colour.

## What it costs

It errs safe — the real ground is *darker*, so an outline lightened until it clears 4.5:1 on
`#16181d` clears more than that on `#0c0e12`. Nothing is illegible. The cost is that each adjusted
colour sits further from its authored hue than it needs to, which is precisely what #27 went to
trouble to minimise: "a colour already clearing the floor is returned untouched, and one that fails
moves no further than it must."

Measured with the repo's own `contrast.ts`, floor 4.5:1:

| colour | authored | outline vs `--card` | on the real ground | outline vs `--page` | lands at |
| --- | --- | --- | --- | --- | --- |
| ⚫ gray-800 `#1F2937` | 1.21 / **1.32** | `#7b8189` | 4.92 | `#747b83` | 4.51 |
| 🟤 amber-800 `#92400E` | 2.50 / **2.72** | `#af724d` | 4.91 | `#aa6b44` | 4.50 |
| 🟣 purple-500 `#A855F7` | 4.49 / **4.88** | `#a856f7` | 4.91 | `#A855F7` *(untouched)* | 4.88 |
| the other six | ≥4.72 / ≥5.13 | unchanged | — | unchanged | — |

Three colours move, not the two the issue names: 🟣 already clears 4.5:1 against the band, so the
correction stops nudging it at all and it is returned exactly as authored. ⚫ and 🟤 each shed about
0.4 of a ratio point of over-correction.

### Two numbers in the issue body are the wrong way round

The issue states that ⚫'s "1.21:1 on the dial" is **1.09:1** on the band and 🟤's "2.50:1" is
**2.29:1** — both lower. Computed, both are *higher*: 1.32 and 2.72. Both colours are lighter than
either ground, and the band's ground is the darker of the two, so every ratio grows crossing to it.
1.09 is a real number from the same neighbourhood — it is what `var(--card)` itself measures against
`--page` — which is likely where it came from.

The conclusion is unchanged: at 1.32:1 a raw ⚫ outline is still no edge at all, and the adjustment
is still what makes it one.

## What this ships

1. **`BAND_BACKGROUND = "#0c0e12"`** replaces `DIAL_BACKGROUND` in `event-arc.ts`, **exported**, and
   the outline's contrast pass measures against it. `DIAL_BACKGROUND` goes: after the correction
   nothing in the renderer measures against the face's ground.
2. **The test imports the constant** instead of keeping its own copy of the hex. `event-arc.test.ts`
   declared `const DIAL_BACKGROUND = "#16181d"` and asserted the outline cleared 4.5:1 against it —
   an assertion that was true while its premise was false, which is `CLAUDE.md`'s sharpest lesson
   about tests encoding the code's own assumption. One hex, one place.
3. **A geometric assertion that the band is outside the face**, in `analog-clock.test.ts`: every
   rendered arc coordinate lies at or beyond the `clock-face-bg` circle's radius. That is the fact
   the wrong constant denied, and it is the one a test can hold — the constant's *value* cannot be
   cross-checked against `Styles.html` from a test, because neither tsconfig admits node types and
   loosening that split to read a file would trade a real guarantee for a small one.
4. **Corrected ratios** wherever `event-arc.ts` and
   `docs/plans/2026-08-18-contrast-safe-event-colours.md` quote a figure against the wrong ground,
   and the `Styles.html` back-pointer moved from `--card` to `--page`.

## The separator: measured, and deliberately left alone

The issue asks whether the separator is right at the same time. It is `var(--card)`, chosen to match
the ground behind the band, and it does not match it: **1.09:1 against `--page`**. Between two
adjacent fills it still does its job (10.38:1 against a ⚪ fill); against bare band it marks nothing.

Not changed here, on the ground that the obvious correction is worse than the defect. A boundary
stroke resolved to 4.5:1 against the band gives ⚫ `#747b83` — the *same colour this change assigns
to an elapsed ⚫ arc's outline*. Every live arc would then carry the mark that currently means "this
one is over", and fill-presence would be the only cue left separating the two states.

#66 already owns this, and its measured recommendation — floor the composited **fill** at 3:1
against the band's ground — dissolves the separator problem instead of trading it: a floored ⚫ fill
takes the separator from 1.15:1 to 2.76:1 without giving a live arc an elapsed arc's outline. So the
separator moves there, with the fill, or not at all.

## Phases

1. **Constant, call site, comments, tests.** One commit: the rename and correction in `event-arc.ts`,
   the test importing it, the geometric assertion in `analog-clock.test.ts`, and the doc/`Styles.html`
   corrections.
2. **Visual pass.** Build, serve `build/preview.html`, screenshot the elapsed ⚫ / 🟤 cluster before
   and after, and confirm each outline still reads as an edge at the slightly more saturated colour.
   The fixture already carries the case: ⚫ Assembly, ⚫ Staff Debrief and Planning, 🟤 ⚽.

## Not in scope

- **Filled arcs' own contrast (#66).** Untouched; the outline is the only thing this corrects.
- **The separator (#66).** See above.
- **Theme-awareness of either ground (#81).** Both hexes are still literals in TypeScript. #81 is
  where they become theme-aware; naming the band's ground correctly is a precondition for that
  rather than a step into it.
