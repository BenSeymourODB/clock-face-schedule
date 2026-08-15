/**
 * Guards the boundary the whole port depends on: nothing under src/shared/ may reach for a DOM
 * or an Apps Script global. If this project is ever pointed at a jsdom environment, geometry
 * code can start using `document` and the failure only surfaces once it is bundled into .gs.
 *
 * The tsconfig split enforces the same rule at compile time — shared/ is compiled under both
 * tsconfig.server.json (no DOM lib) and tsconfig.client.json (no Apps Script types), so a
 * reference to either fails one of them. This is the runtime half of that pair.
 */
import { describe, expect, it } from "vitest";

const globals = globalThis as { document?: unknown; CalendarApp?: unknown };

describe("shared module environment", () => {
  it("runs without a DOM", () => {
    expect(globals.document).toBeUndefined();
  });

  it("runs without the Apps Script runtime", () => {
    expect(globals.CalendarApp).toBeUndefined();
  });
});
