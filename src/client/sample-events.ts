/**
 * Fixture schedule for `?demo=1` and the local preview.
 *
 * Reached only in demo mode, which labels itself on screen — a display showing invented events has
 * to be obviously doing so. It ships to the deployed app on purpose: judging arc legibility means
 * judging it on the smart board, and waiting for the viewer's real day to contain a useful overlap
 * is not a plan.
 *
 * Chosen to exercise what is hardest to judge from a specification — a four-deep overlap, which is as
 * many rings as `maxRings` will open, carrying both a two-line title and a one-line one on rings that
 * divide the band four ways (#67), a title too long for its arc, an event short enough to need
 * the minimum-width floor, an event crossing each end of the rolling window (#25), a floating label
 * washed with a colour the palette itself fails contrast for once filled (⚫, #26/#27), and a card
 * whose duration line is wider than its title (#35).
 *
 * Anchored to `windowStart` — the rolling window's own leading edge — rather than a fixed
 * `periodStart`, so the whole fixture lands inside whatever window is live the moment demo mode
 * loads, regardless of the time of day. The window is 11 hours (was 12), so "y" — the event
 * meant to cross the *trailing* edge — moved 15 minutes earlier to still cross it; every other
 * event already fit inside the shorter span unchanged. Because the window keeps moving with real
 * time after load, one copy of the fixture scrolls out of view over about thirteen hours, so
 * `recurringSampleEvents` tiles copies of it end to end rather than re-anchoring the one (#62).
 */
import type { ClockEventInput, DialScaleId } from "../shared/clock";

