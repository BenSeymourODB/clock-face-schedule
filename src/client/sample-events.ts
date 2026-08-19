/**
 * Fixture schedule for `?demo=1` and the local preview.
 *
 * Reached only in demo mode, which labels itself on screen — a display showing invented events has
 * to be obviously doing so. It ships to the deployed app on purpose: judging arc legibility means
 * judging it on the smart board, and waiting for the viewer's real day to contain a useful overlap
 * is not a plan.
 *
 * Chosen to exercise what is hardest to judge from a specification — three-deep overlap, a title
 * too long for its arc, an event short enough to need the minimum-width floor, an event crossing
 * each end of the rolling window (#25), a floating label washed with a colour the palette itself
 * fails contrast for once filled (⚫, #26/#27), and a card whose duration line is wider than its
 * title (#35).
 *
 * Anchored to `windowStart` — the rolling window's own leading edge — rather than a fixed
 * `periodStart`, so the whole fixture lands inside whatever window is live the moment demo mode
 * loads, regardless of the time of day. The window is 11 hours (was 12), so "y" — the event
 * meant to cross the *trailing* edge — moved 15 minutes earlier to still cross it; every other
 * event already fit inside the shorter span unchanged. Because the window keeps moving with real
 * time after load, one copy of the fixture scrolls out of view over about thirteen hours, so
 * `recurringSampleEvents` tiles copies of it end to end rather than re-anchoring the one (#62).
 */
import type { ClockEventInput } from "../shared/clock";

export function sampleEvents(windowStart: Date): ClockEventInput[] {
  const at = (hours: number, minutes: number) =>
    new Date(windowStart.getTime() + (hours * 60 + minutes) * 60_000).toISOString();
  const fallbackColor = "#3b82f6";

  return [
    // Already running when the window began — its leading end is the window's, not the event's.
    { id: "z", title: "⚪ Breakfast Club", startDate: at(-1, 10), endDate: at(0, 20), isAllDay: false, fallbackColor },
    // Three deep between 01:00 and 02:00.
    { id: "a", title: "🟢 🎮 Game Time", startDate: at(0, 30), endDate: at(2, 0), isAllDay: false, fallbackColor },
    { id: "b", title: "🔴 Deadline", startDate: at(1, 0), endDate: at(3, 0), isAllDay: false, fallbackColor },
    { id: "c", title: "🟣 Study", startDate: at(1, 30), endDate: at(2, 30), isAllDay: false, fallbackColor },
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
    // ⚫ measures 1.21:1 on the dial background, so once elapsed its outline is invisible without
    // the neutral band beneath it. Placed clear of the cluster so the two stresses stay separable.
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

/** Minutes from the anchor to the fixture's earliest start and its latest end. */
function fixtureBounds(): { firstStartMinutes: number; lastEndMinutes: number } {
  const anchor = new Date(0);
  const minutesFromAnchor = (iso: string) =>
    (new Date(iso).getTime() - anchor.getTime()) / 60_000;
  const events = sampleEvents(anchor);

  return {
    firstStartMinutes: Math.min(...events.map((event) => minutesFromAnchor(event.startDate))),
    lastEndMinutes: Math.max(...events.map((event) => minutesFromAnchor(event.endDate))),
  };
}

const { firstStartMinutes, lastEndMinutes } = fixtureBounds();

/**
 * How far apart consecutive copies of the fixture sit — the fixture's own span, whatever it is.
 *
 * Derived rather than chosen, and that is the whole of why the tiling works. At exactly the span,
 * a copy's first event begins at the instant the previous copy's last event ends: the seam adds no
 * concurrency, so peak overlap stays the three rings the fixture was authored around, and the
 * window at load reaches neither neighbour, so the picture every screenshot judged is unchanged.
 * A hand-written period would do neither, and would stop being right the moment an event moved.
 */
export const FIXTURE_PERIOD_MINUTES = lastEndMinutes - firstStartMinutes;

/**
 * Which copies of the fixture reach `[windowStart, windowEnd)`, as offsets in whole periods from
 * the load-time anchor.
 *
 * Usually one, two across a seam. `main.ts` re-emits only when this changes, so it must be stable
 * between advances rather than recomputed into a new-looking value every poll.
 *
 * A copy is bounded by its span, and the fixture is not contiguous — its largest internal gap is 55
 * minutes. So a window narrower than that gap could be handed a copy with nothing actually in view;
 * harmless while the caller's window is the rolling 11 hours, and the reason this returns candidate
 * copies rather than claiming each one is drawn.
 */
export function fixtureCopyIndices(
  anchor: Date,
  { windowStart, windowEnd }: { windowStart: Date; windowEnd: Date }
): number[] {
  const start = (windowStart.getTime() - anchor.getTime()) / 60_000;
  const end = (windowEnd.getTime() - anchor.getTime()) / 60_000;

  // Copy k spans [k·P + firstStart, k·P + lastEnd], and overlap is strict at both ends to match
  // filterEventsForPeriod — an event ending exactly at windowStart is not in view.
  const first = Math.floor((start - lastEndMinutes) / FIXTURE_PERIOD_MINUTES) + 1;
  const last = Math.ceil((end - firstStartMinutes) / FIXTURE_PERIOD_MINUTES) - 1;

  const indices: number[] = [];
  for (let index = first; index <= last; index += 1) indices.push(index);
  return indices;
}

/**
 * The fixture, recurring: every copy that reaches the given window (#62).
 *
 * A display left on `?demo=1` outlives one copy — the rolling window walks off it in about
 * thirteen hours and the dial goes blank. Re-anchoring the single copy to the current window would
 * fix the blankness by freezing the picture instead: the anchor is `now − 3h`, so every event's
 * offset from `now` would be constant and nothing would ever elapse or drain (#76 measured that
 * invariance). Tiling keeps time moving — events age out at the leading edge exactly as they do
 * now, and the next copy arrives at the trailing one.
 *
 * Copy 0 keeps its bare ids, because they reach the DOM as `data-testid="event-arc-<id>"` and are
 * what every existing reference to the fixture names.
 */
export function recurringSampleEvents(
  anchor: Date,
  view: { windowStart: Date; windowEnd: Date }
): ClockEventInput[] {
  return fixtureCopyIndices(anchor, view).flatMap((index) => {
    const shifted = new Date(anchor.getTime() + index * FIXTURE_PERIOD_MINUTES * 60_000);
    return sampleEvents(shifted).map((event) =>
      index === 0 ? event : { ...event, id: `${event.id}@${index}` }
    );
  });
}
