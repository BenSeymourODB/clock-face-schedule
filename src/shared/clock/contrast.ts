/**
 * Picking legible text for an arbitrary background.
 *
 * Event arcs are coloured from a title's colour-dot emoji or from the calendar's own colour, so
 * the backdrop a title sits on is not ours to choose and no design token describes it. A fixed
 * text colour therefore cannot work: white measures 1.9:1 on the palette's yellow and clears
 * WCAG AA against none of its five colours.
 */

/** WCAG's coefficients for relative luminance. */
const LUMINANCE_WEIGHTS = { red: 0.2126, green: 0.7152, blue: 0.0722 } as const;

/** WCAG's linearisation threshold. Marginally different from the sRGB spec's 0.04045. */
const LINEARISATION_THRESHOLD = 0.03928;

/** Added to both luminances in a contrast ratio, so black-on-black is 1 rather than undefined. */
const CONTRAST_OFFSET = 0.05;

const BLACK = "#000000";
const WHITE = "#ffffff";

const HEX_COLOR = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

function parseHex(color: string): [number, number, number] | null {
  const match = HEX_COLOR.exec(color.trim());
  if (!match) return null;

  const digits = match[1];
  const full =
    digits.length === 3
      ? digits
          .split("")
          .map((digit) => digit + digit)
          .join("")
      : digits;

  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16),
  ];
}

function linearise(channel: number): number {
  const value = channel / 255;
  return value <= LINEARISATION_THRESHOLD
    ? value / 12.92
    : ((value + 0.055) / 1.055) ** 2.4;
}

/**
 * WCAG relative luminance, 0 (black) to 1 (white). Returns `null` for anything that is not a
 * three- or six-digit hex colour — named CSS colours and `rgb()` are not resolvable without a
 * rendering context.
 */
export function relativeLuminance(color: string): number | null {
  const rgb = parseHex(color);
  if (!rgb) return null;

  const [red, green, blue] = rgb;
  return (
    LUMINANCE_WEIGHTS.red * linearise(red) +
    LUMINANCE_WEIGHTS.green * linearise(green) +
    LUMINANCE_WEIGHTS.blue * linearise(blue)
  );
}

/**
 * WCAG contrast ratio between two colours, 1 (identical) to 21 (black on white).
 * Returns `null` if either colour is unparseable.
 */
export function contrastRatio(a: string, b: string): number | null {
  const first = relativeLuminance(a);
  const second = relativeLuminance(b);
  if (first === null || second === null) return null;

  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + CONTRAST_OFFSET) / (darker + CONTRAST_OFFSET);
}

/**
 * The colour a viewer sees where `tint` is painted over `background` at `alpha` (0–1), using
 * simple per-channel alpha compositing — the same math an SVG renderer does for `fill-opacity`.
 * Returns `null` if either colour is unparseable.
 *
 * Exists so a claim like "a wash this light cannot move the text below AA" is something a test
 * computes rather than something asserted by eye.
 */
export function compositeOver(background: string, tint: string, alpha: number): string | null {
  const bg = parseHex(background);
  const fg = parseHex(tint);
  if (!bg || !fg) return null;

  const channel = (i: number) => Math.round(bg[i] * (1 - alpha) + fg[i] * alpha);
  return `#${[channel(0), channel(1), channel(2)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`;
}

/**
 * Black or white, whichever contrasts better against `background`.
 *
 * Chooses by comparing both candidate ratios rather than by thresholding luminance, because the
 * ratio is the thing actually being optimised. Pure black and pure white rather than softened
 * near-neutrals: this display is read at distance, so there is no contrast to spend on taste.
 *
 * Falls back to white for an unparseable colour, which is what the dial did before this existed.
 *
 * Ignores the arcs' `fill-opacity`, which blends each colour slightly toward the face behind it.
 * Correcting for that needs the backdrop colour, which lives in a CSS custom property and is not
 * available here. The error only matters for colours near the black/white crossover, where both
 * choices land close to 4.5:1 anyway.
 */
export function readableTextColor(background: string): string {
  const luminance = relativeLuminance(background);
  if (luminance === null) return WHITE;

  const againstBlack = (luminance + CONTRAST_OFFSET) / CONTRAST_OFFSET;
  const againstWhite = (1 + CONTRAST_OFFSET) / (luminance + CONTRAST_OFFSET);

  return againstBlack >= againstWhite ? BLACK : WHITE;
}

/** WCAG AA for normal text. The floor #27 settled on — a display read across a room has no margin. */
const DEFAULT_MIN_CONTRAST = 4.5;

