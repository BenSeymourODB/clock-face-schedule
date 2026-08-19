import { describe, expect, it } from "vitest";
import {
  adjustCompositeForContrast,
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

/**
 * The other twelve colours the dial can be handed: Google's own event palette (`EVENT_COLORS` in
 * `map-event.ts`, keyed by the ordinal `CalendarEvent.getColor()` returns) and the fallback.
 *
 * Kept beside `PALETTE` because the claim #66 rests on is about *every* colour that can reach an
 * arc, not only the nine a colour-dot selects — and an event with no dot in its title takes one of
 * these. They are all light, so none of them moves; that is the point of asserting it.
 */
const CALENDAR_PALETTE = [
  ["Lavender", "#a4bdfc"],
  ["Sage", "#7ae7bf"],
  ["Grape", "#dbadff"],
  ["Flamingo", "#ff887c"],
  ["Banana", "#fbd75b"],
  ["Tangerine", "#ffb878"],
  ["Peacock", "#46d6db"],
  ["Graphite", "#e1e1e1"],
  ["Blueberry", "#5484ed"],
  ["Basil", "#51b749"],
  ["Tomato", "#dc2127"],
  ["the fallback", "#3b82f6"],
] as const;

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

/** WCAG 1.4.11's floor for a non-text object — what an arc's *body* has to clear (#66). */
const AA_GRAPHICAL_OBJECT = 3;

/** The ground the arc band is painted on (`--page`), which is not the face's (#74). */
const BAND = "#0c0e12";

/** The arcs' own `fill-opacity`, kept here so the composited figures are the painted ones. */
const ARC_FILL_OPACITY = 0.85;

/** The two extremes `adjustForContrast` blends toward, spelled as the module returns them. */
const BLACK = "#000000";
const WHITE = "#ffffff";

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

  describe("on a mid-tone ground, where black and white change places below the midpoint", () => {
    // #95. Black and white swap at L ≈ 0.1791 — the root of (L + 0.05)² = 1.05 × 0.05 — not at 0.5,
    // so every ground in (0.1791, 0.5) is one a midpoint test sends toward the *nearer* extreme.
    // Unreachable on today's two grounds (`--card` #16181d is L = 0.0091), and reachable the moment
    // #81's light scheme adds a mid-tone surface.
    const MIDTONE_GROUNDS = [
      ["#767676", 0.1812],
      ["#808080", 0.2159],
      ["#949494", 0.2961],
      ["#b0b0b0", 0.4342],
      ["#bbbbbb", 0.4969],
    ] as const;

    it.each(MIDTONE_GROUNDS)("%s sits above the crossover and below the midpoint", (ground, l) => {
      expect(relativeLuminance(ground)!).toBeCloseTo(l, 4);
      expect(relativeLuminance(ground)!).toBeGreaterThan(0.1791);
      expect(relativeLuminance(ground)!).toBeLessThan(0.5);

      // The property that makes the midpoint test wrong: black wins on all of these.
      expect(contrastRatio(BLACK, ground)!).toBeGreaterThan(contrastRatio(WHITE, ground)!);
    });

    // The assertion that would have caught this. The old spec exercised only #ffffff — the
    // trivially-correct end of the light range — and asserted the same rule the code held.
    it.each(MIDTONE_GROUNDS)("clears a floor on %s that only black reaches", (ground) => {
      // A floor between what white reaches and what black reaches: satisfiable, but only one way.
      const floor = (contrastRatio(WHITE, ground)! + contrastRatio(BLACK, ground)!) / 2;

      const adjusted = adjustForContrast("#d14e89", ground, floor);

      expect(contrastRatio(adjusted, ground)!).toBeGreaterThanOrEqual(floor);
    });

    it("falls back to the better extreme, not the nearer one, when no blend clears the floor", () => {
      // The guard's own case. On #bbbbbb white tops out at 1.92:1 and black at 10.94:1, so a 12:1
      // floor is out of reach either way and the guard picks the extreme that gets closest. The
      // midpoint rule returned white here — 1.92:1, while calling itself the best available answer.
      expect(contrastRatio(WHITE, "#bbbbbb")!).toBeCloseTo(1.92, 2);
      expect(contrastRatio(BLACK, "#bbbbbb")!).toBeCloseTo(10.94, 2);

      expect(adjustForContrast("#d14e89", "#bbbbbb", 12)).toBe(BLACK);
    });
  });

  it("clears the floor whenever either extreme can, over a sweep of colour/ground/floor triples", () => {
    // The general property, rather than the enumerated grounds above: the returned colour clears
    // the floor in every case where *some* answer does. The midpoint rule fails this on 24% of
    // reachable triples; it is the invariant, not the threshold constant, that is worth pinning.
    //
    // mulberry32 rather than the textbook `seed * 1103515245` LCG, whose state exceeds 2^53 on
    // every step: the low bits are lost to double rounding before the mask applies, and the
    // generator settles into a 10,466-long cycle after a 5,937-step transient. A 5,000-iteration
    // loop happens to fit inside that, but raising the count would silently replay triples rather
    // than test new ones. Every operation here stays 32-bit via `Math.imul` and `|0`.
    let state = 12345;
    const random = () => {
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const randomHex = () =>
      `#${[0, 1, 2]
        .map(() => Math.floor(random() * 256).toString(16).padStart(2, "0"))
        .join("")}`;

    const ITERATIONS = 5000;
    const missed: string[] = [];
    const drawn = new Set<string>();
    let reachable = 0;
    for (let i = 0; i < ITERATIONS; i += 1) {
      const color = randomHex();
      const ground = randomHex();
      const floor = 1 + random() * 6;
      drawn.add(`${color}|${ground}|${floor}`);

      const best = Math.max(contrastRatio(WHITE, ground)!, contrastRatio(BLACK, ground)!);
      if (best < floor) continue;

      reachable += 1;
      const adjusted = adjustForContrast(color, ground, floor);
      if (contrastRatio(adjusted, ground)! < floor - 1e-9) {
        missed.push(`${color} on ${ground} at ${floor.toFixed(2)} -> ${adjusted}`);
      }
    }

    // Every iteration tested something new. Without this a degenerate generator makes the loop
    // count iterations rather than cases, and the sweep reports coverage it does not have.
    expect(drawn.size).toBe(ITERATIONS);
    expect(reachable).toBeGreaterThan(1000);
    expect(missed).toEqual([]);
  });
});

