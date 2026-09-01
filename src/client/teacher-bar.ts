/**
 * The teacher's controls, along the upper edge of the display.
 *
 * ADR 0008 places them: an adult standing at a wall-mounted touch board reaches the top of it
 * easily and a five-year-old does not, and the ADR is explicit that this is a first pass on a pilot
 * rather than an end state — height locks out a teacher in a wheelchair by the same property that
 * locks out the children.
 *
 * The bar is **always visible**, which the ADR settles and ADR 0009 pays for: the dial is bound by
 * the board's *height*, so vertical space the bar takes converts into horizontal room for the panel
 * and the labels rather than being lost. That is also what makes the scale switch legitimate at all
 * — a control that changes what the arcs already on screen *mean* carries the hazard that a person
 * glancing at the wall cannot know the mode was changed, and a persistent switch showing its own
 * position is the answer to it. A switch that is not on screen is not an indicator.
 *
 * HTML rather than SVG, which is why this sits outside `render/`: the bar is chrome around the
 * drawing, not part of it.
 */
import type { DialScaleId } from "../shared/clock";

/**
 * How long the switch takes to move and the dial takes to fade, in milliseconds.
 *
 * The same number as `--scale-fade` in `Styles.html`, which is where both transitions are actually
 * declared; this copy exists because the host has to know when the old picture has finished leaving
 * before it draws the new one. `teacher-bar.test.ts` reads the stylesheet back and compares, so the
 * two cannot drift — the failure otherwise is a dial redrawn mid-fade, which looks like a flicker
 * rather than like a mistake.
 */
export const SCALE_SWAP_MS = 180;

/**
 * The scales the switch offers, in the order it lays them out.
 *
 * 12 hours first because it is the default and the dial's inherited behaviour, so the thumb's
 * resting position is its left one. Named in plain words rather than as `12h` / `1h`: the parameter
 * spelling is for a URL, and this is read by a teacher.
 */
const SCALE_OPTIONS: readonly { id: DialScaleId; label: string }[] = [
  { id: "12h", label: "12 hours" },
  { id: "1h", label: "1 hour" }
];

/** The radio group's name. Shared by both inputs, which is what makes them one control. */
const SCALE_INPUT_NAME = "dial-scale";

/** The parameter the dial's scale has always been selectable by (#34), and still is. */
const SCALE_PARAM = "scale";

/**
 * `search` with `?scale=` set to `scale`, and **every other parameter left byte-identical**.
 *
 * The obvious version of this is `URLSearchParams.set` and `URL.toString()`, and it was written that
 * way first. It rewrites the whole query string in `application/x-www-form-urlencoded`, which
 * percent-encodes characters a query may legally carry raw — so pressing the switch on
 * `?now=04:15&freeze=1` produced `?now=04%3A15&freeze=1&scale=1h`. Nothing breaks: it decodes to the
 * same pin. But `?now=04:15` is a parameter a person types, reads back off the bar of a board and
 * pastes into a PR, and `README.md` prints it in that form a dozen times. Mangling it as a side
 * effect of an unrelated press is the kind of small dishonesty that gets copied forward.
 *
 * So the edit is textual and confined to one pair. Safe because the values are this module's own —
 * `12h` and `1h`, which need no escaping — rather than anything read off the page.
 *
 * A repeated `scale=` collapses to one, which is the behaviour `URLSearchParams.get` already has:
 * it reads the first, and leaving a second behind would make the URL say two things.
 *
 * Pure, so the encoding question is settled in node rather than inside the entry file that reads
 * `window.location` — the one place it cannot be unit-tested.
 */
export function withScaleParam(search: string, scale: DialScaleId): string {
  const kept = search
    .replace(/^\?/, "")
    .split("&")
    .filter((pair) => pair !== "" && pair !== SCALE_PARAM && !pair.startsWith(`${SCALE_PARAM}=`));

  return `?${[...kept, `${SCALE_PARAM}=${scale}`].join("&")}`;
}

export interface TeacherBarParams {
  /** Which scale the dial opened on — the switch shows it rather than deciding it. */
  scale: DialScaleId;
  /**
   * Called with the scale a press selected, and never with the one already showing.
   *
   * The bar has changed its own appearance by the time this runs. That order is deliberate: the
   * dial's redraw is deferred behind a fade, and a control that waited for the picture would feel
   * broken to someone standing at the board.
   */
  onScaleChange(scale: DialScaleId): void;
}

export interface TeacherBarHandle {
  element: HTMLElement;
}

export function teacherBar({ scale, onScaleChange }: TeacherBarParams): TeacherBarHandle {
  const element = document.createElement("nav");
  element.className = "bar-controls";
  element.setAttribute("aria-label", "Display controls");

  const group = document.createElement("div");
  group.className = "scale-switch";
  group.setAttribute("role", "radiogroup");
  group.setAttribute("aria-label", "Dial scale");
  // The stylesheet slides the thumb off this, and a spec reads the state off it.
  group.dataset["scale"] = scale;

  const thumb = document.createElement("span");
  thumb.className = "scale-switch-thumb";
  // The lit segment is already announced by the checked input; the thumb is the same fact, drawn.
  thumb.setAttribute("aria-hidden", "true");
  group.append(thumb);

  for (const option of SCALE_OPTIONS) {
    const label = document.createElement("label");
    label.className = "scale-option";

    // Native radios, not buttons with `role="radio"`: arrow keys, roving focus and the one-checked
    // invariant all come free, and a re-implementation of them is a place for this to be subtly
    // wrong on a device nobody tests with a keyboard.
    const input = document.createElement("input");
    input.type = "radio";
    input.name = SCALE_INPUT_NAME;
    input.value = option.id;
    input.checked = option.id === scale;

    const text = document.createElement("span");
    text.className = "scale-option-text";
    text.textContent = option.label;

    input.addEventListener("change", () => {
      // `change` fires on the input being *selected*; the one being cleared stays quiet. Guarded
      // anyway, so a caller cannot be handed the scale it is already drawing.
      if (!input.checked) return;

      group.dataset["scale"] = option.id;
      onScaleChange(option.id);
    });

    label.append(input, text);
    group.append(label);
  }

  element.append(group);
  return { element };
}
