import { build } from "esbuild";
import { watch as watchFs } from "node:fs";
import { appendFile, cp, readFile, rm, writeFile } from "node:fs/promises";

const OUT = "build";

const shared = {
  bundle: true,
  format: "iife",
  target: "es2019",
  legalComments: "none",
};

/**
 * Apps Script resolves entry points among a script's top-level function declarations, and the
 * client-side `google.script.run` method list is generated from that same static scan — a
 * function merely assigned onto the global object at runtime is invisible to both. Verified on
 * the deployed scaffold; see ADR 0002. An IIFE bundle declares nothing at top level, so every
 * export has to be re-declared.
 *
 * Derived from the bundle's own export list rather than a hand-maintained array: omitting an
 * entry point produces a silent failure in the browser rather than a build error, which is
 * exactly the kind of trap that costs an afternoon.
 */
async function serverEntryPointNames() {
  // esbuild records an export list only for esm output, so harvest the names from a throwaway
  // in-memory pass rather than parsing our own source with a regex.
  const result = await build({
    entryPoints: ["src/server/main.ts"],
    bundle: true,
    format: "esm",
    write: false,
    metafile: true,
    logLevel: "silent",
  });

  const key = Object.keys(result.metafile.outputs)[0];
  const exported = result.metafile.outputs[key]?.exports ?? [];

  if (exported.length === 0) {
    throw new Error(
      "server bundle exports nothing — no function would be callable from Apps Script"
    );
  }
  return exported;
}

async function buildServer() {
  const [, exported] = await Promise.all([
    build({
      ...shared,
      entryPoints: ["src/server/main.ts"],
      outfile: `${OUT}/Code.gs`,
      globalName: "__server",
    }),
    serverEntryPointNames(),
  ]);

  const footer = exported
    .map((name) => `function ${name}() { return __server.${name}.apply(null, arguments); }`)
    .join("\n");

  await appendFile(`${OUT}/Code.gs`, `\n${footer}\n`, "utf8");
  return exported;
}

/**
 * HtmlService serves scripts only from .html files — there is no way to serve a .js file on an
 * origin we control — so the client bundle is wrapped in a <script> tag and inlined by
 * Index.html via `include('Client')`.
 */
async function buildClient() {
  await build({
    ...shared,
    entryPoints: ["src/client/main.ts"],
    outfile: `${OUT}/Client.js`,
  });

  const js = await readFile(`${OUT}/Client.js`, "utf8");
  // A literal </script> inside a string or comment would close the tag early.
  const safe = js.replaceAll("</script>", "<\\/script>");
  await writeFile(`${OUT}/Client.html`, `<script>\n${safe}\n</script>\n`, "utf8");
  await rm(`${OUT}/Client.js`);
}

async function buildAll() {
  await rm(OUT, { recursive: true, force: true });
  const [entryPoints] = await Promise.all([buildServer(), buildClient()]);
  await cp("static", OUT, { recursive: true });
  console.log(`built ${OUT}/ — entry points: ${entryPoints.join(", ")}`);
}

await buildAll();

if (process.argv.includes("--watch")) {
  let pending;
  for (const dir of ["src", "static"]) {
    watchFs(dir, { recursive: true }, () => {
      clearTimeout(pending);
      pending = setTimeout(() => {
        buildAll().catch((error) => console.error(error.message));
      }, 50);
    });
  }
  console.log("watching src/ and static/ …");
}
