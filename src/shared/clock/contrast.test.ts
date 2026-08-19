import { describe, expect, it } from "vitest";
import {
  adjustForContrast,
  compositeOver,
  contrastRatio,
  readableTextColor,
  relativeLuminance,
  textFlipCoverage,
} from "./contrast";

/** The dial's own background, the ground every event colour is measured against (`--card`). */
const CARD = "#16181d";

/** Hue in degrees, for asserting an adjustment preserved a colour's identity. Undefined for greys. */
function hue(color: string): number | undefined {
  const hex = color.replace(/^#/, "");
  const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const delta = max - Math.min(r, g, b);
  if (delta === 0) return undefined;
  let h: number;
  if (max === r) h = (g - b) / delta + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / delta + 2;
  else h = (r - g) / delta + 4;
  return h * 60;
}

/** Every colour a title can land on via a colour-dot emoji prefix. */
const PALETTE = [
  ["🔴 red", "#EF4444"],
  ["🟠 orange", "#F97316"],
  ["🟡 yellow", "#EAB308"],
  ["🟢 green", "#22C55E"],
  ["🔵 blue", "#3B82F6"],
  ["🟣 purple", "#A855F7"],
  ["⚫ near-black", "#1F2937"],
  ["⚪ near-white", "#F3F4F6"],
  ["🟤 brown", "#92400E"],
] as const;

const AA_NORMAL_TEXT = 4.5;

describe("relativeLuminance", () => {
  it.each([
    ["#000000", 0],
    ["#ffffff", 1],
  ])("puts %s at %d", (color, expected) => {
    expect(relativeLuminance(color)).toBeCloseTo(expected, 6);
  });

  it("expands three-digit hex", () => {
    expect(relativeLuminance("#fff")).toBe(relativeLuminance("#ffffff"));
  });

  it.each(["fff", "#FFFFFF", "  #fff  "])("accepts %s", (color) => {
    expect(relativeLuminance(color)).toBeCloseTo(1, 6);
  });

  it.each(["rebeccapurple", "rgb(1,2,3)", "#12345", "", "#gggggg"])(
    "returns null for %s, which needs a rendering context to resolve",
    (color) => {
      expect(relativeLuminance(color)).toBeNull();
    }
  );
});

describe("contrastRatio", () => {
  it("is 21 for black on white", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 4);
  });

  it("is 1 for a colour against itself", () => {
    expect(contrastRatio("#3B82F6", "#3b82f6")).toBeCloseTo(1, 6);
  });

  it("does not care which way round the arguments go", () => {
    expect(contrastRatio("#EAB308", "#ffffff")).toBe(contrastRatio("#ffffff", "#EAB308"));
  });

  it("returns null when either colour is unparseable", () => {
    expect(contrastRatio("#fff", "papayawhip")).toBeNull();
  });
});

