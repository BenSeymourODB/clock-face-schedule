/**
 * `?raw` hands a file's text to a spec as a string.
 *
 * Used so `index-template.test.ts` can assert on `static/Index.html` — which is `doGet`'s template
 * and therefore this project's, but is not TypeScript and has no other way in. Reading it with
 * `node:fs` would need `@types/node` in this tsconfig's `types`, which is deliberately just
 * `google-apps-script` so that a server module reaching for a node API fails to compile.
 */
declare module "*?raw" {
  const content: string;
  export default content;
}
