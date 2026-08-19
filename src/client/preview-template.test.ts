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

  it("leaves the preview free to be pinned from its own query string", () => {
    const pin = readClockPin(previewDial(), "?now=04:15&freeze=1", new Date());

    expect(pin?.origin.getHours()).toBe(4);
    expect(pin?.frozen).toBe(true);
  });
});
