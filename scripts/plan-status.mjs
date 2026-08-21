/**
 * The `**Status:**` header a plan document in `docs/plans/` carries, and the rule that keeps it
 * true after the PR carrying it merges.
 *
 * A plan's status is the only thing that says whether the document describes what shipped or what
 * was proposed, and these documents are written to be picked up cold. 20 of the repo's first 24
 * plans landed carrying a status a later PR had to correct — not through carelessness, but because
 * `in review` means "a PR is open" and the merge that ends the review is the one edit a PR cannot
 * make to itself. The remedy is a vocabulary with no state whose truth expires, rather than a check
 * that notices afterwards.
 */

/** The date is how `docs/plans/` orders itself; a plan outside the pattern sorts nowhere. */
const PLAN_FILENAME = /^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;

/**
 * First match wins, not first line: the header sits under the title, and a plan discussing the
 * vocabulary further down is stating a rule rather than its own status.
 */
const STATUS_HEADER = /^\*\*Status:\*\*[ \t]*(.+)$/m;

/**
 * An issue or PR number, which is what makes an unfinished plan say *what* is unfinished. The
 * leading boundary keeps a URL's own fragment from standing in for one; `[` is in it because every
 * reference in this repo's plans is written as a markdown link, `[#10](…)`.
 */
const REFERENCE = /(?:^|[\s([])#\d+/;

/**
 * All three survive their own merge, which is the property being bought. `done` is a statement
 * about the past; the other two are statements about named work — outstanding in one case,
 * abandoned in the other — and naming it is what lets this check stay offline, see `checkStatus`.
 *
 * `superseded` earns its place rather than anticipating a need: this project reverses decisions on
 * measurement (ADR 0009 retired #88's ellipse outright), and without it such a plan can only open
 * with `done`, which is exactly the false claim to a cold reader that the whole rule exists to stop.
 */
export const PLAN_STATES = ["done", "in progress", "superseded"];

/** `**Status:** *done*` is the same claim as `done`; only the opening word is read, so links pass. */
function normalise(status) {
  return status
    .replace(/[*`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** The header's value, trimmed, or `null` for a plan that carries no usable status header. */
export function readStatus(markdown) {
  const found = STATUS_HEADER.exec(markdown);
  const status = found ? found[1].trim() : "";

  // `[ \t]*` backtracks to let `(.+)` claim a space, so a header followed by whitespace alone
  // matches and yields "". That is the no-status case, not an unknown state.
  return status === "" ? null : status;
}

/**
 * The state a status opens with, or `null` if it opens with none of them. Longest first, so
 * `in progress` is not read as an unknown state that happens to start with `in`.
 */
export function readState(status) {
  if (typeof status !== "string") return null;

  const normalised = normalise(status);
  const ordered = PLAN_STATES.slice().sort((a, b) => b.length - a.length);

  // A following letter would make it a different word: `doneish` is not `done`. Anything else may
  // follow, because the useful forms are `done — shipped in #NN` and `superseded by #NN`.
  return ordered.find((state) => new RegExp(`^${state}(?![a-z])`).test(normalised)) ?? null;
}

/**
 * A problem with one status, or `null`. Prose rather than a code, because the fix is a one-line
 * edit and the reader needs to know which line and what to put on it.
 */
export function checkStatus(status) {
  if (status === null) {
    return (
      "carries no `**Status:**` header, so nothing says whether it describes what shipped or " +
      "what was proposed"
    );
  }

  const state = readState(status);

  if (state === null) {
    const known = PLAN_STATES.map((s) => `\`${s}\``).join(", ");
    return (
      `opens with an unknown state — \`${status}\`. A plan's status must open with one of ` +
      `${known}, each of which stays true through a merge. \`in review\` is retired: it means a ` +
      "PR is open, and the merge that ends the review is the one edit that PR cannot make. Write " +
      "`done — shipped in #NN` in the shipping PR instead, once its number exists."
    );
  }

  // Whether an `in progress` plan is *still* in progress, or a `superseded` one really was, needs
  // the issue's state — hence the network, hence a skippable guard. Requiring the plan to name the
  // work instead settles the checkable half in a parser and leaves the rest to the reader, who has
  // the link. See #125.
  if (state !== "done" && !REFERENCE.test(status)) {
    const missing =
      state === "in progress" ? "what is outstanding" : "what superseded it";

    return (
      `is \`${status}\` but names no issue or PR, so nothing says ${missing}. Cite it ` +
      "(`in progress — … outstanding as #NN`, `superseded by #NN`) or, if the work shipped, " +
      "write `done — shipped in #NN`."
    );
  }

  return null;
}

export function checkPlan({ name, markdown }) {
  const problems = [];

  if (!PLAN_FILENAME.test(name)) {
    problems.push("is not named `YYYY-MM-DD-<slug>.md`, so it sorts nowhere in `docs/plans/`");
  }

  const problem = checkStatus(readStatus(markdown));
  if (problem !== null) problems.push(problem);

  return problems;
}


export function checkPlans(plans) {
  return plans
    .map((plan) => ({ name: plan.name, problems: checkPlan(plan) }))
    .filter((result) => result.problems.length > 0);
}
