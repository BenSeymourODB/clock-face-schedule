import { describe, expect, it } from "vitest";

import { readPlans } from "./check-plans.mjs";
import {
  checkPlan,
  checkPlans,
  checkStatus,
  readHeader,
  readState,
  readStatus,
} from "./plan-status.mjs";

/** The three headers every plan owes, as a plan's own head would write them. */
const headers = ({ status = "done — shipped in #1", issue = "#2", docs = "ADR 0003" } = {}) =>
  `# A plan\n\n**Status:** ${status}\n**Issue:** ${issue}\n**Docs:** ${docs}\n`;

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

  // The same, for the header that is absent rather than wrong — the one report line that used to
  // name the cost and stop there, while the two headers beside it said what to write.
  it("says what to write when the header is missing entirely", () => {
    expect(checkStatus(null)).toContain("done — shipped in #NN");
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
  const markdown = headers({ status: "done" });

  it.each([
    ["2026-08-21-plan-status-guard.md", true],
    ["2026-08-15-mvp-clock-face.md", true],
    ["plan-status-guard.md", false],
    ["2026-8-21-short-date.md", false],
    ["2026-08-21-Capitals.md", false],
  ])("%s is dated: %s", (name, dated) => {
    expect(checkPlan({ name, markdown })).toHaveLength(dated ? 0 : 1);
  });
});

/**
 * `implement-issue` step 4 has asked for all three headers since before the status guard existed, and
 * #124 checked one of them. 40 of the repo's 41 plans carried the other two anyway — which says the
 * convention was followed by hand, not that the 42nd will be (#111's argument, applied to a header
 * that is absent rather than stale).
 */
describe("the other two headers a plan owes", () => {
  const name = "2026-08-21-a-plan.md";

  it.each([
    ["**Issue:**", headers().replace(/^\*\*Issue:.*\n/m, ""), "which issue it implements"],
    ["**Docs:**", headers().replace(/^\*\*Docs:.*\n/m, ""), "read first"],
  ])("reports a missing %s, saying %j", (header, markdown, because) => {
    const problems = checkPlan({ name, markdown });

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(header);
    expect(problems[0]).toContain(because);
  });

  // Both, not the first: a run of `npm run check-plans` should be enough to fix a plan in one pass.
  it("reports both when a plan carries only its status", () => {
    const problems = checkPlan({ name, markdown: "# A plan\n\n**Status:** done\n" });

    expect(problems).toHaveLength(2);
    expect(problems.join(" ")).toContain("**Issue:**");
    expect(problems.join(" ")).toContain("**Docs:**");
  });

  it("says what to write, so the fix does not need this file", () => {
    const problems = checkPlan({ name, markdown: "# A plan\n\n**Status:** done\n" });

    expect(problems[0]).toContain("**Issue:** #NN");
  });

  /**
   * The case that decides the rule is presence rather than a reference:
   * `2026-08-21-soft-halo-edge.md` is a real plan for work nobody filed an issue for, and saying so
   * is what the header is for. Requiring a `#NN` here would fail a correct plan.
   *
   * Asserted against that file rather than a synthetic one, because a synthetic "accepts" case
   * cannot fail — there is no reference rule for it to violate, so it passed against the code from
   * before this rule existed. Read from disk, it fails the day someone tightens the rule.
   */
  it("accepts the stated absence the repo actually contains", async () => {
    const plans = await readPlans();
    const stated = plans.find((plan) => plan.name === "2026-08-21-soft-halo-edge.md");

    expect(stated).toBeDefined();
    expect(readHeader(stated.markdown, "Issue")).toMatch(/^none\b/);
    expect(checkPlan(stated)).toEqual([]);
  });

  it.each([
    ["**Issue:**", "**Status:** done\n**Issue:**   \n**Docs:** x\n"],
    ["**Docs:**", "**Status:** done\n**Issue:** #2\n**Docs:**\n"],
  ])("counts %s with nothing after it as absent", (header, markdown) => {
    expect(checkPlan({ name, markdown })[0]).toContain(header);
  });

  /**
   * The whole rule, defeated: a plan whose subject *is* these headers quotes the block it is about,
   * and a line-anchored pattern reads the example as the claim. All three headers would be satisfied
   * by a document carrying none.
   */
  it("does not let a plan satisfy the rule by quoting the headers in a fence", () => {
    const markdown = `# The header rule\n\nEvery plan head must read:\n\n\`\`\`md\n${headers()
      .split("\n")
      .slice(2)
      .join("\n")}\`\`\`\n`;

    expect(checkPlan({ name, markdown })).toHaveLength(3);
  });
});

describe("reading a named header", () => {
  it.each([
    ["Status", "done — shipped in #1"],
    ["Issue", "#2"],
    ["Docs", "ADR 0003"],
  ])("reads %s as %j", (name, value) => {
    expect(readHeader(headers(), name)).toBe(value);
  });

  it("ignores a header discussed rather than declared", () => {
    expect(readHeader("A plan whose **Issue:** is named in prose.\n", "Issue")).toBeNull();
  });

  /**
   * The form a real plan takes when it discusses the headers: quoted in a fence, at a line start,
   * where `^` alone cannot tell it from a claim. A plan whose *subject* is this rule is the likeliest
   * document to carry one, and it is the one that could then ship with no headers of its own — so
   * this is checked on the shapes a plan actually uses, not just mid-sentence prose.
   */
  it.each([
    ["a fenced example", "```md\n**Issue:** #5\n```\n"],
    ["a fence with no language", "```\n**Issue:** #5\n```\n"],
    ["a tilde fence", "~~~\n**Issue:** #5\n~~~\n"],
    ["an indented fence", "  ```\n  **Issue:** #5\n  ```\n"],
    ["an html comment", "<!--\n**Issue:** #5\n-->\n"],
    ["an unterminated fence", "```md\n**Issue:** #5\n"],
    ["a blockquote", "> **Issue:** #5\n"],
  ])("does not read %s as the document's own header", (_shape, markdown) => {
    expect(readHeader(markdown, "Issue")).toBeNull();
  });

  it("still reads a real header above a fenced example of one", () => {
    const markdown = `${headers()}\n## The rule\n\n\`\`\`md\n**Issue:** #999\n\`\`\`\n`;

    expect(readHeader(markdown, "Issue")).toBe("#2");
  });

  // A ``` inside a ~~~ block is content, not a close, or the rest of the document falls out.
  it("keeps a nested fence inside its own block", () => {
    const markdown = "~~~\n```\n~~~\n\n**Issue:** #7\n";

    expect(readHeader(markdown, "Issue")).toBe("#7");
  });

  it("throws on a header it does not know, rather than matching nothing", () => {
    expect(() => readHeader(headers(), "I.sue")).toThrow(/Unknown plan header/);
  });

  // `**Docs:**` values run over several lines in this repo; a presence rule needs only the first.
  it("takes the first line of a value that runs on", () => {
    expect(readHeader("**Docs:** ADR 0009 (the scale),\n#98 (cards over content)\n", "Docs")).toBe(
      "ADR 0009 (the scale),",
    );
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
  it("carries all three headers, and a status still true after its own PR merged", async () => {
    const plans = await readPlans();

    // A guard over real files passes for free if the glob resolves to nothing. #111 tabulates ten
    // plans by name and the repo had 24 when this landed, so a single digit means the read broke.
    expect(plans.length).toBeGreaterThan(10);

    const stale = checkPlans(plans);
    const report = stale.map(({ name, problems }) => `${name} ${problems.join("; ")}`);

    expect(report).toEqual([]);
  });
});
