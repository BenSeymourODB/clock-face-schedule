import { describe, expect, it } from "vitest";
import { compositeOver, contrastRatio, readableTextColor, relativeLuminance } from "./contrast";

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
