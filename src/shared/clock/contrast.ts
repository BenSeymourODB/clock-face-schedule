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
