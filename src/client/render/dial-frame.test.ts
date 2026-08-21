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
import { LABEL_RADIUS_RATIO, analogClock } from "./analog-clock";

const SIZE = 600;
const OUTER_RADIUS = SIZE / 2 - 8;
/** The circle a card's centre starts from, before the displacement pass moves it (#134). */
const LOCUS = OUTER_RADIUS * (1 + LABEL_RADIUS_RATIO);
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
  const percent = Number(/--label-frame:\s*([\d.]+)vmin/.exec(block("#display"))?.[1] ?? NaN);

  expect(percent, "#display declares its frame as a share of the shorter axis").toBeGreaterThan(0);
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

interface Reach {
  id: string;
  /** How far past the viewBox the card reaches where it actually landed, on either axis. */
  drawn: number;
  /**
   * The same, horizontally only.
   *
   * Split out because the two axes stopped being paid for out of the same pot (#30 item 1). The
   * frame is what a card at twelve or six spends, and it is all a card has there; horizontally a
   * card spends the margin the host measured off the board, which on any widescreen display is
   * several times the frame and sits in the grid column beside the drawing rather than in the
   * padding. Bounding both by the padding would have made the granted margin unusable, and
   * bounding both by the margin would have stopped checking the thing this file was opened for.
   */
  horizontal: number;
  /** The same, vertically only — the axis the page's frame is what pays for. */
  vertical: number;
  /**
   * How far past the viewBox this card's *height* would reach at twelve o'clock.
   *
   * Card width is angle-dependent — a card is only wide where the frame leaves room for width — so a
   * card whose *height* outgrew the frame would pass the drawn measurements unless the sweep happened
   * to drop it at the top of the dial. Height is not angle-dependent in the same direction: a tall
   * card is tall *because* it was narrow, and moving it to twelve gives it more width and so no more
   * lines, so this over-estimates rather than under-estimates.
   *
   * Taken against `LOCUS` rather than against the card's own radius, which is the correction #30
   * item 1 forced: a card the displacement pass has moved (#134) sits off the locus circle, so its
   * measured radius carries the displacement as well as the height and the sum is a quantity nothing
   * bounds. `stack-labels.ts` bounds a displaced card's *edges* directly, which is what `vertical`
   * above measures.
   */
  atTwelve: number;
}

function reach(rect: Element): Reach {
  const number = (name: string) => Number(rect.getAttribute(name));
  const x = number("x");
  const y = number("y");
  const width = number("width");
  const height = number("height");
  return {
    id: rect.getAttribute("data-testid") ?? "",
    drawn: Math.max(-x, -y, x + width - SIZE, y + height - SIZE, 0),
    horizontal: Math.max(-x, x + width - SIZE, 0),
    vertical: Math.max(-y, y + height - SIZE, 0),
    atTwelve: LOCUS + height / 2 - SIZE / 2,
  };
}

function cardsOf(
  events: ClockEventInput[],
  scale: DialScaleId,
  labelMargin?: number
): Reach[] {
  const { element } = analogClock({ events, size: SIZE, time: TIME, scale, labelMargin });
  const rects = Array.from(element.querySelectorAll('[data-testid^="floating-label-rect-"]'));

  // A scenario that promotes no titles to cards would pass every assertion below while testing
  // nothing, which is how this could rot without saying so.
  expect(rects.length, `${scale}: no card was drawn`).toBeGreaterThan(8);
  return rects.map(reach);
}

function worst(cards: Reach[], axis: keyof Omit<Reach, "id">): Reach {
  return cards.reduce((most, card) => (card[axis] > most[axis] ? card : most));
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
  it.each(SWEEPS)("holds every card the %s dial draws, where it draws it", (scale, events) => {
    const card = worst(cardsOf(events, scale), "drawn");
    const frame = frameUnits();

    expect(
      card.drawn,
      `${card.id} reaches ${card.drawn.toFixed(2)} units past the viewBox, frame is ${frame.toFixed(2)}`
    ).toBeLessThanOrEqual(frame);
  });

  it.each(SWEEPS)("holds the tallest card the %s dial draws, at twelve o'clock", (scale, events) => {
    const card = worst(cardsOf(events, scale), "atTwelve");
    const frame = frameUnits();

    expect(
      card.atTwelve,
      `${card.id} would reach ${card.atTwelve.toFixed(2)} units out at twelve, frame is ${frame.toFixed(2)}`
    ).toBeLessThanOrEqual(frame);
  });
});

