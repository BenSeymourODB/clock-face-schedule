import { describe, expect, it } from "vitest";
import readme from "../../README.md?raw";
import {
  ROLLING_WINDOW_LOOKAHEAD_HOURS,
  ROLLING_WINDOW_LOOKBEHIND_HOURS,
  dialScale,
  dialWindow,
  filterEventsForPeriod
} from "../shared/clock";
import { fixtureAnchor, readClockPin } from "./clock-pin";
import { TWELVE_HOUR_FIXTURE, recurringSampleEvents, sampleEvents } from "./sample-events";

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
 *
 * Counts what the renderer is handed — `recurringSampleEvents` over the scale's own window, exactly
 * as `main.ts` builds them and `analog-clock.ts` re-filters them. `sampleEvents` alone is one copy,
 * and the app has tiled copies since #62/#79; counting one copy here is what let README claim an
 * evening pin is empty while the dial draws a full one (#127).
 */
function drawnArcs(pinQuery: string, at: Date): number {
  const pin = readClockPin(dial(), pinQuery, at);
  const now = pin ? pin.origin : at;
  const view = dialWindow(now, dialScale("12h"));
  const events = recurringSampleEvents(TWELVE_HOUR_FIXTURE, fixtureAnchor(pin, now), view);

  return filterEventsForPeriod(events, view.windowStart, view.windowEnd).length;
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
   * The claim README's first pin-table row makes, and the one #150 overstated (#153): `?now=03:00`
   * reproduces the *unpinned* dial's arcs and their states, at any time of day. Worth asserting
   * because the row is what sends a reviewer to that pin instead of an unpinned look.
   *
   * Ids and the state partition, not a count — a count would pass on two dials carrying the same
   * number of different arcs, which is most of what a re-anchoring bug does. What this deliberately
   * does *not* claim is that the two are the same picture: the dial rotates with the wall clock, so
   * the floating-label set differs between them and drifts unpinned. That is README's job to say and
   * no assertion's to fix.
   */
  it("reproduces the unpinned arcs and their states at the 03:00 pin", () => {
    const partition = (query: string, at: Date) => {
      const pin = readClockPin(dial(), query, at);
      const now = pin ? pin.origin : at;
      const view = dialWindow(now, dialScale("12h"));
      const drawn = filterEventsForPeriod(
        recurringSampleEvents(TWELVE_HOUR_FIXTURE, fixtureAnchor(pin, now), view),
        view.windowStart,
        view.windowEnd
      );

      return {
        ids: drawn.map((event) => event.id).sort(),
        elapsed: drawn.filter((event) => new Date(event.endDate) <= now).length,
        running: drawn.filter(
          (event) => new Date(event.startDate) <= now && now < new Date(event.endDate)
        ).length
      };
    };

    for (const hour of [1, 9, 14, 18, 22]) {
      const at = new Date(2026, 7, 18, hour, 37);

      expect(partition("", at), `unpinned at ${hour}:37`).toEqual(
        partition("?now=03:00&freeze=1", at)
      );
    }
  });

  /**
   * Derived, not literal: the property is that the filter drops *nothing*, so growing the fixture
   * must not read as a regression. The pinned counts below stay literal — those are facts about
   * the span the fixture covers, which nothing can derive honestly.
   */
  it("keeps the fixture on the dial at every hour when unpinned", () => {
    for (let hour = 0; hour < 24; hour += 1) {
      const at = new Date(2026, 7, 18, hour, 0);

      expect(drawnArcs("", at), `${hour}:00`).toBe(sampleEvents(fixtureAnchor(null, at)).length);
    }
  });

  /**
   * A displaced pin trades that guarantee for control, but the fixture *recurs* (#62/#79): the app
   * tiles copies end to end, so a pin never walks off it and the dial carries roughly a dozen arcs
   * at every hour. The evening figures are the ones that reverse — a single copy is empty from
   * 17:00, but the next copy has already arrived, so the dial is at its fullest there. Asserted here
   * so a recurrence that stopped recurring — which would drop the evening counts back to zero —
   * cannot land unnoticed.
   */
  it("keeps a displaced pin on a full dial at every hour, because the fixture recurs", () => {
    const at = new Date(2026, 7, 18, 14, 37);

    expect(drawnArcs("?now=03:00&freeze=1", at)).toBe(16);
    expect(drawnArcs("?now=09:00&freeze=1", at)).toBe(12);
    expect(drawnArcs("?now=12:00&freeze=1", at)).toBe(13);
    expect(drawnArcs("?now=17:00&freeze=1", at)).toBe(16);
    expect(drawnArcs("?now=23:00&freeze=1", at)).toBe(12);
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
    const [, list] = readmeSays(/carries a full count at every hour: ([^.]*)\./);
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

    // The claim the sentence makes, asserted rather than left to the prose: the fixture recurs, so a
    // displaced pin never lands on an empty dial (#127). This is the reversal — the pre-recurrence
    // guard required the counts to fall monotonically to zero, which described one copy, not the
    // dial. A recurrence that stopped recurring drops the evening hours back to zero and this bites.
    const counts = pairs.map(([, count]) => count);
    expect(Math.min(...counts)).toBeGreaterThan(0);

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
    const [, from, to] = readmeSays(
      /The fixture spans (\d{2}:\d{2}) the previous day to (\d{2}:\d{2})/
    );
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
    const [, behind, lookbehind, ahead, lookahead] = readmeSays(
      /window of \[now (\S) (\d+)h, now (\S) (\d+)h\]/
    );

    // The signs carry half the meaning, and a pattern that skipped past them would call
    // `[now + 3h, now + 8h]` — a window that has not begun yet — a correct description.
    expect(behind).toMatch(/^[-−–—]$/);
    expect(ahead).toBe("+");
    expect(Number(lookbehind)).toBe(ROLLING_WINDOW_LOOKBEHIND_HOURS);
    expect(Number(lookahead)).toBe(ROLLING_WINDOW_LOOKAHEAD_HOURS);
  });
});