describe("readableTextColor", () => {
  it.each([
    ["#ffffff", "#000000"],
    ["#000000", "#ffffff"],
  ])("picks the opposite extreme for %s", (background, expected) => {
    expect(readableTextColor(background)).toBe(expected);
  });

  it("falls back to white for an unparseable colour — the behaviour it replaced", () => {
    expect(readableTextColor("papayawhip")).toBe("#ffffff");
  });

  describe("clears WCAG AA where fixed white did not", () => {
    it.each(PALETTE)("on %s", (_name, color) => {
      const chosen = readableTextColor(color);

      expect(contrastRatio(chosen, color)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    });

    it.each([
      ["🟡 yellow", "#EAB308", 1.9],
      ["🟢 green", "#22C55E", 2.3],
      ["⚪ near-white", "#F3F4F6", 1.1],
    ])("%s was %d:1 in white and is now compliant", (_name, color, previous) => {
      // Guards the regression: these are the cases the fixed-white port shipped illegible.
      expect(contrastRatio("#ffffff", color)).toBeCloseTo(previous, 1);
      expect(contrastRatio(readableTextColor(color), color)).toBeGreaterThanOrEqual(
        AA_NORMAL_TEXT
      );
    });
  });

  it("clears AA for any colour at all, not merely this palette", () => {
    // Choosing the better of black and white bottoms out at ~4.58:1, at the luminance where the
    // two are equal. So the guarantee holds for calendar-supplied colours we have never seen.
    for (let channel = 0; channel <= 255; channel += 1) {
      const grey = `#${channel.toString(16).padStart(2, "0").repeat(3)}`;
      const ratio = contrastRatio(readableTextColor(grey), grey);

      expect(ratio).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    }
  });
});

describe("adjustForContrast", () => {
  it("returns a colour already clearing the floor untouched", () => {
    // 🔴 red is 4.72:1 on the dial — above 4.5, so no adjustment and byte-identical output.
    expect(contrastRatio("#EF4444", CARD)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    expect(adjustForContrast("#EF4444", CARD)).toBe("#EF4444");
  });

  it("passes an unparseable colour or background straight through", () => {
    expect(adjustForContrast("papayawhip", CARD)).toBe("papayawhip");
    expect(adjustForContrast("#fff", "papayawhip")).toBe("#fff");
  });

  describe("every palette colour clears the floor once adjusted", () => {
    it.each(PALETTE)("on %s", (_name, color) => {
      const adjusted = adjustForContrast(color, CARD);

      expect(contrastRatio(adjusted, CARD)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    });
  });

  describe("the colours the outline made load-bearing, invisible before and legible after", () => {
    it.each([
      ["⚫ near-black", "#1F2937", 1.21],
      ["🟤 brown", "#92400E", 2.5],
    ])("%s was %d:1 on the dial and is now compliant", (_name, color, before) => {
      // Guards the regression #26 shipped: these outlines were effectively invisible on the dial.
      expect(contrastRatio(color, CARD)).toBeCloseTo(before, 1);

      const adjusted = adjustForContrast(color, CARD);
      expect(adjusted).not.toBe(color);
      expect(contrastRatio(adjusted, CARD)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    });

    it("keeps hue while lightening, so the adjusted colour still identifies the event", () => {
      // ⚫ is a near-grey, so hue is not meaningful; 🟤 brown carries a hue that must survive.
      const brown = "#92400E";
      const adjusted = adjustForContrast(brown, CARD);

      expect(hue(adjusted)).toBeCloseTo(hue(brown) as number, 0);
      expect(relativeLuminance(adjusted)!).toBeGreaterThan(relativeLuminance(brown)!);
    });
  });

  it("darkens toward black on a light ground instead, keeping hue", () => {
    // The mirror direction, exercising the theme-general path ahead of any light theme wiring.
    const banana = "#fbd75b";
    const adjusted = adjustForContrast(banana, "#ffffff");

    expect(contrastRatio(adjusted, "#ffffff")).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    expect(relativeLuminance(adjusted)!).toBeLessThan(relativeLuminance(banana)!);
    expect(hue(adjusted)).toBeCloseTo(hue(banana) as number, 0);
  });

  it("adjusts an arbitrary calendar colour no table could enumerate", () => {
    // The case a school hits immediately: one calendar per class, each a custom hex.
    const teal = "#0f766e";
    expect(contrastRatio(teal, CARD)!).toBeLessThan(AA_NORMAL_TEXT);
    expect(contrastRatio(adjustForContrast(teal, CARD), CARD)).toBeGreaterThanOrEqual(
      AA_NORMAL_TEXT
    );
  });

  it("makes the minimal move — a lower floor leaves a colour that clears it untouched", () => {
    // ⚫ fails 4.5 but clears 1.0 trivially, so at a 1.0 floor it is returned as-is.
    expect(adjustForContrast("#1F2937", CARD, 1)).toBe("#1F2937");
  });
});

describe("compositeOver", () => {
  it("returns the background untouched at zero alpha", () => {
    expect(compositeOver("#16181d", "#EF4444", 0)).toBe("#16181d");
  });

  it("returns the tint outright at full alpha", () => {
    expect(compositeOver("#16181d", "#ef4444", 1)).toBe("#ef4444");
  });

  it("blends linearly per channel, the way SVG fill-opacity does", () => {
    expect(compositeOver("#000000", "#ffffff", 0.2)).toBe("#333333");
  });

  it("returns null when either colour is unparseable", () => {
    expect(compositeOver("papayawhip", "#ffffff", 0.5)).toBeNull();
    expect(compositeOver("#ffffff", "papayawhip", 0.5)).toBeNull();
  });
});

/**
 * The seam of a draining arc (#28) is a fill ramping in from nothing, so a title crossing it has one
 * ground at each end and somewhere in between the two candidate colours change places. This finds
 * where — for the pair actually painted, which is why both are arguments.
 */
describe("textFlipCoverage", () => {
  const ARC_FILL_OPACITY = 0.85;
  /** What is behind the arc band: `--page`, not the face's `--card`. See `BAND_BACKGROUND`. */
  const BAND = "#0c0e12";
  /** The pair the renderer paints: `--card-foreground` on the drained side, black on the fill. */
  const LIGHT = "#f2f4f8";
  const DARK = "#000000";

  const flip = (color: string) => textFlipCoverage(BAND, color, ARC_FILL_OPACITY, LIGHT, DARK);

  /** Worst contrast anywhere across the ramp, if the text switches colour at `split`. */
  function worstAcrossRamp(color: string, split: number, light = LIGHT): number {
    let worst = Infinity;
    for (let coverage = 0; coverage <= 1.0001; coverage += 0.002) {
      const ground = compositeOver(BAND, color, ARC_FILL_OPACITY * coverage)!;
      const text = coverage < split ? light : DARK;
      worst = Math.min(worst, contrastRatio(text, ground)!);
    }
    return worst;
  }

  /** The colours whose fill genuinely wants the darker text, and so need a split at all. */
  const SPLIT_COLOURS = [
    ["🟠 orange-500", "#F97316"],
    ["🟡 yellow-500", "#EAB308"],
    ["🟢 green-500", "#22C55E"],
    ["🔵 blue-500", "#3B82F6"],
    ["⚪ gray-100", "#F3F4F6"],
  ] as const;

  it.each([
    ["🔴 red-500", "#EF4444"],
    ["🟣 purple-500", "#A855F7"],
    ["⚫ gray-800", "#1F2937"],
    ["🟤 amber-800", "#92400E"],
  ])("reports no crossing for %s, whose fill reads better in the light colour anyway", (
    _label,
    color
  ) => {
    // Measured on the composited fill: black is 4.31 / 4.14 / 1.36 / 2.48 against the light token's
    // 4.43 / 4.60 / 14.04 / 7.69. A caller reads 1 as "one copy, light, no split".
    expect(flip(color)).toBe(1);
  });

  it.each(SPLIT_COLOURS)("crosses partway along the ramp for %s, at neither end", (_label, color) => {
    expect(flip(color)).toBeGreaterThan(0);
    expect(flip(color)).toBeLessThan(1);
  });

  it.each(SPLIT_COLOURS)("%s: splitting at the crossing is the best available seam", (
    _label,
    color
  ) => {
    const best = worstAcrossRamp(color, flip(color));

    // Either colour used alone across the whole ramp is far worse — that is the defect (#71).
    expect(worstAcrossRamp(color, 0)).toBeLessThan(1.2);
    expect(worstAcrossRamp(color, 1)).toBeLessThan(4.4);
    // And no other split does better: the crossing is the max-min, so it beats every alternative.
    for (const split of [0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9]) {
      expect(best).toBeGreaterThanOrEqual(worstAcrossRamp(color, split) - 1e-9);
    }
    // 4.37:1 for the palette — short of AA, and unreachable with this pair whatever the split.
    // Guards the honest floor rather than asserting a pass the colours cannot deliver.
    expect(best).toBeGreaterThan(4.3);
  });

  it("crosses at a different place for the pair actually painted than for pure white", () => {
    // The bug this signature exists to prevent: deriving the candidates gives the black-vs-#ffffff
    // tie, and the renderer paints `--card-foreground`. On 🟡 that is 0.028 of the ramp out, and it
    // costs contrast at the seam — the split lands where the *wrong* pair crosses.
    const painted = flip("#EAB308");
    const pureWhite = textFlipCoverage(BAND, "#EAB308", ARC_FILL_OPACITY, "#ffffff", DARK);

    expect(painted).not.toBeCloseTo(pureWhite, 3);
    expect(worstAcrossRamp("#EAB308", painted)).toBeGreaterThan(
      worstAcrossRamp("#EAB308", pureWhite)
    );
  });

  it("reads the ground it is given: `--card` puts every crossing somewhere else", () => {
    // The band sits over `--page`, outside the face circle. Measuring against `--card` moved each
    // crossing 0.03–0.10 of the ramp, which is why `BAND_BACKGROUND` exists.
    for (const [, color] of SPLIT_COLOURS) {
      const onCard = textFlipCoverage("#16181d", color, ARC_FILL_OPACITY, LIGHT, DARK);

      expect(onCard).not.toBeCloseTo(flip(color), 2);
    }
  });

  it("reports no crossing for an unparseable colour, rather than splitting on a guess", () => {
    expect(textFlipCoverage(BAND, "papayawhip", 0.85, LIGHT, DARK)).toBe(1);
  });
});