export function sampleEvents(windowStart: Date): ClockEventInput[] {
  const at = (hours: number, minutes: number) =>
    new Date(windowStart.getTime() + (hours * 60 + minutes) * 60_000).toISOString();
  const fallbackColor = "#3b82f6";

  return [
    // Already running when the window began — its leading end is the window's, not the event's.
    { id: "z", title: "⚪ Breakfast Club", startDate: at(-1, 10), endDate: at(0, 20), isAllDay: false, fallbackColor },
    // Four deep between 01:45 and 02:00 — the deepest stack the dial will open, so the rings here are
    // the thinnest it ever draws (15.56 units of a 75.92 band) and the case #67 and #70 are both about.
    // Was three deep; the fourth member is what makes the preview reach the geometry #67 added, since
    // a three-deep ring has room for a two-line stack without the cap binding.
    { id: "a", title: "🟢 🎮 Game Time", startDate: at(0, 30), endDate: at(2, 0), isAllDay: false, fallbackColor },
    { id: "b", title: "🔴 Deadline", startDate: at(1, 0), endDate: at(3, 0), isAllDay: false, fallbackColor },
    // A **one-line title on a four-deep ring**: 36 visual units against its ring's 48-character
    // budget. It keeps the full 4.36-unit font, because one line has radial room to spare — the room a
    // line that is not drawn does not get to take (#67).
    { id: "c", title: "🟣 Study Skills and Exam Revision Group", startDate: at(1, 30), endDate: at(2, 30), isAllDay: false, fallbackColor },
    // Innermost of the four, and the fixture's only **two-line title on a stacked ring** — every other
    // wrapping title here is on a lone arc, so nothing exercised text sized from a divided band
    // against an outline sized from the whole of it (#67). 45 visual units against the 44 its ring
    // gives, so it wraps by one word; well inside the 88 two lines can carry, so it stays on the arc
    // rather than overflowing to a card. This is the arc where the clearance cap binds: the stack
    // wants 4.58 units of half-height in the 4.12 the outline leaves, so the font yields to 3.93.
    { id: "k", title: "🟠 Swimming Group B Kit Check and Coach Handover", startDate: at(1, 45), endDate: at(2, 45), isAllDay: false, fallbackColor },
    // Overlaps nothing — should keep the whole band despite the cluster above. Ends 55 minutes
    // before "j" starts, deliberately, so the stretch between them is empty *and inside* the
    // window — the one stress case the window-track (#25) exists to distinguish from the gap.
    { id: "d", title: "🟡 🍽️ Lunch", startDate: at(4, 30), endDate: at(5, 20), isAllDay: false, fallbackColor },
    // Straddles `now`, which is always fixture offset +3:00 — the fixture is seeded from
    // `getRollingWindow(new Date()).windowStart`, i.e. exactly `now − 3h`, so no other offset can
    // be the current time whatever the wall clock says. Without this event the *draining* state
    // (#28) never renders in demo mode at all, which is how masks that drained nothing survived
    // both #28 and #27 (#71). Yellow and 44 minutes on purpose: 22° clears the 20° title floor, so
    // the title renders on the arc rather than being promoted to a floating label that would
    // sidestep the question, and yellow takes a black title — 1.18:1 on the bare dial the drained
    // side exposes, so the title has to change colour across the seam. The title is long enough to
    // reach past the seam for the same reason: a short one sits entirely on the spent side and
    // never exercises the split. Overlaps only "b", which ends at +3:00, so peak concurrency stays
    // three and the cluster above keeps its ring thickness — and a drained portion ends up beside a
    // fully elapsed arc, which is the comparison a viewer actually has to make.
    { id: "n", title: "🟡 Tidy Up and Line Up", startDate: at(2, 30), endDate: at(3, 14), isAllDay: false, fallbackColor },
    // Twenty-two minutes with a four-character title: 11° of arc against a three-character budget
    // on a lone ring, so it overflows onto a label whose duration line ("22 min", 6 units) is
    // *wider* than its title (4). Every other card here has a title wider than its duration, so nothing else
    // exercises a card that sizes itself to the trailing line rather than to the text (#35). Must
    // stay a lone arc to do that: on a two-deep ring the smaller font gives a 7-character budget,
    // "Yoga" fits, and there is no card at all.
    //
    // Sited in the empty in-window stretch after "d" rather than beside another label. Next to the
    // conference — the obvious free slot — its card landed *inside* that card, which is wide enough
    // at six o'clock to swallow it whole: #30's crowding, and nothing to do with the duration line,
    // so the fixture should not conflate the two.
    // Twenty-two rather than a round twenty because an exactly-20-minute event computes to
    // 9.999999999999943° and loses the 10° overflow floor to floating-point error, rendering no text
    // of any kind. Real, and not this change's to fix — see #69.
    { id: "j", title: "🔵 Yoga", startDate: at(6, 15), endDate: at(6, 37), isAllDay: false, fallbackColor },
    // ⚫ measures 1.32:1 on the band's own ground, so once elapsed its outline is invisible
    // without the neutral band beneath it. Placed clear of the cluster so the two stresses
    // stay separable.
    { id: "x", title: "⚫ Assembly", startDate: at(3, 15), endDate: at(4, 0), isAllDay: false, fallbackColor },
    // Short and ⚫-coloured, so it overflows into a floating label (#29): the one colour whose
    // wash and border are both load-bearing, since it is one of the two the palette itself fails
    // contrast for once drawn as a filled arc (#26/#27).
    { id: "w", title: "⚫ Staff Debrief and Planning", startDate: at(4, 0), endDate: at(4, 30), isAllDay: false, fallbackColor },
    // Ten minutes, held open by the minimum-span floor.
    { id: "e", title: "📚 Reading", startDate: at(8, 0), endDate: at(8, 10), isAllDay: false, fallbackColor },
    // 24 minutes is 12°: past the emoji floor, short of the title floor, and its title is the emoji
    // alone — the one shape that still draws a standalone radial glyph rather than inlining it.
    { id: "i", title: "🟤 ⚽", startDate: at(4, 2), endDate: at(4, 26), isAllDay: false, fallbackColor },
    // Long enough to be promoted to a floating label, and its emoji travels with the title rather
    // than staying on the arc — a glyph left behind overlapped this very card. Its 👩‍🏫 is also a ZWJ
    // sequence: one glyph across several code points, which must be charged as one emoji's width
    // and never sliced apart.
    { id: "f", title: "🔵 👩‍🏫 Parent Teacher Conference Planning Committee", startDate: at(9, 30), endDate: at(10, 40), isAllDay: false, fallbackColor },
    // Title wraps to two lines *and* carries an emoji — inline, so the wrap has to place the
    // glyph as part of the text rather than on its own radial line.
    { id: "g", title: "🟠 🎂 Reading and Snacks", startDate: at(6, 40), endDate: at(7, 55), isAllDay: false, fallbackColor },
    // A run of emoji, which must wrap as one token rather than scattering a glyph per line. Sited
    // in the clear gap between "Reading" and the conference so it does not deepen the cluster above.
    // The run is space-free after the first glyph, which is the worst case for the width heuristic:
    // only the *leading* emoji is stripped, so 🪀🎈 stay adjacent inside cleanTitle, and a line of
    // pure emoji gets none of the slack that over-charged plain characters usually provide.
    { id: "h", title: "🟣 🧸 🪀🎈 Free Play", startDate: at(8, 20), endDate: at(9, 25), isAllDay: false, fallbackColor },
    // Runs on past the window's end, so the dial must not claim it finishes there. Also the
    // fixture's last event, so under `recurringSampleEvents` it abuts the next copy's "z" exactly,
    // on the same ring and with no separator between them — the two read as separate arcs only
    // because 🟢 against ⚪ is a strong colour change. Recolouring either to the other's colour
    // would merge them into one apparent arc at every seam.
    { id: "y", title: "🟢 Aftercare", startDate: at(10, 50), endDate: at(13, 15), isAllDay: false, fallbackColor },
  ];
}