/** Iterations of the blend search. 2⁻²⁴ resolution on the fraction is far below one 8-bit step. */
const BLEND_SEARCH_STEPS = 24;

/**
 * The nearest variant of `color` that clears `minRatio` against `background`, keeping its hue.
 *
 * Where a *filled* arc's colour is the background and `readableTextColor` picks the text against it,
 * an *outlined* arc (#26) inverts that: the colour becomes the foreground against a background it
 * does not control, and two palette colours fail it outright (⚫ 1.21:1, 🟤 2.50:1 on the dial).
 * A curated table cannot close this — one colour source is an arbitrary calendar hex — so the
 * adjustment is computed.
 *
 * Blends toward the background's far extreme: white on a dark ground, black on a light one, by the
 * smallest fraction that clears the ratio. Mixing toward a neutral keeps HSL hue exactly while
 * raising lightness and shedding saturation — the "lighten *and* desaturate on dark" Material
 * prescribes, and its mirror on light. Contrast is monotonic in that fraction, so a binary search
 * lands the minimal adjustment: a colour already clearing the floor is returned untouched, and one
 * that fails moves no further than it must.
 *
 * Returns `color` unchanged if either value is not a parseable hex — the same parseability guard the
 * rest of this module makes, so an unresolvable colour degrades to its authored form rather than
 * throwing.
 */
export function adjustForContrast(
  color: string,
  background: string,
  minRatio: number = DEFAULT_MIN_CONTRAST
): string {
  const backgroundLuminance = relativeLuminance(background);
  const current = contrastRatio(color, background);
  if (backgroundLuminance === null || current === null) return color;
  if (current >= minRatio) return color;

  const target = backgroundLuminance < 0.5 ? WHITE : BLACK;
  // The extreme itself may not clear a very high `minRatio` (e.g. white on a mid-grey); then the
  // best available answer is the extreme, and there is nothing further to search for.
  if ((contrastRatio(target, background) ?? 0) < minRatio) return target;

  let lo = 0;
  let hi = 1;
  for (let step = 0; step < BLEND_SEARCH_STEPS; step += 1) {
    const mid = (lo + hi) / 2;
    const candidate = compositeOver(color, target, mid);
    const ratio = candidate === null ? null : contrastRatio(candidate, background);
    if (ratio !== null && ratio >= minRatio) hi = mid;
    else lo = mid;
  }

  return compositeOver(color, target, hi) ?? target;
}

/**
 * The nearest variant of `color` that clears `minRatio` against `background` **once painted at
 * `alpha` over it**, keeping its hue.
 *
 * `adjustForContrast` asks whether a colour reads as a foreground. This asks whether a *fill* reads
 * as a shape, which is a different question with a different answer, because a fill at
 * `fill-opacity` is never the authored colour by the time a viewer sees it. An arc's body is what
 * says how long an event lasts, and for the darkest palette colours it said nothing: ⚫ gray-800
 * composited at 0.85 over the band measures **1.25:1**, so the block's extent could not be read at
 * all (#66).
 *
 * Floors the *composited* value rather than the authored one, since the ground that
 * `fill-opacity` mixes back in is part of what is on the wall. The two differ by enough to matter —
 * flooring the *authored* ⚫ at 3:1 gives `#58606a`, which paints at 2.52:1 — still short.
 *
 * Callers pass the graphical-object floor (3:1) rather than the text floor `adjustForContrast`
 * defaults to. That is not a relaxation for its own sake: `readableTextColor`'s black/white
 * crossover for ⚫ sits at a floor of 3.34:1, so 3:1 is the largest round floor that raises every
 * palette fill without flipping any title that sits on one — which is the difference between a
 * one-attribute change and a redesign of the filled state.
 *
 * Shares `adjustForContrast`'s search and its guarantees: blends toward the ground's far extreme by
 * the smallest fraction that clears the ratio, so hue survives and a colour already clearing the
 * floor is returned untouched; returns the extreme where even that cannot clear `minRatio`; returns
 * `color` unchanged for anything unparseable. At `alpha` of 1 the composite *is* the colour, so on
 * any ground where the two agree on a blend target it reduces exactly to `adjustForContrast` — which
 * the spec asserts rather than assumes, over the palette and the ground the dial actually uses.
 *
 * "Far extreme" is measured, not inferred from the ground's luminance. Two ways of inferring it are
 * both wrong, and both were tried here:
 *
 * - **Thresholding luminance at 0.5**, which `adjustForContrast` does. Black and white change places
 *   at luminance **0.1791**, not 0.5, so every ground between the two — mid-greys, and any light
 *   theme that is not near-white (#81) — gets white picked when black reaches further. Not merely a
 *   worse blend: on `#767676` at 0.85, white tops out at 3.78:1 while black reaches 4.12:1, so a 4:1
 *   floor is reachable and the threshold misses it outright.
 * - **Asking `readableTextColor`**, which compares the two properly — but at *full* strength. The
 *   comparison does not survive `alpha`: contrast is not linear in luminance, so on a saturated
 *   ground the extreme that wins at 1.0 can lose at 0.25. Measured over 20,000 random cases, that
 *   substitution still missed a reachable floor 122 times; comparing the two *painted* misses none.
 *
 * So the target is whichever extreme reaches further **once painted at this alpha**, which is the
 * only version of the question the caller actually has. `adjustForContrast` keeps the 0.5 threshold
 * and its latent bug; it is not corrected here because its one caller measures against a ground far
 * below the crossover, where every rule above agrees. See #95.
 */
