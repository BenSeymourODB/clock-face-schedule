/**
 * Confirms the jsdom project is wired up, and that namespaced elements come back as SVG rather
 * than HTML — the precondition for the builders in #4, which have no framework to get this
 * right for them.
 */
import { describe, expect, it } from "vitest";

const SVG_NS = "http://www.w3.org/2000/svg";

describe("client environment", () => {
  it("provides a DOM", () => {
    expect(document).toBeDefined();
  });

  it("creates namespaced SVG elements", () => {
    const circle = document.createElementNS(SVG_NS, "circle");

    expect(circle.namespaceURI).toBe(SVG_NS);
    expect(circle).toBeInstanceOf(SVGElement);
  });

  it("distinguishes SVG elements from same-named HTML elements", () => {
    // `document.createElement('circle')` silently yields an HTMLUnknownElement that renders
    // nothing — the single easiest mistake to make in a framework-free SVG builder.
    expect(document.createElement("circle")).not.toBeInstanceOf(SVGElement);
  });
});
