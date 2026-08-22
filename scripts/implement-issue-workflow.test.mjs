import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * `.claude/commands/implement-issue.md` is executed by a language model rather than by a shell, so
 * every property here is a property of the prose. That makes the failure mode worse than a broken
 * script, not better: a protocol that has drifted still *reads* as though it held, and the only
 * evidence is a duplicate PR two sessions later (#114, #133).
 *
 * Each assertion below names the silent failure it prevents, in `deploy-workflow.test.mjs`'s idiom.
 * None of them are style, and none assert that a rule is *worded* a particular way — they assert
 * that the two halves of a rule still agree with each other, which is what an edit to one half
 * quietly breaks.
 */
const guide = readFileSync(
  new URL("../.claude/commands/implement-issue.md", import.meta.url),
  "utf8",
);

/**
 * A marker is a phrase a run writes on an issue and a later run greps for. Both spellings must come
 * from this one pattern, so a reword on either side shows up as a third distinct phrase rather than
 * as a check that silently matches nothing.
 */
const markers = guide.match(/🤖 implement-issue [^`\n]+/g) ?? [];

const CLAIM = "🤖 implement-issue claiming this for the next session.";
const TAKE_OVER = "🤖 implement-issue taking this over from a claim that has gone quiet.";

describe("the claim protocol's two markers", () => {
  /**
   * The step-2 filter reads a marker the step-2 instruction writes, and the step-7 return check
   * reads a marker the take-over instruction writes. If either pair drifts by a word, the reader
   * finds nothing and reports "unclaimed" or "not taken over" for every issue — a check that always
   * passes, which is worse than no check because the run then says so in its PR body.
   */
  it("writes and reads each marker in exactly one spelling", () => {
    expect(new Set(markers)).toStrictEqual(new Set([CLAIM, TAKE_OVER]));
  });

  /** A marker quoted once is a marker with only a writer or only a reader. */
  it("quotes each marker at both the writing and the reading site", () => {
    for (const marker of [CLAIM, TAKE_OVER]) {
      expect(markers.filter((found) => found === marker).length).toBeGreaterThanOrEqual(2);
    }
  });

  /**
   * #133's measurement: 38 of the last 39 branches on this remote were named by the scheduled
   * driver, not by the run, so a claim that does not say where it is pushing leaves liveness on
   * elapsed time alone — which is the whole of the problem. The branch line has to be part of the
   * template, because a claim comment is the one artefact every run posts.
   */
  it("makes the claim name the branch it will push to", () => {
    expect(guide).toMatch(
      new RegExp(`${CLAIM.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\nBranch: `),
    );
  });
});

describe("the return check", () => {
  const returnCheck = guide.indexOf("### Before you open a PR");
  const createsPr = guide.indexOf("gh pr create");

  /**
   * The expensive half of #114 was ordering, not knowledge: run A had done the work and opened
   * #131 without looking. A check placed after the `gh pr create` snippet is read by a run that
   * has already published the duplicate, so this is the one property here that is about position.
   */
  it("comes before the snippet that opens the PR", () => {
    expect(returnCheck).toBeGreaterThan(-1);
    expect(createsPr).toBeGreaterThan(-1);
    expect(returnCheck).toBeLessThan(createsPr);
  });

  /**
   * It belongs in step 7 rather than step 2, per the decision on #133: a run that has done the work
   * is exactly the run that has forgotten to look. Step 2 already checked, hours earlier.
   */
  it("sits in step 7, where the work is already done", () => {
    const stepSeven = guide.indexOf("## 7.");
    const stepEight = guide.indexOf("## 8.");

    expect(stepSeven).toBeGreaterThan(-1);
    expect(returnCheck).toBeGreaterThan(stepSeven);
    expect(returnCheck).toBeLessThan(stepEight);
  });

  /**
   * Two conditions, and the second is the one that would have stopped run A: #129 was open and
   * closing #114 for 99 minutes before #131 was opened. A take-over comment is the cheaper signal
   * but not the reliable one — a run that dies before commenting still leaves its PR behind.
   */
  it("looks for an open PR as well as a take-over comment", () => {
    const section = guide.slice(returnCheck, createsPr);

    expect(section).toContain(TAKE_OVER);
    expect(section).toMatch(/in:body Closes #/);
  });
});

describe("the staleness window", () => {
  /**
   * The window is decided in one place and reasoned about in others. Step 2 filtering on one figure
   * while the return check or the take-over rule assumes another is invisible from either half —
   * so every figure in the document that names a claim's age has to be the same one.
   *
   * It stays at six hours deliberately (#133): the run that opened #131 took 7h56m, so it is too
   * short, but lengthening it without a liveness signal leaves every dead claim blocking its issue
   * for the rest of the window, and the return check makes the duplicate-PR cost survivable anyway.
   *
   * Every `<something> hours` phrase in the document is read as the window, deliberately — a vague
   * one beside a precise one is how two figures start. Write the number.
   */
  it("names one window, everywhere it is named", () => {
    const words = { six: 6, twelve: 12, "twenty-four": 24, two: 2, three: 3, four: 4 };
    const figures = (guide.match(/\b([\w-]+)[ -]hours?\b/gi) ?? []).map((found) => {
      const token = found.replace(/[ -]hours?$/i, "").toLowerCase();
      return words[token] ?? Number(token);
    });

    expect(figures.length).toBeGreaterThan(1);
    expect(new Set(figures)).toStrictEqual(new Set([6]));
  });
});

describe("the branch liveness check", () => {
  /**
   * The trap this exists for: `git ls-remote --heads origin 'claude/issue-<n>-*'` reads as the
   * obvious way to find a claiming run's branch, and it would find nothing for 38 of the last 39
   * runs on this remote — reporting every live claim dead, in the direction #133 measures as
   * costing two sessions rather than one. The pattern is a default for a run that chooses its own
   * name; the claim's declared branch is the thing to look up.
   */
  it("looks up the branch the claim declared, not a guess from the naming pattern", () => {
    const lookups = guide.match(/git ls-remote[^\n]*/g) ?? [];

    expect(lookups.length).toBeGreaterThan(0);
    for (const lookup of lookups) {
      expect(lookup).not.toMatch(/claude\/issue-/);
    }
  });
});