/**
 * The board's spare width, once the host measures it and hands it over (#30 item 1, ADR 0009).
 *
 * The frame above is still the whole allowance a card at twelve or six has, and still what the
 * renderer may spend with nothing passed. What changes is the horizontal axis: a widescreen board's
 * margin is several times the frame, and the room it names is the grid column beside the drawing
 * rather than the padding — so the bound stops being the stylesheet's number and becomes the one the
 * host measured. Bounding it by the padding again is how the grant would be silently unusable.
 */
describe("the margin the board grants", () => {
  /** A 16:9 board at 1920×1080, per `label-margin.ts`. */
  const GRANTED = 234.5;

  it.each(SWEEPS)("leaves the %s dial's cards inside the granted margin", (scale, events) => {
    const card = worst(cardsOf(events, scale, GRANTED), "horizontal");

    expect(
      card.horizontal,
      `${card.id} reaches ${card.horizontal.toFixed(2)} units past the viewBox, margin is ${GRANTED}`
    ).toBeLessThanOrEqual(GRANTED);
  });

  it.each(SWEEPS)("spends it on the %s dial rather than banking it", (scale, events) => {
    const granted = worst(cardsOf(events, scale, GRANTED), "horizontal").horizontal;
    const inherited = worst(cardsOf(events, scale), "horizontal").horizontal;

    expect(granted).toBeGreaterThan(inherited);
  });

  /**
   * The frame keeps governing the axis it pays for, and both vertical measures have to say so — a
   * wider card wraps to fewer lines, but #142's `planOptionalLines` then offers it a duration line
   * with the room that freed, so "wider" does not straightforwardly mean "shorter".
   */
  it.each(SWEEPS)("still fits every card the %s dial draws in the frame", (scale, events) => {
    const card = worst(cardsOf(events, scale, GRANTED), "vertical");
    const frame = frameUnits();

    expect(
      card.vertical,
      `${card.id} reaches ${card.vertical.toFixed(2)} units above or below the viewBox, frame is ${frame.toFixed(2)}`
    ).toBeLessThanOrEqual(frame);
  });

  it.each(SWEEPS)("still fits the %s dial's tallest card in it at twelve", (scale, events) => {
    const card = worst(cardsOf(events, scale, GRANTED), "atTwelve");
    const frame = frameUnits();

    expect(
      card.atTwelve,
      `${card.id} would reach ${card.atTwelve.toFixed(2)} units out at twelve, frame is ${frame.toFixed(2)}`
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

  /**
   * The tracks above can only be definite if the grid's own height is, and this is the declaration
   * that makes it so. It is asserted separately because it is the one the rest depends on: reverting
   * it to `min-height: 100vh` leaves the height indefinite, `minmax(0, 1fr)` resolves against
   * content again, and the dial renders **1762.3 px on a 1080 px board** — measured, and every other
   * assertion in this file passes while it does.
   */
  it("takes its own height from the viewport, so those tracks have something to divide", () => {
    // The boundary is what distinguishes it from `min-height`, which is the regression.
    expect(block("#display")).toMatch(/(^|[;\s])height:\s*100vh/);
  });

  it("charges the notice's separation to the notice, at the frame a card at six needs", () => {
    expect(block("#display")).not.toMatch(/(^|[;\s])gap:/);
    expect(block("#status")).toMatch(/margin:\s*var\(--label-frame\)/);
  });

  it("sizes the dial from the display and lets the drawing fit the box", () => {
    expect(block("#dial")).toMatch(/height:\s*100%/);
    expect(block("#dial")).toMatch(/width:\s*100%/);
    expect(block("#dial svg")).toMatch(/width:\s*100%/);
    expect(block("#dial svg")).toMatch(/height:\s*100%/);
  });
});
