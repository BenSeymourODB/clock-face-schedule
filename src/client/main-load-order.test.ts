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
});
