/**
 * Apps Script entry points.
 *
 * Anything callable from outside the bundle — doGet, template helpers, google.script.run
 * targets — must also be listed in SERVER_ENTRY_POINTS in scripts/build.mjs, which re-declares
 * it at top level. An IIFE bundle otherwise hides every export from the runtime.
 */

export function doGet(): GoogleAppsScript.HTML.HtmlOutput {
  return HtmlService.createTemplateFromFile("Index")
    .evaluate()
    .setTitle("Clock face schedule")
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
}

/**
 * Inlines another .html file into a template — the only way to get CSS or JS onto the page,
 * since HtmlService cannot serve a .css or .js file. Called from Index.html.
 */
export function include(filename: string): string {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/** Reachable because the build footer declares it at top level. Half of the ADR 0002 probe. */
export function probeDeclared(): string {
  return "reachable";
}

/**
 * The other half: assigned onto the global object from inside the IIFE, with no footer entry.
 *
 * If google.script.run resolves this one too, the footer is unnecessary machinery. If it does
 * not, the footer is load-bearing and every future entry point has to be registered in it —
 * which is a standing trap worth knowing about now rather than discovering in #8.
 */
(globalThis as unknown as Record<string, unknown>)["probeAssigned"] =
  function probeAssigned(): string {
    return "reachable";
  };
