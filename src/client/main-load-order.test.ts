/**
 * The one property of `main.ts` that a unit test cannot reach: **the load path reads the clock once.**
 *
 * `main.ts` is a top-level script — it mounts, ticks and polls on import — so it has no spec, and
 * that is exactly where #152 lived. The renderer and the fixture refresher were both correct and
 * both fully covered; the bug was the *order* in which the host called them, and a second `now()`
 * read between the two. 1,508 tests stayed green through it.
 *
 * The remedy #152 took — hand the fixture the instant the dial was built with — makes the omission
 * impossible (the option is required) but not the *wrong value*: `loadedAt: now()` at the call site
 * is one token, type-correct, and reproduces the two-drain load frame with the whole suite green.
 * Verified by doing it. So this reads the source, which is the only place that shape is visible.
 *
 * A source-shape assertion, with the costs that carries: it says nothing about behaviour and it goes
 * stale if the load path is restructured. Both are answered the way `clock-pin.test.ts` answers them
 * for README's prose — every pattern must match, and a miss throws with what to do about it, so this
 * cannot rot into a green test asserting nothing.
 */
import { describe, expect, it } from "vitest";
import source from "./main.ts?raw";

/**
 * A required match. A regex that matched nothing would leave every assertion below trivially true,
 * which is the failure mode this file exists to catch, one level up.
 */
function sourceSays(pattern: RegExp, hint: string): RegExpExecArray {
  const found = pattern.exec(source);

  if (!found) {
    throw new Error(
      `main.ts no longer matches ${pattern} — ${hint}. Fix the pattern or restore the shape; this ` +
        `guard is asserting nothing until you do.`
    );
  }
  return found;
}

/** The load path: everything `startDisplay` does, up to its own closing brace at column zero. */
const LOAD_PATH = (() => {
  const [match] = sourceSays(
    /function startDisplay\(\)[\s\S]*?\n\}/,
    "`startDisplay` is no longer a top-level function"
  );
  return match;
})();

/** One call's argument object, by the name it is called with. */
function callArguments(name: string): string {
  const [, args] = sourceSays(
    new RegExp(`${name}\\(\\{([\\s\\S]*?)\\n\\s*\\}\\)`),
    `${name} is no longer called with an object literal spanning lines`
  );
  return args as string;
}

