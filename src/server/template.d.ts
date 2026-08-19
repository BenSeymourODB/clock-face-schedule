/**
 * Vite (and so vitest) serves any import suffixed `?raw` as the file's text.
 *
 * Declared here rather than reaching for `node:fs`, because neither tsconfig admits node types —
 * the server config has only `google-apps-script`, and that narrowness is the enforcement
 * mechanism for ADR 0003 rather than an oversight to widen.
 */
declare module "*?raw" {
  const contents: string;
  export default contents;
}