export function adjustCompositeForContrast(
  color: string,
  background: string,
  alpha: number,
  minRatio: number = DEFAULT_MIN_CONTRAST
): string {
  if (relativeLuminance(background) === null) return color;

  /** The ratio a viewer sees for `candidate` painted at `alpha`, or null if it will not parse. */
  const painted = (candidate: string): number | null => {
    const composited = compositeOver(background, candidate, alpha);
    return composited === null ? null : contrastRatio(composited, background);
  };

  const current = painted(color);
  if (current === null) return color;
  if (current >= minRatio) return color;

  const target = (painted(WHITE) ?? 0) >= (painted(BLACK) ?? 0) ? WHITE : BLACK;
  if ((painted(target) ?? 0) < minRatio) return target;

  let lo = 0;
  let hi = 1;
  for (let step = 0; step < BLEND_SEARCH_STEPS; step += 1) {
    const mid = (lo + hi) / 2;
    const candidate = compositeOver(color, target, mid);
    const ratio = candidate === null ? null : painted(candidate);
    if (ratio !== null && ratio >= minRatio) hi = mid;
    else lo = mid;
  }

  return compositeOver(color, target, hi) ?? target;
}

/**
 * How much of `tint` has to be over `background` before `tintText` overtakes `baseText` — as a
 * fraction of `alpha`, 0–1.
 *
 * The case is a fill that ramps in rather than arriving all at once: a draining arc's seam (#28) runs
 * from bare band to full fill across a few degrees, and a title crossing it has one ground at each
 * end. Splitting the text at the seam's midpoint is wrong, because that is not where the two colours
 * change places — measured on the fixture, black text where the fill had barely begun sat on a ground
 * it cleared **1.09:1** against, which is a letter missing from the middle of the title.
 *
 * Returns the tie, where the two candidates are equally legible on the blend. Split there and the
 * worst contrast anywhere across the ramp is as high as it can be made — for the palette, 4.37:1
 * against 2.35:1 for either colour used alone. Note what that means: the tie *is* the max-min, so a
 * seam cannot be made to clear AA by moving the split. Only a different pair of colours could, and
 * the pair here is fixed by the theme (ADR 0007).
 *
 * Both candidates are passed in rather than derived, because the caller paints a theme token and not
 * the pure white `readableTextColor` would pick: deriving them put the tie 0.03–0.10 of the ramp
 * away from where the painted pair actually crosses.
 *
 * Contrast against the blend is monotonic in coverage for each candidate, so the crossing is unique
 * and a binary search finds it. Returns 1 when there is no crossing — `tintText` never overtakes, or
 * a colour will not parse — which a caller should read as "this pair needs no split at all".
 */
export function textFlipCoverage(
  background: string,
  tint: string,
  alpha: number,
  baseText: string,
  tintText: string
): number {
  const flipped = (coverage: number): boolean => {
    const ground = compositeOver(background, tint, alpha * coverage);
    if (ground === null) return false;

    const base = contrastRatio(baseText, ground);
    const over = contrastRatio(tintText, ground);
    return base !== null && over !== null && over >= base;
  };

  let lo = 0;
  let hi = 1;
  for (let step = 0; step < BLEND_SEARCH_STEPS; step += 1) {
    const mid = (lo + hi) / 2;
    if (flipped(mid)) hi = mid;
    else lo = mid;
  }

  return hi;
}
