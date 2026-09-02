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

  it("templates the deployment's own preferences onto the mount element", () => {
    // The layer a reset lands on (#157). Client-side, `readDeploymentPreferenceWire` reads this
    // attribute and nothing else, and the hyphenated name is what has to match across the boundary.
    expect(TEMPLATE).toContain('data-deployment-preferences="<?= deploymentPreferences ?>"');
  });

  it("emits the deployment preferences attribute whatever the conditions evaluate to", () => {
    expect(withoutGuardedRegions(TEMPLATE)).toContain("data-deployment-preferences=");
  });

  it("leaves the deployment preferences empty once scriptlets are stripped, as the preview does", () => {
    // The preview has no server, so it has no deployment layer: the client has to read this as
    // "nothing templated" and fall back to the code defaults, which is what a reset then lands on.
    expect(TEMPLATE.replace(SCRIPTLET, "")).toContain('data-deployment-preferences=""');
  });

  it("escapes the deployment preferences value rather than printing it raw", () => {
    expect(TEMPLATE).not.toContain("<?!= deploymentPreferences");
  });

  it("gives the two preference attributes different templated values", () => {
    // The copy-paste this exists for: templating the *resolved* wire into both makes every reset a
    // no-op — it lands the value it was undoing — and nothing else on the page or in a spec differs.
    // Asserted on the scriptlet expressions rather than on the attribute names, because it is which
    // server value each one carries that decides the behaviour.
    const pattern = /data-(?:deployment-)?preferences="<\?=\s*(\w+)\s*\?>"/g;
    const values: string[] = [];
    let match = pattern.exec(TEMPLATE);

    while (match !== null) {
      values.push(match[1] ?? "");
      match = pattern.exec(TEMPLATE);
    }

    expect(values).toHaveLength(2);
    expect(new Set(values).size).toBe(2);
  });

  it("templates the durations parameter onto the mount element", () => {
    // #178's switch, checkable on the device. `chosenDurations` reads this attribute and nothing
    // else, so the hyphenated name is what has to match across the boundary.
    expect(TEMPLATE).toContain('data-durations="<?= durationsParam ?>"');
  });

  it("emits the durations attribute whatever the conditions evaluate to", () => {
    expect(withoutGuardedRegions(TEMPLATE)).toContain("data-durations=");
  });

  it("leaves the durations attribute empty once scriptlets are stripped", () => {
    // Worse here than for the other templated values: this attribute overrides a stored preference,
    // so a stripped value the client read as anything but "the URL said nothing" would make every
    // preview — and every real load with no `?durations=` — show a dial the viewer did not ask for.
    expect(TEMPLATE.replace(SCRIPTLET, "")).toContain('data-durations=""');
  });

  it("escapes the durations value rather than printing it raw", () => {
    // It arrives from the URL, which is the same reason `now` and `scale` are escaped.
    expect(TEMPLATE).not.toContain("<?!= durationsParam");
  });

  it("templates the panel parameter onto the mount element", () => {
    // #185's preview flag. `panelAllowed` is handed this attribute and nothing else, so the
    // hyphenated name is what has to match across the boundary.
    expect(TEMPLATE).toContain('data-panel="<?= panelParam ?>"');
  });

  it("emits the panel attribute whatever the conditions evaluate to", () => {
    expect(withoutGuardedRegions(TEMPLATE)).toContain("data-panel=");
  });

  it("leaves the panel attribute empty once scriptlets are stripped", () => {
    // The `data-durations` trap, one surface over and one step worse: `panelAllowed` reads `"0"` as
    // "leave the column off", so a stripped value the client took for `"0"` would draw **every**
    // preview — and every real load with no `?panel=` — with no agenda column at all, on exactly the
    // boards ADR 0009 sized one for. Empty has to mean "the URL said nothing".
    expect(TEMPLATE.replace(SCRIPTLET, "")).toContain('data-panel=""');
  });

  it("escapes the panel value rather than printing it raw", () => {
    expect(TEMPLATE).not.toContain("<?!= panelParam");
  });

  /**
   * ADR 0008's bar, and the one property it cannot be built without: it is on screen on **every**
   * load. The switch inside it is what stops a scale change being a mode nobody knows was made, and
   * a switch that some loads do not carry is not an indicator — so this asserts the host survives
   * the guards, the way the preference attributes do, rather than merely appearing in the file.
   */
  it("emits the controls host whatever the conditions evaluate to", () => {
    expect(withoutGuardedRegions(TEMPLATE)).toContain('<div id="bar">');
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
