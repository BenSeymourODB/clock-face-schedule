import { describe, expect, it } from "vitest";
import { windowTrack } from "./window-track";

const CX = 300;
const CY = 300;
const OUTER_RADIUS = 292;

/** `M x y A R R … L x y A r r …` — the two radii of a donut segment. */
function radii(path: SVGPathElement): { outer: number; inner: number } {
  const found = (path.getAttribute("d") ?? "")
    .split("A ")
    .slice(1)
    .map((segment) => Number.parseFloat(segment));
  return { outer: found[0], inner: found[1] };
}

describe("windowTrack", () => {
  it("renders a single path tagged for the window track", () => {
    const path = windowTrack({
      cx: CX,
      cy: CY,
      outerRadius: OUTER_RADIUS,
      windowStartAngle: 30,
      windowEndAngle: 360,
    });

    expect(path.tagName).toBe("path");
    expect(path.getAttribute("data-testid")).toBe("window-track");
  });

  it("uses a faint, existing theme token rather than a new colour", () => {
    // ADR 0007 keeps exactly five CSS custom-property names; --border is the one already used
    // for the elapsed-arc outline (#26), so this reuses rather than adding a sixth.
    const path = windowTrack({
      cx: CX,
      cy: CY,
      outerRadius: OUTER_RADIUS,
      windowStartAngle: 0,
      windowEndAngle: 330,
    });

    expect(path.getAttribute("fill")).toBe("var(--border)");
    expect(Number(path.getAttribute("fill-opacity"))).toBeGreaterThan(0);
    expect(Number(path.getAttribute("fill-opacity"))).toBeLessThan(1);
    expect(path.getAttribute("stroke")).toBe("none");
  });

  it("sits at the outer rim, thin enough to read as a hairline rather than a band", () => {
    const path = windowTrack({
      cx: CX,
      cy: CY,
      outerRadius: OUTER_RADIUS,
      windowStartAngle: 0,
      windowEndAngle: 330,
    });
    const { outer, inner } = radii(path);

    expect(outer).toBeCloseTo(OUTER_RADIUS, 4);
    // Thin relative to the whole band (26% of the radius elsewhere on the dial) — a fraction of a
    // percent of the outer radius, not a fraction of the band.
    expect(outer - inner).toBeLessThan(OUTER_RADIUS * 0.02);
    expect(outer - inner).toBeGreaterThan(0);
  });

  it("spans exactly the window's own angles, drawing the major arc for a >180° window", () => {
    // The rolling window (#25) is 330° by construction — well past the 180° threshold where the
    // donut path must set the large-arc flag or draw the minor (30°) arc instead.
    const path = windowTrack({
      cx: CX,
      cy: CY,
      outerRadius: OUTER_RADIUS,
      windowStartAngle: 30,
      windowEndAngle: 360,
    });

    expect(path.getAttribute("d")).toMatch(/A \d+(\.\d+)? \d+(\.\d+)? 0 1 1/);
  });

  it("leaves the gap undrawn by construction — no path segment past windowEndAngle", () => {
    // There is nothing to assert about the gap directly: the track is exactly one arc from
    // windowStartAngle to windowEndAngle, so the remaining 30° is simply never painted. This test
    // exists so a future change that accidentally extends the span (e.g. always drawing a full
    // 360° ring) fails loudly instead of silently erasing the distinction the track exists for.
    const fullWindow = windowTrack({
      cx: CX,
      cy: CY,
      outerRadius: OUTER_RADIUS,
      windowStartAngle: 0,
      windowEndAngle: 330,
    });
    const wholeCircle = windowTrack({
      cx: CX,
      cy: CY,
      outerRadius: OUTER_RADIUS,
      windowStartAngle: 0,
      windowEndAngle: 360,
    });

    expect(fullWindow.getAttribute("d")).not.toBe(wholeCircle.getAttribute("d"));
  });
});
