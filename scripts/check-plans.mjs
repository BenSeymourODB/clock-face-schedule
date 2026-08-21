import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

import { checkPlans } from "./plan-status.mjs";

export const PLANS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "docs", "plans");

/** Sorted, which the filename rule makes date order, so a report reads oldest-first. */
export async function readPlans(dir = PLANS_DIR) {
  const names = (await readdir(dir)).filter((name) => name.endsWith(".md")).sort();

  return Promise.all(
    names.map(async (name) => ({ name, markdown: await readFile(join(dir, name), "utf8") })),
  );
}

async function main() {
  const plans = await readPlans();

  if (plans.length === 0) {
    console.error(`No plan documents found in ${PLANS_DIR}`);
    process.exitCode = 1;
    return;
  }

  const stale = checkPlans(plans);

  for (const { name, problems } of stale) {
    for (const problem of problems) console.error(`docs/plans/${name} ${problem}`);
  }

  // The verdict goes to stdout so it can be captured; the problems stay on stderr with it.
  const verdict =
    stale.length === 0
      ? `${plans.length} plans checked, all three headers present and every status still true ` +
        "after its merge."
      : `${stale.length} of ${plans.length} plans need a header edit.`;

  if (stale.length === 0) console.log(verdict);
  else console.error(verdict);

  process.exitCode = stale.length === 0 ? 0 : 1;
}

// Importable by the spec without running the report.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