describe("main.ts's load path", () => {
  /**
   * The dial's first frame and the fixture's anchor must be the *same* value, not two reads that
   * agree to within however long the append and the label measurement take. Compared as source
   * identifiers, because that is the level the defect is on: any two `now()` calls are equal in a
   * test and differ on a real load.
   */
  it("hands the dial and the fixture anchor one identifier, not two clock reads", () => {
    const [, dialTime] = sourceSays(
      /analogClock\(\{[\s\S]*?\btime:\s*([^,\n]+)/,
      "`analogClock` is no longer given a `time`"
    );
    const fixture = callArguments("fixtureRefresher");
    const anchor = /\bloadedAt(?::\s*([^,\n]+))?\s*[,\n]/.exec(fixture);

    if (!anchor) throw new Error("fixtureRefresher is no longer given a `loadedAt` — #152's fix is gone");

    // Shorthand (`loadedAt,`) names itself; `loadedAt: x` names x.
    expect((anchor[1] ?? "loadedAt").trim()).toBe((dialTime as string).trim());
  });

  it("names that identifier with a bare variable, so it cannot be a fresh read", () => {
    const [, dialTime] = sourceSays(
      /analogClock\(\{[\s\S]*?\btime:\s*([^,\n]+)/,
      "`analogClock` is no longer given a `time`"
    );

    expect((dialTime as string).trim()).toMatch(/^[A-Za-z_$][\w$]*$/);
  });

  /**
   * The mutation that survives the required option: `loadedAt: now()`. It typechecks, it reads the
   * right seam, and it is a *different instant* from the one the dial drew — which is the whole of
   * #152.
   */
  it("reads no clock inside the fixture refresher's arguments", () => {
    expect(callArguments("fixtureRefresher")).not.toMatch(/\bnow\(\)/);
  });

  /**
   * One read for the whole frame. Counted before the dial is built rather than across the function,
   * because the tick and the poll below it read the clock on purpose and must go on doing so.
   */
  it("reads the clock exactly once before building the dial", () => {
    const beforeDial = LOAD_PATH.slice(0, LOAD_PATH.indexOf("analogClock("));

    expect(beforeDial.match(/\bnow\(\)/g)).toHaveLength(1);
  });

  /**
   * #152's property, extended to the panel (#39) — the second drawing the load path builds.
   *
   * Two reads here are invisible until an event ends between them, at which point the column and the
   * band disagree about the event set on the load frame: a card for something the arcs have already
   * finished drawing, or the reverse. Exactly #152's shape on a new surface, so it gets #152's guard
   * rather than waiting to be found by looking.
   */
  it("builds the panel from the same instant as the dial", () => {
    const [, dialTime] = sourceSays(
      /analogClock\(\{[\s\S]*?\btime:\s*([^,\n]+)/,
      "`analogClock` is no longer given a `time`"
    );
    const [, panelTime] = sourceSays(
      /agendaPanel\(\{[\s\S]*?\btime:\s*([^,\n}]+)/,
      "`agendaPanel` is no longer given a `time`"
    );

    expect((panelTime as string).trim()).toBe((dialTime as string).trim());
    expect((panelTime as string).trim()).toMatch(/^[A-Za-z_$][\w$]*$/);
  });

  /**
   * **The panel is updated before the dial, on every seam that updates both** (#172).
   *
   * The dial's suppression pass reads the panel's card set to decide which floating labels its
   * events are already named by. Updating the dial first would decide that against the *previous*
   * column — for exactly one tick after every change, which is precisely the moment a card is
   * appearing or leaving. The dial's own rebuild key corrects it on the following tick, so the
   * symptom is a single stale frame rather than a stuck one: harder to catch by looking than by
   * asserting, which is why this is a test and not a comment.
   *
   * Source order rather than behaviour, for this file's usual reason: two calls in either order are
   * indistinguishable in a test that drives them synchronously, and the defect is entirely about
   * which one the browser runs first.
   */
  /**
   * **The suppression source is gated on the column being *drawn*, not merely built** (#172).
   *
   * `main` ticks the panel on every board, including one too narrow to show it — `trackBoardLayout`
   * hides the host and the panel goes on keeping its card set current behind it. So `namedIds()` is
   * populated on a board that displays no column at all (#171), and suppressing against it would
   * drop the label of an arc nothing else names: #146's defect, on the boards least able to spare
   * the information.
   *
   * Rendered at 1000×1000, 1080×1920 and 1299×1000 the gate holds — the label set is identical to
   * `main`'s at `?now=17:00&freeze=1` and `?now=14:30&freeze=1`, five and three labels, none
   * dropped. That is a screenshot, and this is the assertion that keeps it true: the whole rule is
   * one `&&` term away from silently inverting on exactly the configuration no reviewer pins.
   *
   * Source shape, for this file's usual reason — the gate is a closure inside `startDisplay`, so
   * there is no seam to drive it from.
   */
  it("gates the suppression source on the panel host being visible", () => {
    const [, source_] = sourceSays(
      /namedElsewhere:\s*([A-Za-z_$][\w$]*)/,
      "`analogClock` is no longer given a `namedElsewhere`, or it is no longer a bare identifier"
    );
    const name = (source_ as string).trim();
    const [declaration] = sourceSays(
      new RegExp(`const ${name}\\s*=[\\s\\S]*?;`),
      `\`${name}\` is no longer declared as a const with a single-statement body`
    );

    // The host's own `hidden` attribute, which `trackBoardLayout` owns — not a second copy of
    // `panelFitsBoard`'s arithmetic, which would be two answers to "is the panel up".
    expect(declaration).toMatch(/hasAttribute\(\s*["']hidden["']\s*\)/);
    expect(declaration).toMatch(/panel\??\.namedIds\(\)/);
    // The empty set is the fallback, so an unmeasurable or hidden panel suppresses nothing.
    expect(declaration).toMatch(/new Set<string>\(\)/);
  });

  /**
   * **`?panel=0` gates the column, and it can only ever subtract one** (#185).
   *
   * `showPanel` is the single answer to "is the column up" — `trackBoardLayout` draws from it and
   * `?check=1`'s label-margin row reports from it — so the override belongs inside it rather than at
   * either call site. The property: the parameter is an `&&` term *ahead of* `panelFitsBoard` rather
   * than a replacement for it, so no value of the parameter can put a column on a board ADR 0009 says
   * cannot carry one. `panelAllowed`'s docstring carries the argument for why.
   *
   * **Matched as the whole returned expression, and the first version of this test was not.** It
   * asserted `/panelPermitted\s*&&/` present and `/panelPermitted\s*\|\|/` absent, which
   * `!panelPermitted &&` satisfies — so the one-character inversion this test exists to catch left
   * the whole suite green. Rendered, that mutant draws **no column on any ordinary load** and a
   * column only under `?panel=0`, which is worse than the defect and looks *more* correct in the one
   * screenshot anyone would take to check the flag. Found in review by mutating the source rather than
   * by reading the assertion, which is the only way this class of hole shows up.
   *
   * Source shape, for this file's usual reason: `showPanel` closes over a module-level constant read
   * from the page, so there is no seam to drive it from (#156).
   */
  it("gates the column on the panel override, ahead of the fit test and never instead of it", () => {
    const [declaration] = sourceSays(
      /function showPanel\([\s\S]*?\n\}/,
      "`showPanel` is no longer a top-level function"
    );
    const body = declaration as string;

    // The whole expression, anchored at `return`: a substring match is what let `!panelPermitted`
    // through, and any negation, cast or call wrapped round the term breaks this instead.
    expect(body).toMatch(/return\s*\(\s*panelPermitted\s*&&\s*panelFitsBoard\(/);
    // Stated a second way, against the mutation itself, so the anchor above cannot be loosened
    // without one of the two failing.
    expect(body).not.toMatch(/[!~]\s*panelPermitted/);
    expect(body).not.toMatch(/panelPermitted\s*\|\|/);
  });

  /**
   * The override is read from the page **once**, at module level, not per call.
   *
   * `showPanel` runs on every `ResizeObserver` firing, and two reads of `location.search` would also
   * be two chances for the two callers to disagree — the column drawn saying one thing and the
   * diagnostics row another, which is the mismatch that row exists to make visible.
   */
  it("reads the panel override once, outside the load path", () => {
    expect(source).toMatch(/^const panelPermitted = panelAllowed\(/m);
    expect(LOAD_PATH).not.toMatch(/panelAllowed\(/);
  });

  it.each([
    ["the tick", /window\.setInterval\(\(\) => \{[\s\S]*?\n\s*\}, TICK_INTERVAL_MS\)/],
    ["the fixture refresher", /setEvents:\s*\(events\) => \{[\s\S]*?\n\s*\}/],
    ["the calendar poll", /const events = await fetchWindow\(\);[\s\S]*?clock\.setEvents\(events\);/]
  ])("updates the panel before the dial in %s", (_seam, pattern) => {
    const [seam] = sourceSays(pattern, "that seam no longer looks like this");
    const panelAt = (seam as string).search(/panel\?\.set(Time|Events)\(/);
    const clockAt = (seam as string).search(/clock\.set(Time|Events)\(/);

    expect(panelAt).toBeGreaterThanOrEqual(0);
    expect(clockAt).toBeGreaterThanOrEqual(0);
    expect(panelAt).toBeLessThan(clockAt);
  });
});
