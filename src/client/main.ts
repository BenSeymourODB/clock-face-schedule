/**
 * Scaffold check page (#1).
 *
 * Confirms the three things everything later depends on: the client bundle reaches the browser,
 * google.script.run resolves server entry points, and the display has a colour emoji font.
 * Replaced by the dial itself in #8.
 */

/** google.script.run is callback-based; everything downstream wants to await. */
function callServer<T>(name: string, ...args: unknown[]): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const runner = google.script.run
      .withSuccessHandler((value) => resolve(value as T))
      .withFailureHandler(reject);

    const fn = runner[name] as ((...args: unknown[]) => void) | undefined;
    if (typeof fn !== "function") {
      reject(new Error(`no server function named "${name}"`));
      return;
    }
    fn.apply(runner, args);
  });
}

async function probe(name: string): Promise<{ ok: boolean; detail: string }> {
  try {
    const value = await callServer<string>(name);
    return { ok: value === "reachable", detail: value };
  } catch (error) {
    return { ok: false, detail: `unreachable — ${(error as Error).message}` };
  }
}

async function renderProbes(): Promise<void> {
  const list = document.getElementById("probe-results");
  if (!list) return;
  list.textContent = "";

  for (const name of ["probeDeclared", "probeAssigned"]) {
    const { ok, detail } = await probe(name);

    const term = document.createElement("dt");
    term.textContent = name;

    const description = document.createElement("dd");
    description.textContent = detail;
    description.dataset["state"] = ok ? "ok" : "fail";

    list.append(term, description);
  }
}

void renderProbes();
