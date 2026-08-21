import { describe, expect, it } from "vitest";

import { readPlans } from "./check-plans.mjs";
import { checkPlan, checkPlans, checkStatus, readState, readStatus } from "./plan-status.mjs";

describe("the state a status opens with", () => {
  it.each([
    ["done", "done"],
    ["done — shipped in #109", "done"],
    ["done — shipped in [#73](https://github.com/o/r/pull/73)", "done"],
    ["*done*", "done"],
    ["Done", "done"],
    ["in progress", "in progress"],
    ["in progress — W10 outstanding as #10", "in progress"],
    ["superseded by #99", "superseded"],
    // The state has to be read longest-first, or `in progress` is an unknown state starting `in`.
    ["in review", null],
    ["in review — #111", null],
    ["shipped", null],
    // A prefix is not the state. Accepting one would pass the typo this module exists to catch.
    ["doneish", null],
    ["proposed, done later", null],
  ])("reads %j as %j", (status, state) => {
    expect(readState(status)).toBe(state);
  });

  it("does not throw on a status that is not a string", () => {
    expect(readState(null)).toBeNull();
    expect(readState(undefined)).toBeNull();
  });
});

describe("the status a plan may carry", () => {
  it.each([
    ["done", true],
    ["done — shipped in #109", true],
    ["in progress — W10 outstanding as [#10](https://github.com/o/r/issues/10)", true],
    ["in progress — blocked on #46", true],
    ["superseded by ADR 0009, see #88", true],
    ["superseded — (#88) reversed it", true],
  ])("accepts %j", (status) => {
    expect(checkStatus(status)).toBeNull();
  });

  /**
   * Both statuses that landed on `main` needing a later edit: 16 as `in review`, 4 as a bare
   * `in progress`. The second is why the rule cannot key on the word `in review` alone.
   */
  it.each([
    ["in review", "retired"],
    ["in review — #97", "retired"],
    ["in progress", "what is outstanding"],
    ["superseded", "what superseded it"],
    ["under review", "unknown state"],
  ])("rejects %j, saying %j", (status, because) => {
    expect(checkStatus(status)).toContain(because);
  });

  /**
   * A `#NN` has to be a reference rather than any `#` followed by a digit, or a link's own fragment
   * satisfies the one thing an unfinished plan is being asked to state.
   */
  it.each([
    ["in progress — see https://example.com/docs#1", "names no issue or PR"],
    ["in progress — [the thread](https://github.com/o/r/pull/1#issuecomment-2)", "names no issue"],
  ])("does not accept %j as naming one", (status, because) => {
    expect(checkStatus(status)).toContain(because);
  });

  // Every reference in this repo's plans is a markdown link, so the boundary has to admit `[`.
  it("accepts the mvp plan's own form", () => {
    expect(
      checkStatus("in progress — W1–W9 shipped ([#1](https://github.com/o/r/issues/1) closed)"),
    ).toBeNull();
  });

  it("says what to write instead, so the fix does not need this file", () => {
    expect(checkStatus("in review")).toContain("done — shipped in #NN");
  });

  it.each([
    ["# A plan\n\nNo header here.\n", "no header at all"],
    // The regex backtracks to let `(.+)` claim a space, so this matches and yields "". Reporting
    // it as an unknown state would print an empty pair of backticks and read as a bug.
    ["# A plan\n\n**Status:**   \n", "a header with nothing after it"],
    ["# A plan\r\n\r\n**Status:**\r\n", "a header with only a carriage return"],
  ])("rejects %j — %s", (markdown) => {
    expect(checkStatus(readStatus(markdown))).toContain("no `**Status:**`");
  });
});

describe("reading the header out of a plan", () => {
  const header = (markdown) => readStatus(markdown);

  it("takes the document's own claim, not a later mention of one", () => {
    expect(
      header(
        "# A plan\n\n**Status:** done — shipped in #1\n**Issue:** #2\n\n" +
          "## Why\n\n**Status:** in review was the old vocabulary.\n",
      ),
    ).toBe("done — shipped in #1");
  });

  it("ignores a status that is discussed rather than declared", () => {
    expect(header("A plan whose **Status:** is not at the start of a line.\n")).toBeNull();
  });
});

describe("a plan's filename", () => {
  const status = "**Status:** done\n";

  it.each([
    ["2026-08-21-plan-status-guard.md", true],
    ["2026-08-15-mvp-clock-face.md", true],
    ["plan-status-guard.md", false],
    ["2026-8-21-short-date.md", false],
    ["2026-08-21-Capitals.md", false],
  ])("%s is dated: %s", (name, dated) => {
    expect(checkPlan({ name, markdown: status })).toHaveLength(dated ? 0 : 1);
  });
});

/**
 * The guard itself. Everything above is the rule; this is the rule pointed at the repo, and it is
 * what fails in the PR that writes a header which cannot survive its own merge.
 *
 * `readPlans` resolves against this file rather than the working directory, so it holds wherever
 * vitest is invoked from.
 */
describe("every plan in docs/plans", () => {
  it("carries a status that is still true after its own PR merged", async () => {
    const plans = await readPlans();

    // A guard over real files passes for free if the glob resolves to nothing. #111 tabulates ten
    // plans by name and the repo had 24 when this landed, so a single digit means the read broke.
    expect(plans.length).toBeGreaterThan(10);

    const stale = checkPlans(plans);
    const report = stale.map(({ name, problems }) => `${name} ${problems.join("; ")}`);

    expect(report).toEqual([]);
  });
});
