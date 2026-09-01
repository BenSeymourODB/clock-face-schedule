/**
 * What happens between pressing the scale switch and the dial arriving at the other scale.
 *
 * Lives outside `main.ts` for the reason `withScaleParam` below does, and the reason
 * `fixture-refresh.ts` exists: the entry file reads `window.location` and mounts the page, so
 * nothing declared inside it can be given a spec. The one defect this module has had — a dial left
 * permanently invisible — was in exactly the code that could not be tested, and was found by a
 * reviewer driving the preview rather than by the suite.
 */
import type { DialScaleId } from "../shared/clock";

/**
 * How long the switch takes to move and the dial takes to fade, in milliseconds.
 *
 * The same number as `--scale-fade` in `Styles.html`, which is where both transitions are actually
 * declared; this copy exists because the swap has to know when the old picture has finished leaving
 * before it draws the new one. `scale-swap.test.ts` reads the stylesheet back and compares, so the
 * two cannot drift — the failure otherwise is a dial redrawn mid-fade, which looks like a flicker
 * rather than like a mistake.
 */
export const SCALE_SWAP_MS = 180;

/** Set on the mount for the length of the fade-out; `Styles.html` takes the dial to `opacity: 0`. */
export const SWAPPING_ATTRIBUTE = "data-swapping";

/** The parameter the dial's scale has always been selectable by (#34), and still is. */
const SCALE_PARAM = "scale";

/**
 * `search` with `?scale=` set to `scale`, and every other parameter's text left alone.
 *
 * The obvious version of this is `URLSearchParams.set` and `URL.toString()`, and it was written that
 * way first. It rewrites the whole query string in `application/x-www-form-urlencoded`, which
 * percent-encodes characters a query may legally carry raw — so pressing the switch on
 * `?now=04:15&freeze=1` produced `?now=04%3A15&freeze=1&scale=1h`. Nothing breaks: it decodes to the
 * same pin. But `?now=04:15` is a parameter a person types, reads back off the bar of a board and
 * pastes into a PR, and `README.md` prints it in that form a dozen times. Mangling it as a side
 * effect of an unrelated press is the kind of small dishonesty that gets copied forward.
 *
 * So the edit is textual. Safe because the values are this module's own — `12h` and `1h`, which need
 * no escaping — rather than anything read off the page.
 *
 * The scale pair does **move**: it is dropped wherever it was and appended, so `?scale=12h&demo=1`
 * comes back as `?demo=1&scale=1h`. Order carries no meaning in a query string and every other
 * pair's own text is untouched, which is the property this is for.
 *
 * A repeated `scale=` collapses to one, which is the behaviour `URLSearchParams.get` already has:
 * it reads the first, and leaving a second behind would make the URL say two things.
 */
export function withScaleParam(search: string, scale: DialScaleId): string {
  const kept = search
    .replace(/^\?/, "")
    .split("&")
    .filter((pair) => pair !== "" && pair !== SCALE_PARAM && !pair.startsWith(`${SCALE_PARAM}=`));

  return `?${[...kept, `${SCALE_PARAM}=${scale}`].join("&")}`;
}

export interface ScaleSwapOptions {
  /**
   * The mount the stylesheet fades. `null` where there is nothing to fade — a jsdom fixture, or a
   * host that mounted something other than an element — in which case the redraw is immediate.
   */
  dial: HTMLElement | null;
  /** Draw the dial at this scale. Called once per settled press, never with a superseded one. */
  redraw(scale: DialScaleId): void;
  /**
   * Whether the viewer has asked for less motion, read at the press rather than captured: a board
   * whose setting changes between presses must not be left mid-fade by the previous one.
   */
  reducedMotion(): boolean;
  fadeMs?: number;
}

/**
 * Fade the dial out, redraw it at the new scale, and let the stylesheet's transition carry it in.
 *
 * The fade is not decoration. The two scales share no drawn element — different outer numerals, a
 * second numeral ring, different hand lengths, and an arc set taken from a different window at
 * twelve times the resolution — so an instant swap is every mark on the dial changing at once, which
 * reads as a fault rather than as a mode. Fading is what says *this is the same display, saying
 * something else*.
 *
 * Three properties, and each is a way the returned function has been or could be wrong:
 *
 * - **The dial arrives at the latest press, not the one that started the fade.** A second press
 *   inside the fade replaces the target and re-arms one timer, so two quick presses cost one redraw.
 * - **`data-swapping` is always cleared**, on every path out — including a `redraw` that throws and
 *   including a press that lands in the reduced-motion branch while a fade from an earlier press is
 *   still running. Missing the second of those left the dial at `opacity: 0` with nothing to clear
 *   it, which is the display's worst failure: blank, and looking like a load that never finished.
 * - **The switch does not wait for it.** The control has already moved by the time this is called,
 *   which is why it takes no part in moving it — a control that lagged the press by the fade would
 *   feel broken to whoever is standing at the board.
 */
export function scaleSwapper({
  dial,
  redraw,
  reducedMotion,
  fadeMs = SCALE_SWAP_MS
}: ScaleSwapOptions): (scale: DialScaleId) => void {
  let pending: number | null = null;
  let target: DialScaleId | null = null;

  function settle(): void {
    pending = null;
    const scale = target;
    target = null;

    try {
      if (scale !== null) redraw(scale);
    } finally {
      // `finally`, so a renderer that threw leaves a visible dial showing the old scale rather than
      // an invisible one showing nothing. The scale is then wrong; blank is worse.
      dial?.removeAttribute(SWAPPING_ATTRIBUTE);
    }
  }

  return function swap(scale: DialScaleId): void {
    target = scale;

    if (pending !== null) {
      window.clearTimeout(pending);
      pending = null;
    }

    // `settle` rather than `redraw` directly, so this path also clears an attribute an earlier
    // press left behind. Reaching it mid-fade is not hypothetical — the query is read per press.
    if (dial === null || reducedMotion()) {
      settle();
      return;
    }

    dial.setAttribute(SWAPPING_ATTRIBUTE, "1");
    pending = window.setTimeout(settle, fadeMs);
  };
}
