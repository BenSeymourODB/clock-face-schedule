import { defineConfig } from "vitest/config";

/**
 * Two projects mirror the tsconfig split. `src/shared/` must run under node — nothing there
 * may reach for a DOM or an Apps Script global, which is what keeps the geometry layer portable.
 *
 * The third covers `scripts/`, this repo's tooling, which is untyped `.mjs` outside both tsconfigs
 * on purpose. Its includes are kept disjoint from the other two so the split stays the enforcement
 * mechanism ADR 0003 relies on.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "node",
          environment: "node",
          include: ["src/{shared,server}/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "client",
          environment: "jsdom",
          include: ["src/client/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "tools",
          environment: "node",
          include: ["scripts/**/*.test.mjs"],
        },
      },
    ],
  },
});
