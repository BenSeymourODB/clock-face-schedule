/**
 * **One parameter name, spelled the same in all three places that have to agree.**
 *
 * A URL parameter that overrides something reaches the client by two routes, and only one of them is
 * reachable from a spec or a preview:
 *
 * - `doGet` reads `event.parameter["<name>"]` and templates it as `<name>Param`;
 * - `Index.html` prints that into `data-<name>` on the mount;
 * - the client reads `mount.dataset["<name>"]`, then its **own** query string as the fallback.
 *
 * The second route is the whole of the preview and the whole of every spec, and the first is the whole
 * of the deployed app — because the page runs in an HtmlService sandbox iframe whose
 * `window.location.search` is not the URL the teacher typed. So a break in the *attribute* chain has
 * no symptom anywhere anyone looks: `build/preview.html?panel=0` goes on working, every screenshot in
 * a PR reproduces, and `/exec?panel=0` on the classroom board silently ignores the flag.
 *
 * Found in review of #185 by mutation: deleting the `mount.dataset["panel"]` layer from
 * `panelAllowed`'s call left all 1,944 tests green, and rendering the deployed-shaped page (the
 * attribute set, no query string) showed the column still drawn. `index-template.test.ts` checks the
 * template's own text and `panel-layout.test.ts` checks the parser in isolation; nothing joined the
 * two, and nothing covered `doGet` at all.
 *
 * Covers all three parameters that follow the `<name>Param` convention rather than only the one #185
 * added: `scale` and `durations` had the identical hole, the assertion is the same three lines, and
 * closing it for one of three while leaving its neighbours open would be the odd choice. `now` and
 * `freeze` are deliberately out of scope — they are templated under different names (`pinnedNow`,
 * `freezeClock`) and read through `clock-pin.ts`, which `clock-pin.test.ts` covers directly.
 *
 * Source text rather than behaviour, for `main-load-order.test.ts`'s reason: `doGet` needs
 * `HtmlService` and the client's reads are module-level, so neither has a seam. What this can check
 * is the one thing that actually breaks — the strings differing — and it is required-match throughout,
 * so a renamed function cannot leave it green and asserting nothing.
 */
import { describe, expect, it } from "vitest";

import TEMPLATE from "../../static/Index.html?raw";
import CLIENT from "../client/main.ts?raw";
import SERVER from "./main.ts?raw";

/** Each parameter, with the template variable `doGet` is expected to carry it in. */
const PARAMETERS: [name: string, templateVar: string][] = [
  ["scale", "scaleParam"],
  ["durations", "durationsParam"],
  ["panel", "panelParam"]
];

describe("a URL parameter's name, across the three files that must agree", () => {
  it.each(PARAMETERS)("doGet reads ?%s into %s", (name, templateVar) => {
    // The assignment and the key it reads, in one match, so a `panelParam` fed from `["pane"]`
    // fails here rather than on a board.
    expect(SERVER).toMatch(
      new RegExp(`template\\["${templateVar}"\\][^;]*?\\["${name}"\\]`)
    );
  });

  it.each(PARAMETERS)("Index.html prints %2$s into data-%1$s", (name, templateVar) => {
    expect(TEMPLATE).toContain(`data-${name}="<?= ${templateVar} ?>"`);
  });

  it.each(PARAMETERS)(
    "the client reads data-%1$s before its own ?%1$s, and reads both",
    (name) => {
      const attribute = CLIENT.search(new RegExp(`dataset\\["${name}"\\]`));
      const query = CLIENT.search(new RegExp(`\\.get\\("${name}"\\)`));

      // Both routes present. The attribute one is the deployed app's only route and the one no
      // preview exercises; the query one is the preview's only route.
      expect(attribute).toBeGreaterThanOrEqual(0);
      expect(query).toBeGreaterThanOrEqual(0);
      // The attribute wins, because on the deployed app the query string is the sandbox iframe's
      // rather than the teacher's. Read order is the resolution order for all three of these.
      expect(attribute).toBeLessThan(query);
    }
  );

  /**
   * The template variable is not shared between two parameters.
   *
   * The copy-paste this exists for is `data-panel="<?= durationsParam ?>"`, which is well-formed,
   * templates a real value, and makes the durations switch silently operate the agenda column. The
   * per-parameter assertions above would all pass on it if both parameters were checked only for
   * *containing* their own name somewhere.
   */
  it("gives each parameter its own template variable", () => {
    const used = PARAMETERS.map(([name]) => {
      const [, variable] = new RegExp(`data-${name}="<\\?=\\s*(\\w+)\\s*\\?>"`).exec(TEMPLATE) ?? [];
      return variable;
    });

    expect(used.filter(Boolean)).toHaveLength(PARAMETERS.length);
    expect(new Set(used).size).toBe(PARAMETERS.length);
  });
});
