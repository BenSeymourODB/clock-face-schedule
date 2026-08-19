/**
 * `Index.html` is `doGet`'s template, and everything it gets wrong fails somewhere other than here:
 * a scriptlet mistake fails at page evaluation on the deployed app, where the preview cannot see it
 * and no builder test runs at all.
 */
import { describe, expect, it } from "vitest";

import TEMPLATE from "../../static/Index.html?raw";

const SCRIPTLET = /<\?[\s\S]*?\?>/g;

/**
 * What a conditional scriptlet drops when its condition is false: the guard and everything up to
 * its closing brace. Understands only the one guard shape this template uses — `if (…) {` … `}` —
 * which is enough to answer "is this attribute emitted whatever the conditions are".
 */
function withoutGuardedRegions(html: string): string {
  return html.replace(/<\?\s*if[\s\S]*?\?>[\s\S]*?<\?\s*\}\s*\?>/g, "");
}

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

  it("emits the preferences attribute whatever the conditions evaluate to", () => {
    // The regression this exists for: an attribute inside the `showDemo` guard is absent on every
    // real (non-demo) load, `readPreferenceWire` reads null, and every viewer silently gets the
    // defaults while the preview — which keeps guarded content — looks perfectly correct.
    expect(withoutGuardedRegions(TEMPLATE)).toContain("data-preferences=");
  });

  it("leaves an empty attribute behind once scriptlets are stripped, as the preview strips them", () => {
    // `writePreview` drops scriptlets and keeps what they guarded, so this is what the local preview
    // actually carries. The client has to read it as "nothing stored" rather than as a stored empty
    // set — hence the assertion on the empty *value* rather than on the attribute's presence.
    expect(TEMPLATE.replace(SCRIPTLET, "")).toContain('data-preferences=""');
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
