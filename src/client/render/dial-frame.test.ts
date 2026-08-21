/**
 * The page's frame and the cards the renderer draws into it have to agree, and nothing checked
 * that (#115).
 *
 * Floating labels paint outside the SVG box on purpose, so how far outside they may go is a
 * property of the renderer, and how far outside they *fit* is a property of the stylesheet. Those
 * two numbers were never compared: the dial rendered 600 px centred in a 1080 px page, and the
 * 240 px of slack that left above it was what the cards had been using. Sizing the dial to the
 * board takes the slack away, so `#display`'s padding becomes the whole of the allowance — and a
 * card that outgrows it is clipped by the viewport, losing the only copy of a title that was
 * promoted to a card *because* it did not fit its arc.
 *
 * The frame is read out of `Styles.html` rather than restated here, so the assertion binds in both
 * directions: it fails if a card grows, and it fails if the padding shrinks.
 */
import { describe, expect, it } from "vitest";
import styles from "../../../static/Styles.html?raw";
import type { ClockEventInput, DialScaleId } from "../../shared/clock";
import { analogClock } from "./analog-clock";

const SIZE = 600;
/** Four in the morning, so the rolling window `[time − 3h, time + 8h)` is [01:00, 12:00). */
const TIME = new Date(2026, 7, 15, 4, 0, 0);
const WINDOW_START_HOUR = 1;

const LONG_TITLE = "Parent Teacher Conference Planning Committee Notes and Actions";

function withoutComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

function block(selector: string): string {
  const found = new RegExp(`${selector}\\s*\\{([^}]*)\\}`).exec(withoutComments(styles));

  if (!found) throw new Error(`no ${selector} rule in Styles.html`);
  return found[1];
}

/**
 * The frame `#display`'s padding leaves, in the dial's own units.
 *
 * The padding is a percentage of the shorter viewport axis and the dial is sized from what is left,
 * so a padding of `p` per cent of an axis of length `V` leaves the dial `V − 2p·V/100` px for its
 * 600 units, and the frame beside it is `600p / (100 − 2p)` units wide.
 */
function frameUnits(): number {
  const percent = Number(/padding:\s*([\d.]+)vmin/.exec(block("#display"))?.[1] ?? NaN);

  expect(percent, "#display declares its padding as a share of the shorter axis").toBeGreaterThan(0);
  return (600 * percent) / (100 - 2 * percent);
}

function event(id: string, startHour: number, durationHours: number): ClockEventInput {
  const stamp = (hour: number) => {
    const minutes = Math.round(hour * 60);
    const wholeHours = Math.floor(minutes / 60);
    return new Date(2026, 7, 15, wholeHours, minutes - wholeHours * 60).toISOString();
  };

  return {
    id,
    title: LONG_TITLE,
    startDate: stamp(startHour),
    endDate: stamp(startHour + durationHours),
    isAllDay: false,
    fallbackColor: "#3b82f6",
  };
}

/** How far past the 600-unit viewBox a card reaches, on whichever axis is worse. */
function overhang(rect: Element): number {
  const number = (name: string) => Number(rect.getAttribute(name));
  const x = number("x");
  const y = number("y");

  return Math.max(-x, -y, x + number("width") - SIZE, y + number("height") - SIZE, 0);
}

function worstCard(events: ClockEventInput[], scale: DialScaleId): { id: string; out: number } {
  const { element } = analogClock({ events, size: SIZE, time: TIME, scale });
  const rects = Array.from(element.querySelectorAll('[data-testid^="floating-label-rect-"]'));

  // A scenario that promotes no titles to cards would pass every assertion below while testing
  // nothing, which is how this could rot without saying so.
  expect(rects.length, `${scale}: no card was drawn`).toBeGreaterThan(8);

  return rects.reduce(
    (most, rect) => {
      const out = overhang(rect);
      return out > most.out ? { id: rect.getAttribute("data-testid") ?? "", out } : most;
    },
    { id: "", out: 0 }
  );
}

/**
 * A long-titled event every half hour across the 12-hour window, and every five minutes across the
 * 1-hour one, each long enough to clear `EMOJI_MIN_SPAN_DEGREES` and short enough that its title
 * overflows its arc. Cards land the whole way round the dial rather than only where the demo
 * fixture happens to put them, which is what makes this a bound rather than a sample: the fixture's
 * own worst case is 25.4 units, and the dial can reach twice that.
 */
const SWEEPS: [DialScaleId, ClockEventInput[]][] = [
  ["12h", Array.from({ length: 22 }, (_, i) => event(`h${i}`, WINDOW_START_HOUR + i / 2, 25 / 60))],
  ["1h", Array.from({ length: 12 }, (_, i) => event(`m${i}`, 4 - 5 / 60 + (i * 5) / 60, 4 / 60))],
];

describe("the frame the page leaves for floating labels", () => {
  it.each(SWEEPS)("is wide enough for every card the %s dial draws", (scale, events) => {
    const worst = worstCard(events, scale);
    const frame = frameUnits();

    expect(
      worst.out,
      `${worst.id} reaches ${worst.out.toFixed(2)} units past the viewBox, frame is ${frame.toFixed(2)}`
    ).toBeLessThanOrEqual(frame);
  });
});

/**
 * The structural facts that were the mechanism of #115, asserted where vitest can reach them.
 * jsdom has no layout, so the rendered size itself is measured with a browser and recorded on the
 * PR — but a grid track auto-sized from its items' max-content is what let the SVG's own
 * `width="600"` attribute decide the dial's size, and that much is visible in the declaration.
 */
describe("the display's sizing rule", () => {
  it("gives both grid tracks a definite size, so no track is sized from the dial itself", () => {
    const display = block("#display");

    expect(display).toMatch(/grid-template-columns:\s*minmax\(\s*0/);
    expect(display).toMatch(/grid-template-rows:\s*minmax\(\s*0/);
  });

  it("charges the notice's separation to the notice, not to the gap between tracks", () => {
    expect(block("#display")).not.toMatch(/(^|[;\s])gap:/);
    expect(block("#status")).toMatch(/margin:\s*1\.5rem/);
  });

  it("sizes the dial from the display and lets the drawing fit the box", () => {
    expect(block("#dial")).toMatch(/height:\s*100%/);
    expect(block("#dial svg")).toMatch(/width:\s*100%/);
    expect(block("#dial svg")).toMatch(/height:\s*100%/);
  });
});
