import { describe, expect, it } from "vitest";
import {
  adjustForContrast,
  compositeOver,
  contrastRatio,
  readableTextColor,
  relativeLuminance,
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
