/**
 * Apps Script entry points.
 *
 * Every export here is re-declared as a top-level function by the build footer — Apps Script
 * resolves entry points by a static scan of top-level declarations, and an IIFE bundle declares
 * nothing. The footer is generated from the bundle's own export list, so adding an export here
 * is all that is required. See ADR 0002 and scripts/build.mjs.
 */

import { deploymentPreferencesWire, preferencesWire } from "./preferences";

export { getEvents } from "./calendar";
export { resetPreferences, savePreferences } from "./preferences";

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
 * are URL parameters and not a build flag. `?scale=1h` selects the 1-hour dial (#34) the same way,
 * and `?durations=0` turns off every duration on the display (#178) — the one parameter here that
 * overrides a *stored* preference, which is what makes a teacher's setting checkable on the wall it
 * runs on rather than only on a workstation.
 *
 * `?panel=0` leaves the agenda column off (#185), which is the one board nobody could put on screen:
 * ADR 0009's narrow-display fallback is undesigned, #178's duration wording was chosen because it
 * survives a panel-less board, and every board a browser can be pointed at draws a column. Tooling
 * rather than a setting — it stores nothing and announces nothing, and `panelAllowed` records why `1`
 * is not a force-on.
 *
 * `now`, `scale`, `durations` and `panel` are all passed through **as authored**: the browser is
 * authoritative for time (ADR 0005) and the client owns the geometry (ADR 0003), so the server
 * decides neither what "04:15" means nor what "1h" means. Templated with `<?= ?>` rather than
 * `<?!= ?>`, since they arrive from the URL. Leaving `scale` unparsed here also keeps the geometry
 * layer's emoji tables out of the server bundle, which is the trap `shared/clock/index.ts` records;
 * `durations` is left to the client so the URL form and the stored form share one parser and cannot
 * drift. `panel` is left to the client because the answer is not the parameter: whether a column is
 * drawn is `panelFitsBoard` over a box only the browser has measured, and this parameter is one term
 * of that — deciding it here would put a layout answer server-side, which ADR 0003 forbids.
 *
 * The viewer's stored preferences ride along in the same template (#31). Reading them here costs
 * nothing — `doGet` is already running server-side — where fetching them over `google.script.run`
 * would cost the 0.5–2 s of ADR 0006 and a second render once they arrived.
 *
 * The deployment's own set rides along beside it, for the same price and the same reason (#157). It
 * is what remains when the viewer's own store is taken away, so it is the layer a reset lands on —
 * and the resolved wire alone cannot say which layer any value came from, which is why a reset used
 * to have to wait for the server to tell it.
 */
export function doGet(event?: GoogleAppsScript.Events.DoGet): GoogleAppsScript.HTML.HtmlOutput {
  const template = HtmlService.createTemplateFromFile("Index");
  template["showDiagnostics"] = event?.parameter?.["check"] === "1";
  template["showDemo"] = event?.parameter?.["demo"] === "1";
  template["pinnedNow"] = event?.parameter?.["now"] ?? "";
  template["freezeClock"] = event?.parameter?.["freeze"] === "1" ? "1" : "";
  template["scaleParam"] = event?.parameter?.["scale"] ?? "";
  template["durationsParam"] = event?.parameter?.["durations"] ?? "";
  template["panelParam"] = event?.parameter?.["panel"] ?? "";
  template["preferences"] = preferencesWire();
  template["deploymentPreferences"] = deploymentPreferencesWire();

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
