/**
 * `Index.html` is `doGet`'s template, and everything it gets wrong fails somewhere other than here:
 * a scriptlet mistake fails at page evaluation on the deployed app, where the preview cannot see it
 * and no builder test runs at all.
 */
import { describe, expect, it } from "vitest";

import TEMPLATE from "../../static/Index.html?raw";

/** Everything between an HTML comment's delimiters, comment by comment. */
function comments(html: string): string[] {
  const found: string[] = [];
  const pattern = /<!--([\s\S]*?)-->/g;
  let match = pattern.exec(html);

  while (match !== null) {
    found.push(match[1] ?? "");
    match = pattern.exec(html);
  }
  return found;
}

describe("the page template", () => {
  it("templates the viewer's preferences onto the mount element", () => {
    // Client-side, `readPreferenceWire` reads this attribute and nothing else; the hyphenated name
    // is what has to match, not the dataset spelling.
    expect(TEMPLATE).toContain('data-preferences="<?= preferences ?>"');
  });

  it("emits the preferences attribute unconditionally, so the preview strips it to empty", () => {
    // The preview builder drops scriptlets and keeps what they guarded. An attribute behind a guard
    // would therefore be baked into every preview, which for a stored preference would mean the
    // local preview permanently rendering somebody's saved state.
    // The whole line rather than a tag match: a scriptlet's own `?>` closes any `[^>]*` pattern.
    const dial = TEMPLATE.split("\n").find((line) => line.includes('id="dial"')) ?? "";

    expect(dial).toContain('data-preferences="<?= preferences ?>"');
    expect(dial.slice(dial.indexOf("data-preferences"))).not.toContain("<? if");
  });

  it("escapes the preferences value rather than printing it raw", () => {
    // It needs no escaping — every encoded preference is [A-Za-z0-9;=] — but the value comes out of
    // a store, and raw output would make that closure load-bearing for page integrity.
    expect(TEMPLATE).not.toContain("<?!= preferences");
  });

  it("keeps scriptlet delimiters out of its comments", () => {
    // HtmlService compiles `<? … ?>` wherever it appears: it does not parse HTML, so a comment is
    // not a comment to it. A delimiter written inside one as illustration is compiled as code —
    // usually to a syntax error that fails the whole page, and only on the deployed app, since the
    // preview builder strips scriptlets before a browser ever sees them.
    for (const comment of comments(TEMPLATE)) {
      expect(comment).not.toMatch(/<\?/);
    }
  });
});
