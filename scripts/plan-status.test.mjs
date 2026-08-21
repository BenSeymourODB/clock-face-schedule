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
});

describe("the status a plan may carry", () => {
  it.each([
    ["done", true],
    ["done — shipped in #109", true],
    ["in progress — W10 outstanding as [#10](https://github.com/o/r/issues/10)", true],
    ["in progress — blocked on #46", true],
  ])("accepts %j", (status) => {
    expect(checkStatus(status)).toBeNull();
  });

  /**
   * The twelve instances #111 counts, and the nine beside them. Both go stale on merge, for
   * different reasons, so both are named here rather than only the one the issue's title carries.
   */
  it.each([
    ["in review", "retired"],
    ["in review — #97", "retired"],
    ["in progress", "names no issue or PR"],
    ["under review", "unknown state"],
  ])("rejects %j, saying %j", (status, because) => {
    expect(checkStatus(status)).toContain(because);
  });

  it("says what to write instead, so the fix does not need this file", () => {
    expect(checkStatus("in review")).toContain("done — shipped in #NN");
  });

  it("rejects a plan with no status header at all", () => {
    expect(checkStatus(readStatus("# A plan\n\nNo header here.\n"))).toContain("no `**Status:**`");
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