describe("adjustCompositeForContrast", () => {
  /** The ratio a viewer sees for `color` painted at the arcs' own `fill-opacity` over the band. */
  const painted = (color: string, alpha = ARC_FILL_OPACITY) =>
    contrastRatio(compositeOver(BAND, color, alpha)!, BAND)!;

  it("returns a fill that already reads as a shape untouched", () => {
    // 🟡 paints at 7.46:1 — far above the graphical floor, so byte-identical output.
    expect(painted("#EAB308")).toBeGreaterThanOrEqual(AA_GRAPHICAL_OBJECT);
    expect(adjustCompositeForContrast("#EAB308", BAND, ARC_FILL_OPACITY, AA_GRAPHICAL_OBJECT)).toBe(
      "#EAB308"
    );
  });

  it("passes an unparseable colour or background straight through", () => {
    expect(adjustCompositeForContrast("papayawhip", BAND, ARC_FILL_OPACITY, 3)).toBe("papayawhip");
    expect(adjustCompositeForContrast("#fff", "papayawhip", ARC_FILL_OPACITY, 3)).toBe("#fff");
  });

  it("is adjustForContrast at full alpha, where there is no composite to speak of", () => {
    // The two must not be able to drift: at alpha 1 the painted colour *is* the authored one, so
    // any difference here would mean one of the two searches is wrong.
    for (const [, color] of PALETTE) {
      expect(adjustCompositeForContrast(color, BAND, 1, AA_NORMAL_TEXT)).toBe(
        adjustForContrast(color, BAND, AA_NORMAL_TEXT)
      );
    }
  });

  describe("every palette colour reads as a shape once floored", () => {
    it.each(PALETTE)("on %s", (_name, color) => {
      const floored = adjustCompositeForContrast(color, BAND, ARC_FILL_OPACITY, AA_GRAPHICAL_OBJECT);

      expect(painted(floored)).toBeGreaterThanOrEqual(AA_GRAPHICAL_OBJECT);
    });
  });

  describe("the two fills whose extent could not be read at all (#66)", () => {
    it.each([
      ["⚫ near-black", "#1F2937", 1.25],
      ["🟤 brown", "#92400E", 2.28],
    ])("%s painted at %f:1 before, and clears the floor after", (_name, color, before) => {
      expect(painted(color)).toBeCloseTo(before, 2);

      const floored = adjustCompositeForContrast(color, BAND, ARC_FILL_OPACITY, AA_GRAPHICAL_OBJECT);
      expect(floored).not.toBe(color);
      expect(painted(floored)).toBeGreaterThanOrEqual(AA_GRAPHICAL_OBJECT);
    });

    it("floors what is painted, not what is authored — the distinction is worth 0.48 of a ratio", () => {
      // The defect this function exists for. `adjustForContrast` floors the authored hex, and the
      // 15% of ground `fill-opacity` mixes back in then drags the result under the floor again:
      // ⚫ floored that way gives `#58606a`, which paints at 2.52:1 and is still short of 3.
      const authored = adjustForContrast("#1F2937", BAND, AA_GRAPHICAL_OBJECT);
      expect(painted(authored)).toBeLessThan(AA_GRAPHICAL_OBJECT);

      expect(
        painted(adjustCompositeForContrast("#1F2937", BAND, ARC_FILL_OPACITY, AA_GRAPHICAL_OBJECT))
      ).toBeGreaterThanOrEqual(AA_GRAPHICAL_OBJECT);
    });

    it("keeps hue while lightening, so a floored 🟤 is still recognisably brown", () => {
      const brown = "#92400E";
      const floored = adjustCompositeForContrast(brown, BAND, ARC_FILL_OPACITY, AA_GRAPHICAL_OBJECT);

      expect(hue(floored)).toBeCloseTo(hue(brown) as number, 0);
      expect(relativeLuminance(floored)!).toBeGreaterThan(relativeLuminance(brown)!);
    });
  });

  it("leaves every title where it was — 3:1 is below the black/white crossover", () => {
    // Why the floor is the graphical one and not #27's 4.5. `readableTextColor`'s crossover for ⚫
    // sits at a floor of 3.34:1; flooring at 3.5 or at #27's 4.5 flips its title to black, which
    // makes the change a redesign of the filled state rather than one attribute moving.
    //
    // Over all 21 colours the dial can be handed, not only the nine colour-dots: the claim in
    // #66's plan is that the floor moves ⚫ and 🟤 and nothing else, and twelve of the twenty-one
    // are Google's, which no other spec here covers.
    for (const [, color] of [...PALETTE, ...CALENDAR_PALETTE]) {
      const floored = adjustCompositeForContrast(color, BAND, ARC_FILL_OPACITY, AA_GRAPHICAL_OBJECT);

      expect(readableTextColor(floored)).toBe(readableTextColor(color));
    }

    expect(
      readableTextColor(adjustCompositeForContrast("#1F2937", BAND, ARC_FILL_OPACITY, 3.5))
    ).toBe("#000000");
  });

  it("moves ⚫ and 🟤, and leaves the other nineteen byte-identical", () => {
    // The other half of the same claim, and the one that stops the floor quietly becoming a
    // restyle: a change that lightened the whole dial would still pass every ratio assertion here.
    const moved = [...PALETTE, ...CALENDAR_PALETTE]
      .filter(
        ([, color]) =>
          adjustCompositeForContrast(color, BAND, ARC_FILL_OPACITY, AA_GRAPHICAL_OBJECT) !== color
      )
      .map(([name]) => name);

    expect(moved).toEqual(["⚫ near-black", "🟤 brown"]);
  });

  it("darkens toward black on a light ground instead", () => {
    // The mirror direction, exercising the theme-general path ahead of #81's light theme.
    const pale = "#F3F4F6";
    const floored = adjustCompositeForContrast(pale, "#ffffff", ARC_FILL_OPACITY, 3);

    expect(
      contrastRatio(compositeOver("#ffffff", floored, ARC_FILL_OPACITY)!, "#ffffff")
    ).toBeGreaterThanOrEqual(3);
    expect(relativeLuminance(floored)!).toBeLessThan(relativeLuminance(pale)!);
  });

  describe("picks the extreme that reaches furthest, measured rather than inferred", () => {
    /** Whichever of black and white gets further from `ground` once painted at `alpha`. */
    const bestReach = (ground: string, alpha: number) =>
      Math.max(
        contrastRatio(compositeOver(ground, "#ffffff", alpha)!, ground)!,
        contrastRatio(compositeOver(ground, "#000000", alpha)!, ground)!
      );

    it.each([
      // A ground just past the black/white crossover (0.1791) but far below 0.5, where a luminance
      // threshold at 0.5 picks white: white tops out at 3.78:1 here and black reaches 4.12:1, so a
      // 4:1 floor is reachable and the threshold misses it outright.
      ["#767676", 0.85, 4],
      ["#808080", 0.85, 4],
      ["#949494", 0.85, 4],
      ["#b0b0b0", 0.85, 4],
      // And the case a *full-strength* comparison gets wrong: contrast is not linear in luminance,
      // so on a saturated ground the extreme that wins at alpha 1 can lose at alpha 0.25.
      ["#a30bc2", 0.248, 1.45],
      ["#dc0416", 0.563, 2.4],
    ])("clears a reachable floor on %s at alpha %f", (ground, alpha, floor) => {
      // The property, not the mechanism: whenever *some* variant can clear the floor, the returned
      // one does. A test that asserted "blends toward white on a dark ground" would encode the same
      // rule the code uses and pass on every wrong rule the code could hold.
      expect(bestReach(ground, alpha)).toBeGreaterThanOrEqual(floor);

      const floored = adjustCompositeForContrast("#1F2937", ground, alpha, floor);
      expect(
        contrastRatio(compositeOver(ground, floored, alpha)!, ground)
      ).toBeGreaterThanOrEqual(floor);
    });
  });

  it("floors an arbitrary calendar colour no table could enumerate", () => {
    // One calendar per class, each a custom hex — the case a curated palette cannot cover.
    const teal = "#0f766e";
    expect(painted(teal)).toBeLessThan(AA_GRAPHICAL_OBJECT);
    expect(
      painted(adjustCompositeForContrast(teal, BAND, ARC_FILL_OPACITY, AA_GRAPHICAL_OBJECT))
    ).toBeGreaterThanOrEqual(AA_GRAPHICAL_OBJECT);
  });

  it("makes the minimal move — a lower floor leaves a fill that clears it untouched", () => {
    expect(adjustCompositeForContrast("#1F2937", BAND, ARC_FILL_OPACITY, 1)).toBe("#1F2937");
  });

  it("returns the ground's far extreme where no variant can clear the floor", () => {
    // At 0.2 alpha even pure white paints at 1.81:1, so 4.5 is unreachable. The honest answer is
    // the lightest thing available rather than a search that silently stops short of the target.
    expect(painted("#ffffff", 0.2)).toBeLessThan(AA_NORMAL_TEXT);
    expect(adjustCompositeForContrast("#1F2937", BAND, 0.2, AA_NORMAL_TEXT)).toBe("#ffffff");
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
