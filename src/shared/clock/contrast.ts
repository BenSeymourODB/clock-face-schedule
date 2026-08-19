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
 * does not control, and two palette colours fail it outright (⚫ 1.32:1, 🟤 2.72:1 on the band).
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
