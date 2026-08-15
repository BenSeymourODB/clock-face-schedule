import { defineConfig } from "vitest/config";

/**
 * Two projects, matching the tsconfig split. `src/shared/` must run under node — nothing there
 * may reach for a DOM or an Apps Script global, which is what keeps the geometry layer portable.
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
    ],
  },
});
