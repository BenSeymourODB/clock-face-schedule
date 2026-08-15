import { context } from "esbuild";
import { cp, readFile, rm, writeFile } from "node:fs/promises";

const OUT = "build";
const watch = process.argv.includes("--watch");

/**
 * Apps Script has no module system — every .gs file shares one global scope, and the runtime
 * resolves entry points (doGet, google.script.run targets, template helpers) by name in it.
 * An IIFE bundle hides them, so each is re-declared at top level delegating into the bundle.
 *
 * Add a name here whenever a new function must be reachable from outside the bundle.
 */
const SERVER_ENTRY_POINTS = ["doGet", "include", "probeDeclared"];

const serverFooter = SERVER_ENTRY_POINTS.map(
  (name) =>
    `function ${name}() { return __server.${name}.apply(null, arguments); }`
).join("\n");

const shared = {
  bundle: true,
  format: "iife",
  target: "es2019",
  legalComments: "none",
  logLevel: "info",
};

const serverOptions = {
  ...shared,
  entryPoints: ["src/server/main.ts"],
  outfile: `${OUT}/Code.gs`,
  globalName: "__server",
  footer: { js: serverFooter },
};

const clientOptions = {
  ...shared,
  entryPoints: ["src/client/main.ts"],
  outfile: `${OUT}/Client.js`,
};

/**
 * HtmlService serves scripts only from .html files — there is no way to serve a .js file on an
 * origin we control — so the client bundle is wrapped in a <script> tag and inlined by
 * Index.html via `include('Client')`.
 */
async function wrapClientBundle() {
  const js = await readFile(`${OUT}/Client.js`, "utf8");
  // A literal </script> inside a string or comment would close the tag early.
  const safe = js.replaceAll("</script>", "<\\/script>");
  await writeFile(`${OUT}/Client.html`, `<script>\n${safe}\n</script>\n`, "utf8");
  await rm(`${OUT}/Client.js`);
}

async function buildAll() {
  await rm(OUT, { recursive: true, force: true });
  const contexts = await Promise.all([
    context(serverOptions),
    context(clientOptions),
  ]);
  await Promise.all(contexts.map((ctx) => ctx.rebuild()));
  await wrapClientBundle();
  await cp("static", OUT, { recursive: true });
  return contexts;
}

const contexts = await buildAll();

if (watch) {
  // esbuild's own watch does not know about the wrap and copy steps, so rebuild wholesale.
  const { watch: watchFs } = await import("node:fs");
  await Promise.all(contexts.map((ctx) => ctx.dispose()));
  let pending;
  for (const dir of ["src", "static"]) {
    watchFs(dir, { recursive: true }, () => {
      clearTimeout(pending);
      pending = setTimeout(() => {
        buildAll()
          .then((ctxs) => Promise.all(ctxs.map((c) => c.dispose())))
          .catch((error) => console.error(error));
      }, 50);
    });
  }
  console.log("watching src/ and static/ …");
} else {
  await Promise.all(contexts.map((ctx) => ctx.dispose()));
}
