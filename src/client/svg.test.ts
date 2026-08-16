import { describe, expect, it } from "vitest";
import { SVG_NS, svg } from "./svg";

describe("svg", () => {
  it("creates elements in the SVG namespace", () => {
    const circle = svg("circle");

    expect(circle.namespaceURI).toBe(SVG_NS);
    expect(circle).toBeInstanceOf(SVGElement);
  });

  it.each([
    ["stroke-width", 1.5, "1.5"],
    ["text-anchor", "middle", "middle"],
    ["dominant-baseline", "central", "central"],
    ["font-weight", 700, "700"],
    ["r", 0, "0"],
  ])("sets %s, stringifying the value", (name, value, expected) => {
    expect(svg("circle", { [name]: value }).getAttribute(name)).toBe(expected);
  });

  it("skips undefined attributes so optional ones need no conditional spread", () => {
    const line = svg("line", { stroke: undefined, "stroke-width": 2 });

    expect(line.hasAttribute("stroke")).toBe(false);
    expect(line.getAttribute("stroke-width")).toBe("2");
  });

  it("appends string children as text", () => {
    expect(svg("text", {}, ["12"]).textContent).toBe("12");
  });

  it("appends element children in order", () => {
    const group = svg("g", {}, [svg("circle"), svg("line")]);

    expect([...group.children].map((child) => child.tagName)).toEqual(["circle", "line"]);
  });
});
