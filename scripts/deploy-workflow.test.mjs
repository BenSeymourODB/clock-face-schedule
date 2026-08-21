import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * Every property asserted here is one whose violation is **silent** — the workflow goes green, or
 * fails with a message that names the wrong cause. None of them are style. They were measured
 * against clasp 3.4.0 while writing ADR 0010, and each comment below names the failure it prevents
 * rather than the rule it enforces.
 *
 * A YAML parser is deliberately not used. There is no yaml dependency in this repo, and every
 * property here is a property of the text that gets executed.
 */
const workflow = readFileSync(new URL("../.github/workflows/deploy.yml", import.meta.url), "utf8");

/**
 * Comments are excluded from every assertion below, and the first draft of this file is why: the
 * workflow's comments name the hazards they exist to warn about — "no `-V`", "`clasp deploy -i ""`
 * would create" — so three assertions matched the warning rather than a violation. A rule that
 * cannot tell an executed line from prose about that line would force the comments to be silent
 * about exactly what a later reader most needs told.
 */
const lines = workflow.split(/\r?\n/).filter((line) => !/^\s*#/.test(line));
const executable = lines.join("\n");

describe("the deploy workflow's clasp invocation", () => {
  /**
   * `clasp deploy -i "$ID"` and `clasp redeploy "$ID"` call the identical function, with one
   * difference that matters: `deploy` treats a falsy deployment ID as "create a new deployment",
   * while `redeploy` refuses it. So an unset CLASP_DEPLOYMENT_ID makes the first quietly publish a
   * second, unlisted web app URL, and the second fail loudly. Only one of those is recoverable.
   */
  it("redeploys an existing slot rather than creating a deployment", () => {
    expect(executable).toMatch(/npx clasp redeploy "\$DEPLOYMENT_ID"/);
    expect(executable).not.toMatch(/clasp (create-)?deploy\b/);
    expect(executable).not.toMatch(/--deploymentId|-i\s+"?\$/);
  });

  /**
   * Omitting the version is what makes this continuous deployment: clasp then creates an immutable
   * version from whatever `push` just uploaded and repoints the slot at it. Passing `-V` would pin
   * the slot to one fixed version, so `main` would build, push, and change nothing anyone can see.
   */
  it("does not pin the slot to a fixed version", () => {
    expect(executable).not.toMatch(/-V\b|--versionNumber/);
  });

  /**
   * clasp writes `deploymentConfig.description` on every redeploy, defaulting it to `''`. A
   * redeploy without `-d` therefore does not leave the old description alone — it blanks it, and
   * the slot loses the only human-readable label distinguishing it in `clasp deployments`.
   */
  it("always writes a description, so the slot keeps its name", () => {
    expect(executable).toMatch(/npx clasp redeploy "\$DEPLOYMENT_ID"[\s\S]{0,120}?-d "/);
  });

  /**
   * Without `--force`, a remote manifest that has drifted (the Apps Script UI writes back to
   * appsscript.json) makes clasp prompt; with no TTY it auto-declines, prints "Skipping push." and
   * exits 0. The deploy would then redeploy the *previous* content and report success. ADR 0002.
   */
  it("pushes with --force", () => {
    expect(executable).toMatch(/npx clasp push --force/);
  });

  /**
   * clasp resolves its auth file to ~/.clasprc.json and has no fallback to a local one, so a
   * `.clasprc.json` written into the workspace is invisible unless `clasp_config_auth` or `-A`
   * points at it — the failure is "No credentials found.", which reads like a missing secret.
   * It must name the *file*: given a directory, clasp fails with EISDIR.
   */
  it("tells clasp where the credentials are", () => {
    expect(executable).toMatch(/clasp_config_auth: \.clasprc\.json/);
  });
});

describe("the deploy workflow's safety rails", () => {
  /**
   * `redeploy` is two API calls — create a version, then repoint the slot. A run cancelled between
   * them leaves the slot on its old version with an orphan version above it, which looks exactly
   * like a deploy that did not happen. Queueing is the correct behaviour here, and it is the
   * opposite of ci.yml's, so it is worth an assertion that a copy-paste cannot quietly undo.
   */
  it("queues deploys instead of cancelling them mid-flight", () => {
    expect(executable).toMatch(/cancel-in-progress: false/);
    expect(executable).not.toMatch(/cancel-in-progress: true/);
  });

  /**
   * Interpolating `${{ secrets.X }}` or `${{ vars.X }}` straight into a `run:` body substitutes the
   * value before bash parses the script, so a value containing a quote changes what executes.
   * Passing them through `env:` and referencing "$NAME" leaves them as data. Asserting that every
   * such interpolation is an env assignment is a cheap way to keep that true.
   */
  it("passes secrets and variables through env, never into a shell body", () => {
    const interpolations = lines.filter((line) => /\$\{\{\s*(secrets|vars)\./.test(line));

    expect(interpolations.length).toBeGreaterThan(0);
    for (const line of interpolations) {
      expect(line.trim()).toMatch(/^[A-Za-z_][A-Za-z0-9_]*: \$\{\{ (secrets|vars)\.[A-Za-z0-9_]+ \}\}$/);
    }
  });

  /**
   * An unquoted `$DEPLOYMENT_ID` that expanded to nothing would turn `redeploy` into a call with no
   * argument. commander then reports a missing argument rather than a missing variable, which sends
   * you looking at the workflow instead of at the environment.
   */
  it("quotes the deployment ID", () => {
    expect(executable).not.toMatch(/(^|[\s=])\$DEPLOYMENT_ID(\s|$)/m);
  });

  /**
   * Which slot a run targets is decided by one expression repeated four times — `concurrency`, the
   * job name, `environment.name` and `SLOT` — because Actions gives it nowhere to live once:
   * `env` is not a context the first three can read, and the format has no anchors.
   *
   * A disagreement between them is the worst failure this workflow can have and the least visible:
   * `environment.name` chooses whose reviewers gate the run *and* which `CLASP_DEPLOYMENT_ID` is in
   * scope, so an edit to three of the four could gate on staging while redeploying production's
   * slot, and report the wrong one in the summary. Byte-identity is the only cheap guarantee.
   */
  it("resolves the slot identically everywhere it is decided", () => {
    const expressions = executable.match(/\$\{\{[^}]*inputs\.slot[^}]*\}\}/g) ?? [];

    expect(new Set(expressions).size).toBe(1);
    expect(expressions).toHaveLength(4);
    expect(expressions[0]).toContain("github.event_name == 'release' && 'production'");
  });

  /**
   * A published release is the production trigger, so losing it is losing the promotion path. It
   * must be `published`: `released` never fires for a pre-release, and `prereleased` misses one
   * published from a draft — and this repo's releases are pre-releases, so either narrower type
   * would mean a production deploy that silently never runs.
   */
  it("treats a published release as the production trigger", () => {
    expect(executable).toMatch(/release:\s*\n\s*types: \[published\]/);
  });

  /**
   * A deployment ID can be valid and still belong to a different script project, since nothing says
   * two slots must share one. That pairing is only detectable by listing, and if it is discovered
   * *after* `clasp push` the project's content has already moved and an orphan version exists. The
   * check is therefore worthless unless it runs first, which is what this pins.
   */
  it("checks the slot exists before the push can mutate anything", () => {
    const listed = executable.indexOf("npx clasp deployments --json");
    const pushed = executable.indexOf("npx clasp push");

    expect(listed).toBeGreaterThan(-1);
    expect(listed).toBeLessThan(pushed);
  });

  /**
   * The gate is re-run here rather than inherited from ci.yml because a promotion dispatch can name
   * any ref — including a commit whose CI run predates a dependency change. Deploying is the one
   * job that must not take an earlier run's word for it.
   */
  it("runs the full quality gate before touching the remote project", () => {
    const gate = ["npm run build", "npm run check-types", "npm test"].map((step) =>
      executable.indexOf(step),
    );

    expect(gate.every((at) => at !== -1)).toBe(true);
    expect(gate).toStrictEqual([...gate].sort((a, b) => a - b));
    expect(Math.max(...gate)).toBeLessThan(executable.indexOf("npx clasp push"));
  });
});
