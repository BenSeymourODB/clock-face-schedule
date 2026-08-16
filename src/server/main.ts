/**
 * Apps Script entry points.
 *
 * Every export here is re-declared as a top-level function by the build footer — Apps Script
 * resolves entry points by a static scan of top-level declarations, and an IIFE bundle declares
 * nothing. The footer is generated from the bundle's own export list, so adding an export here
 * is all that is required. See ADR 0002 and scripts/build.mjs.
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

/**
 * Round-trip check for the google.script.run bridge, kept on the scaffold page so the same
 * diagnostic can be run from the display device rather than only from a workstation.
 *
 * Returns the offset-bearing ISO-8601 format ADR 0005 requires of every timestamp, which makes
 * this a live check that `XXX` is supported by Apps Script's date formatter before #3 depends
 * on it. The timezone is reported alongside so the page can show whether server and browser
 * agree — a silent disagreement draws arcs against a different 12-hour period than the hands.
 */
export function ping(): { serverTime: string; timeZone: string } {
  const timeZone = Session.getScriptTimeZone();
  return {
    serverTime: Utilities.formatDate(new Date(), timeZone, "yyyy-MM-dd'T'HH:mm:ssXXX"),
    timeZone,
  };
}
