/**
 * The browser half of the Apps Script bridge.
 *
 * @types/google-apps-script covers the server API only; the client-side `google.script.run`
 * object is not part of it, so it is declared here.
 */
declare namespace google.script {
  interface Runner {
    withSuccessHandler(callback: (value: unknown) => void): Runner;
    withFailureHandler(callback: (error: Error) => void): Runner;
    /** Server entry points are resolved by name at call time, not statically. */
    [functionName: string]: unknown;
  }

  const run: Runner;
}