/**
 * Fixture schedule for the 1-hour scale (#34), anchored to that mode's own window start.
 *
 * A separate set rather than a reuse: the 12-hour fixture spans eleven hours, so inside a
 * 55-minute window all but one or two of its events fall outside it and the survivors are drawn as
 * full-band arcs continuing past both edges — which exercises nothing the mode is about. The whole
 * claim of the 1-hour scale is that **sub-hour events become legible**, so its fixture has to be
 * made of sub-hour events or it cannot be judged at all.
 *
 * Deliberately carries, at this scale: a three-deep cluster; an event already running at load, so
 * the drain (#28) is visible in the preview without waiting for luck (which is #76's complaint
 * about the 12-hour fixture); an event crossing each end of the window; a five-minute event, which
 * the 12-hour dial floors into the same 7.5° sliver as a fifteen-minute one and this dial draws at
 * 30°; a one-minute event, which is short enough to still need that floor even here; an emoji-only
 * title; a title too long for its arc; and a ⚫, whose fill measures 1.21:1 on the dial.
 *
 * `at` counts minutes from the window's leading edge, which is 5 minutes behind now — so `at(5)`
 * is the moment the page loads and anything spanning it is in progress.
 *
 * **Recurs, via the same tiling as the 12-hour fixture (#62)** — and needs it far more, because
 * the window is 55 minutes rather than eleven hours. Measured on a single copy: nine arcs at load,
 * eight three minutes later once the elapsed one has gone, one by fifty minutes, and none at
 * seventy. Its span is 78 minutes, so consecutive copies abut and at most two are ever in view.
 */
