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
    // Overlaps nothing — should keep the whole band despite the cluster above. Ends 80 minutes
    // before "g" starts, deliberately, so the stretch between them is empty *and inside* the
    // window — the one stress case the window-track (#25) exists to distinguish from the gap.
    { id: "d", title: "🟡 🍽️ Lunch", startDate: at(4, 30), endDate: at(5, 20), isAllDay: false, fallbackColor },
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
    // Ends at 10:20 rather than 10:40 to open the slot "j" needs; still 25° of arc against a
    // 47-unit title, so it overflows onto a card exactly as before.
    { id: "f", title: "🔵 👩‍🏫 Parent Teacher Conference Planning Committee", startDate: at(9, 30), endDate: at(10, 20), isAllDay: false, fallbackColor },
    // Title wraps to two lines *and* carries an emoji — inline, so the wrap has to place the
    // glyph as part of the text rather than on its own radial line.
    { id: "g", title: "🟠 🎂 Reading and Snacks", startDate: at(6, 40), endDate: at(7, 55), isAllDay: false, fallbackColor },
    // A run of emoji, which must wrap as one token rather than scattering a glyph per line. Sited
    // in the clear gap between "Reading" and the conference so it does not deepen the cluster above.
    // The run is space-free after the first glyph, which is the worst case for the width heuristic:
    // only the *leading* emoji is stripped, so 🪀🎈 stay adjacent inside cleanTitle, and a line of
    // pure emoji gets none of the slack that over-charged plain characters usually provide.
    { id: "h", title: "🟣 🧸 🪀🎈 Free Play", startDate: at(8, 20), endDate: at(9, 25), isAllDay: false, fallbackColor },
    // Twenty minutes with a four-character title: 10° of arc against a three-character budget on a
    // lone ring, so it overflows onto a label whose duration line ("20 min", 6 units) is *wider*
    // than its title (4). Every other card here has a title wider than its duration, so nothing
    // else exercises a card that has to size itself to the trailing line rather than the text
    // (#35). Must stay a lone arc to do its job: on a two-deep ring the smaller font gives a
    // 7-character budget, "Yoga" fits, and there is no card at all.
    //
    // Sited immediately after the conference, so it also stresses #30 — the two cards are the
    // closest pair on the dial now that both carry a duration line.
    { id: "j", title: "🔵 Yoga", startDate: at(10, 20), endDate: at(10, 40), isAllDay: false, fallbackColor },
    // Runs on past the window's end, so the dial must not claim it finishes there.
    { id: "y", title: "🟢 Aftercare", startDate: at(10, 50), endDate: at(13, 15), isAllDay: false, fallbackColor },
  ];
}
