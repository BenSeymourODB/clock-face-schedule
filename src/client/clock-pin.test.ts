import { describe, expect, it } from "vitest";
import { fixtureAnchor, readClockPin } from "./clock-pin";

const REFERENCE = new Date(2026, 7, 18, 14, 37, 0);

function dial(attributes: Record<string, string> = {}): HTMLElement {
  const element = document.createElement("div");
  element.id = "dial";
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  return element;
}

describe("readClockPin", () => {
  it("is null when the page carries nothing", () => {
    expect(readClockPin(dial(), "", REFERENCE)).toBeNull();
    expect(readClockPin(null, "", REFERENCE)).toBeNull();
  });

  it("reads the server-templated attributes", () => {
    const pin = readClockPin(dial({ "data-now": "04:15", "data-freeze": "1" }), "", REFERENCE);

    expect(pin?.origin.getHours()).toBe(4);
    expect(pin?.origin.getMinutes()).toBe(15);
    expect(pin?.frozen).toBe(true);
  });

  it("reads the query string, which is all the server-less preview has", () => {
    const pin = readClockPin(dial(), "?now=04:15&freeze=1", REFERENCE);

    expect(pin?.origin.getHours()).toBe(4);
    expect(pin?.frozen).toBe(true);
  });

  it("prefers the templated attribute over the sandbox iframe's own query string", () => {
    const pin = readClockPin(dial({ "data-now": "04:15" }), "?now=09:00", REFERENCE);

    expect(pin?.origin.getHours()).toBe(4);
  });

  // The defect this guards: `data-freeze="1"` inside a `<? if ?>` guard would survive the preview
  // builder's scriptlet stripping and freeze every preview permanently. Templated values strip to
  // empty instead, and empty has to read as absent — not as "freeze at the epoch".
  it("treats the empty attributes the stripped template leaves behind as absent", () => {
    expect(readClockPin(dial({ "data-now": "", "data-freeze": "" }), "", REFERENCE)).toBeNull();
  });

  it("still falls back to the query string when the stripped attributes are present but empty", () => {
    const pin = readClockPin(
      dial({ "data-now": "", "data-freeze": "" }),
      "?now=04:15&freeze=1",
      REFERENCE
    );

    expect(pin?.origin.getHours()).toBe(4);
    expect(pin?.frozen).toBe(true);
  });

  it("falls back to the real clock when the time cannot be read", () => {
    expect(readClockPin(dial({ "data-now": "half four" }), "", REFERENCE)).toBeNull();
  });
});

describe("fixtureAnchor", () => {
  it("anchors to the rolling window's start when the clock is not pinned", () => {
    const anchor = fixtureAnchor(null, REFERENCE);

    expect(REFERENCE.getTime() - anchor.getTime()).toBe(3 * 60 * 60 * 1_000);
  });

  it("anchors to the pinned day's midnight, so the offsets read as clock times", () => {
    const pinned = new Date(2026, 7, 18, 4, 15, 0);
    const anchor = fixtureAnchor({ origin: pinned, frozen: true }, pinned);

    expect(anchor.getHours()).toBe(0);
    expect(anchor.getMinutes()).toBe(0);
    expect(anchor.getDate()).toBe(18);
  });

  /**
   * The measurement that made this function necessary: anchored to `windowStart`, every fixture
   * event's offset from `now` is a constant, so no pinned time can change which events are elapsed,
   * in progress, or still to come — the states pinning the clock exists to reach.
   */
  it("gives the pinned clock a phase to move, which the window anchor cannot", () => {
    const early = new Date(2026, 7, 18, 4, 15, 0);
    const late = new Date(2026, 7, 18, 9, 30, 0);

    const unpinnedPhase = (at: Date) => at.getTime() - fixtureAnchor(null, at).getTime();
    expect(unpinnedPhase(early)).toBe(unpinnedPhase(late));

    const pinnedPhase = (at: Date) =>
      at.getTime() - fixtureAnchor({ origin: at, frozen: true }, at).getTime();
    expect(pinnedPhase(late) - pinnedPhase(early)).toBe((5 * 60 + 15) * 60 * 1_000);
  });

  it("agrees with the unpinned anchor at 03:00, so the default is not a third behaviour", () => {
    const threeAm = new Date(2026, 7, 18, 3, 0, 0);

    expect(fixtureAnchor({ origin: threeAm, frozen: false }, threeAm).getTime()).toBe(
      fixtureAnchor(null, threeAm).getTime()
    );
  });
});