export function oneHourSampleEvents(windowStart: Date): ClockEventInput[] {
  const at = (minutes: number) =>
    new Date(windowStart.getTime() + minutes * 60_000).toISOString();
  const fallbackColor = "#3b82f6";

  return [
    // Began before the window and finished two minutes before load, so it is feathered at the
    // leading edge *and* elapsed — the two states the 5-minute look-behind exists to show. A
    // leading-edge crosser can never be wider than that look-behind, so 18° is its natural size.
    { id: "p", title: "⚪ Register", startDate: at(-8), endDate: at(3), isAllDay: false, fallbackColor },
    // Running at load, so the preview always opens with a draining arc rather than waiting for a
    // real day to oblige (#76). Starts a minute clear of "p": with the two states on neighbouring
    // arcs they can be judged against each other (#66), without a one-minute overlap halving the
    // thickness of a half-hour arc for its whole length.
    //
    // Also the outer arc of the three-deep cluster, which runs +15 to +22.
    { id: "q", title: "🟢 🎮 Maths Starter", startDate: at(4), endDate: at(30), isAllDay: false, fallbackColor },
    { id: "r", title: "🔴 Spelling Test", startDate: at(12), endDate: at(26), isAllDay: false, fallbackColor },
    { id: "s", title: "🟣 Reading", startDate: at(15), endDate: at(22), isAllDay: false, fallbackColor },
    // One minute is 6° even here, so the minimum-span floor still has something to hold open —
    // the floor is angular and does not scale with the mode, which is the behaviour to keep sight of.
    { id: "n", title: "🟠 Bell", startDate: at(31), endDate: at(32), isAllDay: false, fallbackColor },
    // Five minutes: identical to a fifteen-minute event on the 12-hour dial, 30° of readable arc here.
    { id: "t", title: "🟡 🍽️ Break", startDate: at(33), endDate: at(38), isAllDay: false, fallbackColor },
    // Six minutes of arc carrying a title far too long for it, in the one colour the palette
    // itself fails contrast for once filled (#26/#27) — so it overflows onto a ⚫-washed card.
    { id: "u", title: "⚫ Assembly Notes and Reminders", startDate: at(39), endDate: at(45), isAllDay: false, fallbackColor },
    // Two minutes is 12°: past the emoji floor, short of the title floor, and its title is the
    // emoji alone — the one shape that still draws a standalone radial glyph.
    { id: "v", title: "🟤 ⚽", startDate: at(46), endDate: at(48), isAllDay: false, fallbackColor },
    // Runs on past the window's end, so the dial must not claim it finishes there. Its 👩‍🏫 is a ZWJ
    // sequence: one glyph across several code points, which must never be sliced apart by a wrap.
    { id: "w", title: "🔵 👩‍🏫 Parent Drop-in and Book Fair", startDate: at(49), endDate: at(70), isAllDay: false, fallbackColor },
  ];
}

/**
 * A fixture and the tiling facts derived from it (#62).
 *
 * Two fixtures now recur — the 12-hour one and #34's 1-hour one — and neither's period may be
 * written down: it has to be *derived* from the fixture's own span, or it stops being right the
 * moment an event moves. Bundling the fixture with its bounds is what lets one piece of tiling
 * arithmetic serve both without either carrying the other's numbers.
 */
export interface DemoFixture {
  /** Which dial scale this fixture is authored for. */
  scale: DialScaleId;
  /** The fixture itself, seeded from a window start. */
  events: (windowStart: Date) => ClockEventInput[];
  /** Minutes from the anchor to the fixture's earliest start and its latest end. */
  firstStartMinutes: number;
  lastEndMinutes: number;
  /**
   * How far apart consecutive copies sit — the fixture's own span, whatever it is.
   *
   * Derived rather than chosen, and that is the whole of why the tiling works. At exactly the span,
   * a copy's first event begins at the instant the previous copy's last event ends: the seam adds
   * no concurrency, so peak overlap stays the depth the fixture was authored around, and the window
   * at load reaches neither neighbour, so the picture every screenshot judged is unchanged. A
   * hand-written period would do neither.
   */
  periodMinutes: number;
}

function demoFixtureOf(
  scale: DialScaleId,
  events: (windowStart: Date) => ClockEventInput[]
): DemoFixture {
  const anchor = new Date(0);
  const minutesFromAnchor = (iso: string) => (new Date(iso).getTime() - anchor.getTime()) / 60_000;
  const seeded = events(anchor);

  const firstStartMinutes = Math.min(...seeded.map((event) => minutesFromAnchor(event.startDate)));
  const lastEndMinutes = Math.max(...seeded.map((event) => minutesFromAnchor(event.endDate)));

  return {
    scale,
    events,
    firstStartMinutes,
    lastEndMinutes,
    periodMinutes: lastEndMinutes - firstStartMinutes,
  };
}

