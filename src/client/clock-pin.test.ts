import { describe, expect, it } from "vitest";
import { filterEventsForPeriod, getRollingWindow } from "../shared/clock";
import { fixtureAnchor, readClockPin } from "./clock-pin";
import { sampleEvents } from "./sample-events";

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
    const anchor = fixtureAnchor({ origin: pinned, frozen: true, displaced: true }, pinned);

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
      at.getTime() - fixtureAnchor({ origin: at, frozen: true, displaced: true }, at).getTime();
    expect(pinnedPhase(late) - pinnedPhase(early)).toBe((5 * 60 + 15) * 60 * 1_000);
  });

  it("agrees with the unpinned anchor at 03:00, so the default is not a third behaviour", () => {
    const threeAm = new Date(2026, 7, 18, 3, 0, 0);

    expect(fixtureAnchor({ origin: threeAm, frozen: false, displaced: true }, threeAm).getTime()).toBe(
      fixtureAnchor(null, threeAm).getTime()
    );
  });
});

/**
 * How many fixture arcs the dial would actually draw. The anchor is only meaningful through this:
 * an anchoring rule that is arithmetically tidy and puts the whole fixture outside the window is
 * still a broken one, and asserting on the anchor's own timestamp cannot tell the difference.
 */
function drawnArcs(pinQuery: string, at: Date): number {
  const pin = readClockPin(dial(), pinQuery, at);
  const now = pin ? pin.origin : at;
  const { windowStart, windowEnd } = getRollingWindow(now);

  return filterEventsForPeriod(sampleEvents(fixtureAnchor(pin, now)), windowStart, windowEnd).length;
}

describe("what the anchor leaves on the dial", () => {
  /**
   * The defect this exists for: keying the anchor on `pin !== null` rather than on the clock
   * having been *moved* re-anchored the fixture for `?freeze=1` alone, which drops the dial from
   * fifteen arcs to one at 14:37. Every earlier `fixtureAnchor` assertion passed, because they
   * all used a displaced pin at an hour where midnight anchoring happens to work.
   */
  it("leaves the unpinned picture alone when only the clock is frozen", () => {
    for (const hour of [9, 14, 18, 22]) {
      const at = new Date(2026, 7, 18, hour, 37);

      expect(drawnArcs("?freeze=1", at), `${hour}:37`).toBe(drawnArcs("", at));
    }
  });

  /**
   * Expected value derived rather than written: the property is that the filter drops *nothing*,
   * and a literal is only today's encoding of it. A hard-coded count is what let #73's two new
   * fixture events turn `main` red — the branches were green apart, and no test ran between the
   * merge and the day someone looked.
   */
  it("keeps the fixture on the dial at every hour when unpinned", () => {
    for (let hour = 0; hour < 24; hour += 1) {
      const at = new Date(2026, 7, 18, hour, 0);

      expect(drawnArcs("", at), `${hour}:00`).toBe(sampleEvents(fixtureAnchor(null, at)).length);
    }
  });

  /**
   * A displaced pin trades that guarantee for control, and the range it holds over is a fact about
   * what the fixture covers (22:50 the previous day to 13:15) rather than about the anchoring.
   * Pinned to the afternoon the window has walked off the fixture entirely — documented in README
   * and asserted here so the boundary cannot move without someone noticing.
   */
  it("puts the fixture on the dial for a morning pin and off it for an evening one", () => {
    const at = new Date(2026, 7, 18, 14, 37);

    expect(drawnArcs("?now=03:00&freeze=1", at)).toBe(15);
    expect(drawnArcs("?now=09:00&freeze=1", at)).toBe(6);
    expect(drawnArcs("?now=12:00&freeze=1", at)).toBe(3);
    expect(drawnArcs("?now=17:00&freeze=1", at)).toBe(0);
  });
});
