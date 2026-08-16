/**
 * Minimal element builder for SVG.
 *
 * Exists because there is no framework here (ADR 0004) and the ported components are dense
 * nested markup. Without it the port becomes an unreadable wall of `setAttribute` calls.
 *
 * ⚠️ Attribute names are **real SVG attribute names**, not the camelCase JSX spellings the
 * source components use: `stroke-width`, not `strokeWidth`; `text-anchor`, not `textAnchor`.
 * A camelCase name is not an error — it sets an attribute the renderer ignores, so the element
 * simply appears unstyled with nothing logged. This is the single easiest mistake to make when
 * porting from TSX, which is why the specs assert on rendered attribute names.
 */

export const SVG_NS = "http://www.w3.org/2000/svg";

export type SvgAttributes = Record<string, string | number | undefined>;

export type SvgChild = Node | string;

/**
 * Build an SVG element. `undefined` attribute values are skipped, so optional attributes can be
 * passed inline without a conditional spread. String children become text nodes.
 */
export function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attributes: SvgAttributes = {},
  children: SvgChild[] = []
): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG_NS, tag);

  for (const [name, value] of Object.entries(attributes)) {
    if (value === undefined) continue;
    element.setAttribute(name, String(value));
  }

  if (children.length > 0) {
    element.append(...children);
  }

  return element;
}