export const TWELVE_HOUR_FIXTURE = demoFixtureOf("12h", sampleEvents);
export const ONE_HOUR_FIXTURE = demoFixtureOf("1h", oneHourSampleEvents);

/** The fixture the dial should draw at a given scale. */
export function demoFixture(scale: DialScaleId): DemoFixture {
  return scale === "1h" ? ONE_HOUR_FIXTURE : TWELVE_HOUR_FIXTURE;
}

/**
 * How far apart consecutive copies of the 12-hour fixture sit.
 *
 * Kept as a named export because the README's figures and the recurrence suite are both written
 * against this one fixture specifically; `DemoFixture.periodMinutes` is the general form.
 */
export const FIXTURE_PERIOD_MINUTES = TWELVE_HOUR_FIXTURE.periodMinutes;

/**
 * Which copies of `fixture` reach `[windowStart, windowEnd)`, as offsets in whole periods from the
 * load-time anchor.
 *
 * Usually one, two across a seam. `main.ts` re-emits only when this changes, so it must be stable
 * between advances rather than recomputed into a new-looking value every poll.
 *
 * A copy is bounded by its span, and a fixture need not be contiguous — the 12-hour one's largest
 * internal gap is 55 minutes. So a window narrower than that gap could be handed a copy with
 * nothing actually in view; that is the reason this returns candidate copies rather than claiming
 * each one is drawn. Worth noting the 1-hour fixture is the case that makes the caution concrete
 * and then defuses it: its window is 55 minutes, but its largest internal gap is one.
 */
export function fixtureCopyIndices(
  fixture: DemoFixture,
  anchor: Date,
  { windowStart, windowEnd }: { windowStart: Date; windowEnd: Date }
): number[] {
  const start = (windowStart.getTime() - anchor.getTime()) / 60_000;
  const end = (windowEnd.getTime() - anchor.getTime()) / 60_000;

  // Copy k spans [k·P + firstStart, k·P + lastEnd], and overlap is strict at both ends to match
  // filterEventsForPeriod — an event ending exactly at windowStart is not in view.
  const first = Math.floor((start - fixture.lastEndMinutes) / fixture.periodMinutes) + 1;
  const last = Math.ceil((end - fixture.firstStartMinutes) / fixture.periodMinutes) - 1;

  const indices: number[] = [];
  for (let index = first; index <= last; index += 1) indices.push(index);
  return indices;
}

/**
 * The fixture, recurring: every copy that reaches the given window (#62).
 *
 * A display left on `?demo=1` outlives one copy — the rolling window walks off the 12-hour fixture
 * in about thirteen hours and the dial goes blank, and off the 1-hour one inside the hour, since
 * that window is 55 minutes wide rather than eleven hours (#34). Re-anchoring the single copy to
 * the current window would fix the blankness by freezing the picture instead: the anchor is the
 * window's own start, so every event's offset from `now` would be constant and nothing would ever
 * elapse or drain (#76 measured that invariance). Tiling keeps time moving — events age out at the
 * leading edge exactly as they do now, and the next copy arrives at the trailing one.
 *
 * Copy 0 keeps its bare ids, because they reach the DOM as `data-testid="event-arc-<id>"` and are
 * what every existing reference to the fixture names.
 */
export function recurringSampleEvents(
  fixture: DemoFixture,
  anchor: Date,
  view: { windowStart: Date; windowEnd: Date }
): ClockEventInput[] {
  return fixtureCopyIndices(fixture, anchor, view).flatMap((index) => {
    const shifted = new Date(anchor.getTime() + index * fixture.periodMinutes * 60_000);
    return fixture.events(shifted).map((event) =>
      index === 0 ? event : { ...event, id: `${event.id}@${index}` }
    );
  });
}

