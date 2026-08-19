/**
 * Apps Script entry points.
 *
 * Every export here is re-declared as a top-level function by the build footer — Apps Script
 * resolves entry points by a static scan of top-level declarations, and an IIFE bundle declares
 * nothing. The footer is generated from the bundle's own export list, so adding an export here
 * is all that is required. See ADR 0002 and scripts/build.mjs.
 */

import { preferencesWire } from "./preferences";

export { getEvents } from "./calendar";
export { savePreferences } from "./preferences";

/**
 * Bring-up switches, all off by default because the display itself must carry no chrome.
 *
 * `?check=1` adds the diagnostics — colour emoji, the bridge round trip, and a calendar read.
 * `?demo=1` draws a fixture schedule instead of the calendar, so arc legibility can be judged at
 * distance without waiting for the viewer's own day to contain a useful overlap. `?now=` pins the
 * dial's clock and `?freeze=1` stops it, so a state that depends on the time — an elapsed arc, a
 * draining one, a window edge — can be looked at on purpose rather than waited for. Each labels
 * itself on screen so a display left in one cannot be mistaken for a real one.
 *
 * All of them need to be checkable on the device rather than on a workstation, which is why they
 * are URL parameters and not a build flag.
 *
 * `now` is passed through **as authored**: the browser is authoritative for time (ADR 0005) and the
 * server has no business deciding what "04:15" means. Templated with `<?= ?>` rather than
 * `<?!= ?>`, since it arrives from the URL.
 *
 * The viewer's stored preferences ride along in the same template (#31). Reading them here costs
 * nothing — `doGet` is already running server-side — where fetching them over `google.script.run`
 * would cost the 0.5–2 s of ADR 0006 and a second render once they arrived.
 */
export function doGet(event?: GoogleAppsScript.Events.DoGet): GoogleAppsScript.HTML.HtmlOutput {
  const template = HtmlService.createTemplateFromFile("Index");
  template["showDiagnostics"] = event?.parameter?.["check"] === "1";
  template["showDemo"] = event?.parameter?.["demo"] === "1";
  template["pinnedNow"] = event?.parameter?.["now"] ?? "";
  template["freezeClock"] = event?.parameter?.["freeze"] === "1" ? "1" : "";
  template["preferences"] = preferencesWire();

  return template
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
