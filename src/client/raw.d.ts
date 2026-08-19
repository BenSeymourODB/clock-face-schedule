/**
 * Vite's `?raw` suffix, which vitest resolves for a test that needs a repo file as a string.
 *
 * Declared rather than reached for through `node:fs`, because `tsconfig.client.json` carries no
 * node types on purpose — that omission is half of what keeps client code honest about where it
 * runs, and a test is not a reason to relax it.
 */
declare module "*?raw" {
  const content: string;
  export default content;
}
