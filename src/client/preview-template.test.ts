/**
 * What `build/preview.html` inherits from `Index.html`'s scriptlets.
 *
 * The preview builder strips scriptlet tags but **keeps what they guard**, deliberately: that is
 * how `data-demo="1"` is always on in the preview with no server to set it. The trap is that any
 * other literal attribute written inside a guard becomes permanently on too — a guarded
 * `data-freeze="1"` would have frozen every preview, silently, and a frozen preview looks exactly
 * like a working one until you notice the second hand.
 *
 * Asserted against the template rather than the built output so it holds without a build step.
 */
import { describe, expect, it } from "vitest";
import indexTemplate from "../../static/Index.html?raw";
import stylesTemplate from "../../static/Styles.html?raw";
import { readClockPin } from "./clock-pin";

/** The strip pass from `scripts/build.mjs` — kept in step with it by hand. */
const SCRIPTLET = /<\?[\s\S]*?\?>/g;

function previewDial(): HTMLElement {
  const parsed = new DOMParser().parseFromString(indexTemplate.replace(SCRIPTLET, ""), "text/html");
  const dial = parsed.querySelector("#dial");

  if (!(dial instanceof HTMLElement)) throw new Error("no #dial in the stripped template");
  return dial;
}

describe("the stripped Index template", () => {
  it("keeps demo mode on, which is the whole point of the preview", () => {
    expect(previewDial().dataset["demo"]).toBe("1");
  });

  it("pins nothing, so the preview's clock is the real one until a query string says otherwise", () => {
    expect(readClockPin(previewDial(), "", new Date())).toBeNull();
  });

  it("templates no deployment layer, so a reset in the preview lands on the code defaults", () => {
    // The preview has no server and therefore no script store. The attribute has to survive the
    // strip as an empty string rather than vanish: `readDeploymentPreferenceWire` reads an absent
    // attribute as null, and null and "" both decode to the code defaults — but only the empty
    // string proves the attribute was emitted at all, which is what the deployed app depends on.
    expect(previewDial().dataset["deploymentPreferences"]).toBe("");
  });

  it("leaves the preview free to be pinned from its own query string", () => {
    const pin = readClockPin(previewDial(), "?now=04:15&freeze=1", new Date());

    expect(pin?.origin.getHours()).toBe(4);
    expect(pin?.frozen).toBe(true);
  });
});

/**
 * Everything the page needs arrives through `include()`, which is what leaves the resolved preview
 * a single self-contained file — openable from `file://`, and so reviewable straight out of CI's
 * build artifact with no checkout and no local server (#100).
 *
 * A `<script src>`, a stylesheet `<link>` or a webfont `@import` would keep working on the deployed
 * app and keep every other test here green, while quietly making a downloaded preview depend on a
 * network the reviewer may not have.
 *
 * Inline `data:` payloads and `url(#…)` fragments are both fine — they travel with the file, and the
 * dial's gradients and masks are referenced that way, so a blanket ban on `url(` would fail the day
 * one of them moved from the client bundle into the stylesheet.
 */
const SUBRESOURCE = [
  ["a script from elsewhere", /<script[^>]*\ssrc\s*=/i],
  ["a linked stylesheet or icon", /<link[^>]*\shref\s*=/i],
  ["an image or media file", /<(?:img|image|video|audio|source|iframe|embed)[^>]*\ssrc\s*=/i],
  ["a CSS import", /@import/i],
  ["a CSS url() that is neither inline data nor a fragment", /url\(\s*['"]?(?!data:|#)/i],
] as const;

describe("the preview's self-containment", () => {
  it.each([
    ["Index.html", indexTemplate],
    ["Styles.html", stylesTemplate],
  ])("%s fetches nothing of its own", (_file, source) => {
    for (const [what, pattern] of SUBRESOURCE) {
      expect(source, `loads ${what}`).not.toMatch(pattern);
    }
  });
});
