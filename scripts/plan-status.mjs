/**
 * The `**Status:**` header a plan document in `docs/plans/` carries, and the rule that keeps it
 * true after the PR carrying it merges.
 *
 * A plan's status is the only thing that says whether the document describes what shipped or what
 * was proposed, and these documents are written to be picked up cold. It went stale on 21 of the
 * repo's first 24 plans (#111) — not through carelessness, but because `in review` means "a PR is
 * open" and the merge that ends the review is the one edit a PR cannot make to itself. The remedy
 * is a vocabulary with no state whose truth expires, rather than a check that notices afterwards.
 */

/** Plans are dated so the retire pass can see at a glance which are old enough to have shipped. */
const PLAN_FILENAME = /^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;

/**
 * First line only. A plan body may well quote a status — this one does — and the header is the
 * document's own claim about itself, which is the first one.
 */
const STATUS_HEADER = /^\*\*Status:\*\*[ \t]*(.+)$/m;

/** An issue or PR number, which is what makes an unfinished plan say *what* is unfinished. */
const REFERENCE = /#\d+/;

/**
 * Both survive their own merge. `done` is a statement about the past; `in progress` is a statement
 * about named outstanding work, and naming it is what lets this check stay offline — see
 * `checkStatus`.
 */
export const PLAN_STATES = ["done", "in progress"];

/** Emphasis and links carry no meaning here, and `**Status:** *done*` is the same claim as `done`. */
function normalise(status) {
  return status
    .replace(/[*`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** The header's value, verbatim, or `null` for a plan that carries no status header at all. */
export function readStatus(markdown) {
  const found = STATUS_HEADER.exec(markdown);
  return found ? found[1].trim() : null;
}

/**
 * The state a status opens with, or `null` if it opens with none of them. Longest first, so
 * `in progress` is not read as an unknown state that happens to start with `in`.
 */
export function readState(status) {
  const normalised = normalise(status);
  const ordered = PLAN_STATES.slice().sort((a, b) => b.length - a.length);

  // The boundary matters: `doneish` is not `done`, and silently accepting it would let a typo
  // through as the thing this whole module exists to catch.
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
    const known = PLAN_STATES.map((s) => `\`${s}\``).join(" or ");
    return (
      `opens with an unknown state — \`${status}\`. A plan's status must open with ${known}, ` +
      "both of which stay true through a merge. `in review` is retired: it means a PR is open, " +
      "and the merge that ends the review is the one edit that PR cannot make. Write " +
      "`done — shipped in #NN` in the shipping PR instead, once its number exists."
    );
  }

  // Whether an `in progress` plan is *still* in progress needs the issue's state, which needs the
  // network, which would make this guard skippable. Requiring the plan to name what is outstanding
  // turns the same question into something a parser can settle — and a plan that cannot name it
  // has already shipped.
  if (state === "in progress" && !REFERENCE.test(status)) {
    return (
      `is \`${status}\` but names no issue or PR, so nothing says what is outstanding. Either ` +
      "cite it (`in progress — … outstanding as #NN`) or, if the work shipped, write " +
      "`done — shipped in #NN`."
    );
  }

  return null;
}

/** Every problem with one plan: its name, then its status. */
export function checkPlan({ name, markdown }) {
  const problems = [];

  if (!PLAN_FILENAME.test(name)) {
    problems.push(`is not named \`YYYY-MM-DD-<slug>.md\`, so the retire pass cannot date it`);
  }

  const problem = checkStatus(readStatus(markdown));
  if (problem !== null) problems.push(problem);

  return problems;
}

/** Only the plans with something wrong, in the order given. */
export function checkPlans(plans) {
  return plans
    .map((plan) => ({ name: plan.name, problems: checkPlan(plan) }))
    .filter((result) => result.problems.length > 0);
}
