import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * `.claude/commands/implement-issue.md` is executed by a language model rather than by a shell, so
 * every property here is a property of the prose. That makes the failure mode worse than a broken
 * script, not better: a protocol that has drifted still *reads* as though it held, and the only
 * evidence is a duplicate PR two sessions later (#114, #133).
 *
 * Each assertion below names the silent failure it prevents, in `deploy-workflow.test.mjs`'s idiom.
 *
 * Two of them do pin literal wording, deliberately. The markers are a **wire format between two
 * runs that never meet**, so renaming one has to be an edit here as well as there, the way the
 * deploy guard pins `cancel-in-progress: false` rather than "some concurrency policy" — a rename
 * consistent across both sites still goes red, and that is the intended cost. And because the
 * marker pattern reads to the end of the line, quoting a marker in prose *without* backticks reads
 * as a third spelling; that is the price of not parsing markdown, which the sibling file pays too.
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
const RESUME = "🤖 implement-issue resuming this from a claim that stopped pushing.";

/** Only the closed set of three, so a typo in a name is a failure rather than a pattern. */
const escaped = (marker) => marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

describe("the claim protocol's three markers", () => {
  /**
   * The step-2 filter reads a marker the step-2 instruction writes, and the step-7 return check
   * reads a marker the take-over instruction writes. If either pair drifts by a word, the reader
   * finds nothing and reports "unclaimed" or "not taken over" for every issue — a check that always
   * passes, which is worse than no check because the run then says so in its PR body.
   */
  it("writes and reads each marker in exactly one spelling", () => {
    expect(new Set(markers)).toStrictEqual(new Set([CLAIM, TAKE_OVER, RESUME]));
  });

  /** A marker quoted once is a marker with only a writer or only a reader. */
  it("quotes each marker at both the writing and the reading site", () => {
    for (const marker of [CLAIM, TAKE_OVER, RESUME]) {
      expect(markers.filter((found) => found === marker).length).toBeGreaterThanOrEqual(2);
    }
  });

  /**
   * #133's measurement: 38 of the last 39 branches on this remote do not match the documented
   * naming pattern — 32 assigned by a driver, and 6 chosen by the run with none of them
   * conforming. So a comment that does not say where it is pushing leaves liveness on elapsed time
   * alone, which is the whole of the problem. Every marker needs the line, not just the first: a
   * take-over or a resume replaces the claim, so it becomes the only pointer there is.
   */
  it.each([
    ["claim", CLAIM],
    ["take-over", TAKE_OVER],
    ["resume", RESUME],
  ])("makes the %s name the branch it will push to", (_name, marker) => {
    expect(guide).toMatch(new RegExp(`${escaped(marker)}\\nBranch: `));
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

  /**
   * A resume is the case this check exists for and the one it is easiest to leave out: that run is
   * on *your* branch, so a PR opened over it publishes a diff containing someone else's commits,
   * and the two runs then race for the same ref. A take-over at least leaves the branches separate.
   */
  it("looks for a resume, which is the collision that shares a branch", () => {
    expect(guide.slice(returnCheck, createsPr)).toContain(RESUME);
  });

  /**
   * The property this whole step is for, and the one an earlier draft of this file left unpinned:
   * a check that finds the collision, reports it, and opens the PR anyway is #114 with a paragraph
   * in front of it. Both halves are asserted — the instruction *and* the command that gathers the
   * evidence, since a check with nothing to read cannot find anything either.
   */
  it("tells the run not to open the second PR, and how to find out", () => {
    const section = guide.slice(returnCheck, createsPr);

    expect(section).toMatch(/do not open a second PR/);
    expect(section).toMatch(/gh issue view <n> --comments/);
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
   * name, and 6 of those 39 runs did choose and still did not conform; the claim's declared branch
   * is the thing to look up.
   */
  it("looks up the branch the claim declared, not a guess from the naming pattern", () => {
    const lookups = guide.match(/git ls-remote[^\n]*/g) ?? [];

    expect(lookups.length).toBeGreaterThan(0);
    for (const lookup of lookups) {
      expect(lookup).not.toMatch(/claude\/issue-/);
    }
  });
});
