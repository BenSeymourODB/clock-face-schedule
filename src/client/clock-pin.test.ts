import { describe, expect, it } from "vitest";
import readme from "../../README.md?raw";
import {
  ROLLING_WINDOW_LOOKAHEAD_HOURS,
  ROLLING_WINDOW_LOOKBEHIND_HOURS,
  filterEventsForPeriod,
  getRollingWindow
} from "../shared/clock";
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
   * what the fixture covers (23:10 the previous day to 13:15) rather than about the anchoring.
   * Pinned to the afternoon the window has walked off the fixture entirely — documented in README
   * and asserted here so the boundary cannot move without someone noticing.
   */
  it("puts the fixture on the dial for a morning pin and off it for an evening one", () => {
    const at = new Date(2026, 7, 18, 14, 37);

    expect(drawnArcs("?now=03:00&freeze=1", at)).toBe(16);
    expect(drawnArcs("?now=09:00&freeze=1", at)).toBe(6);
    expect(drawnArcs("?now=12:00&freeze=1", at)).toBe(3);
    expect(drawnArcs("?now=17:00&freeze=1", at)).toBe(0);
  });
});

/**
 * README states the same coverage facts in prose, and prose is the copy nothing checks: #77 added
 * one fixture event, the assertion above went red as it should, and README's figure went stale
 * silently. That was the second time in two days — #73 was the first — so the missing piece is not
 * a derivation but a *link* between the two copies.
 *
 * Read through `?raw` rather than `node:fs`, for the reason `raw.d.ts` gives: the client tsconfig
 * carries no node types on purpose, and a test is not a reason to relax it.
 */
const README = readme.replace(/[*`]/g, "").replace(/\s+/g, " ");

/**
 * A regex that matched nothing would leave a green test asserting on an empty list — the exact
 * failure mode this guards against, one level up. So every pattern is required to have matched
 * before anything is derived from it.
 */
function readmeSays(pattern: RegExp): RegExpExecArray {
  const found = pattern.exec(README);

  if (!found) {
    throw new Error(
      `README no longer carries ${pattern} — the sentence moved or was reworded, so this guard is ` +
        `asserting nothing. Fix the pattern or restore the figures.`
    );
  }
  return found;
}

function hhmm(at: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");

  return `${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

describe("the fixture figures README states in prose", () => {
  const at = new Date(2026, 7, 18, 14, 37);

  /**
   * The figure #77 broke. README's numbers are the expected values here — the test carries none of
   * its own, so this adds a reader of README beside the literals above rather than a third copy of
   * them.
   */
  it("counts the same arcs at each hour README names", () => {
    const [, list] = readmeSays(/arcs drop away through the afternoon: ([^.]*)\./);
    const stated = /(\d+|none) (?:arcs )?(?:at|from) (\d{2}:\d{2})/g;
    const pairs: Array<[string, number]> = [];

    for (let found = stated.exec(list); found; found = stated.exec(list)) {
      pairs.push([found[2] as string, found[1] === "none" ? 0 : Number(found[1])]);
    }

    // Every clock time in that sentence must have been parsed, or a figure would go unchecked
    // while the test stayed green — which is the whole defect, one level down.
    expect(pairs.map(([hour]) => hour)).toEqual(list.match(/\d{2}:\d{2}/g));

    // A floor, not today's figures: measured against a mutated README, every other assertion here
    // bites, but *deleting* the offending hour goes green — which makes "drop the line" the cheap
    // way past a red count. Add hours freely; removing one has to be deliberate.
    expect(pairs.length).toBeGreaterThanOrEqual(5);

    // The two claims the sentence actually makes, asserted rather than left to the prose: arcs
    // "drop away through the afternoon", and the dial is "empty by the evening".
    const counts = pairs.map(([, count]) => count);
    expect(counts.slice().sort((left, right) => right - left)).toEqual(counts);
    expect(counts[counts.length - 1]).toBe(0);

    for (const [hour, count] of pairs) {
      expect(drawnArcs(`?now=${hour}&freeze=1`, at), `README says ${count} arcs at ${hour}`).toBe(
        count
      );
    }
  });

  /**
   * The span in the same sentence, and the reason the pinned counts are literals rather than
   * derived: they are a fact about what the fixture *covers*, and this is where that fact is
   * written down for a reader.
   */
  it("spans the hours README says it spans", () => {
    const [, from, to] = readmeSays(/The fixture spans (\d{2}:\d{2}) the previous day to (\d{2}:\d{2})/);
    const pinned = new Date(2026, 7, 18, 3, 0, 0);
    const anchor = fixtureAnchor({ origin: pinned, frozen: true, displaced: true }, pinned);
    const events = sampleEvents(anchor);
    const earliest = new Date(Math.min(...events.map((event) => Date.parse(event.startDate))));
    const latest = new Date(Math.max(...events.map((event) => Date.parse(event.endDate))));

    expect(hhmm(earliest)).toBe(from);
    expect(hhmm(latest)).toBe(to);
    // "the previous day" is load-bearing: 23:10 on the anchor's own day would be a fixture that
    // starts after it ends, and the times alone cannot tell the difference.
    expect(anchor.getTime() - earliest.getTime()).toBeGreaterThan(0);
    expect(latest.getDate()).toBe(anchor.getDate());
  });

  it("quotes the rolling window the counts were measured against", () => {
    const [, lookbehind, lookahead] = readmeSays(
      /window of \[now \S (\d+)h, now \S (\d+)h\]/
    );

    expect(Number(lookbehind)).toBe(ROLLING_WINDOW_LOOKBEHIND_HOURS);
    expect(Number(lookahead)).toBe(ROLLING_WINDOW_LOOKAHEAD_HOURS);
  });
});
