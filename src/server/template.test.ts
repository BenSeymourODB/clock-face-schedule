import { describe, expect, it } from "vitest";

import indexHtml from "../../static/Index.html?raw";
import stylesHtml from "../../static/Styles.html?raw";

/**
 * Guards a failure mode with no local symptom at all.
 *
 * `HtmlService.createTemplateFromFile` scans raw bytes for `<?` … `?>` and compiles whatever falls
 * between into the generated function. It has no idea what an HTML comment is — so a comment
 * written to *describe* a scriptlet is compiled as one, and `template.evaluate()` throws a
 * SyntaxError that takes the whole page down. Only on the deployed app: `scripts/build.mjs` strips
 * every `<?…?>` with a regex before the preview is written, so the local render stays perfect
 * while the wall shows nothing.
 *
 * Caught in review on #34, where the comment explaining why `data-scale` is emitted
 * unconditionally contained the delimiters it was explaining. See `docs/DESIGN.md`.
 */
const TEMPLATES: [string, string][] = [
  ["Index.html", indexHtml],
  ["Styles.html", stylesHtml],
];

describe("templated HTML", () => {
  it.each(TEMPLATES)("%s puts no scriptlet delimiter inside an HTML comment", (_name, source) => {
    for (const comment of source.match(/<!--[\s\S]*?-->/g) ?? []) {
      expect(comment).not.toContain("<?");
      expect(comment).not.toContain("?>");
    }
  });

  it.each(TEMPLATES)("%s closes every scriptlet it opens", (_name, source) => {
    // An unclosed `<?` swallows the rest of the file into the compiled function.
    expect((source.match(/<\?/g) ?? []).length).toBe((source.match(/\?>/g) ?? []).length);
  });
});
