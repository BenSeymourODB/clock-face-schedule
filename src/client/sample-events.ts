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
 * time after load, the fixture will gradually scroll out of view on a display left running for
 * hours — acceptable for a legibility check at load time, tracked as a known limitation for a
 * longer-running demo in #62.
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
    // Runs on past the window's end, so the dial must not claim it finishes there.
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
 * **Anchored once, at load.** #62 records this for the 12-hour fixture; here it bites far harder,
 * because the window is 55 minutes rather than eleven hours. The elapsed and feathered case walks
 * out of view about three minutes in, the draining event about thirty, and the dial is empty
 * inside the hour while still captioned "Sample events". Fine for the legibility check this exists
 * for, which is made standing in front of the board; not fine for a display left in demo mode, and
 * that is #62's to fix for both fixtures rather than this one's to solve twice.
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
