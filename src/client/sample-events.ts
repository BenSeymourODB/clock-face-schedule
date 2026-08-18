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
 * each end of the period, a floating label washed with a colour the palette itself fails contrast
 * for once filled (⚫, #26/#27), and a card whose duration line is wider than its title (#35).
 */
import type { ClockEventInput } from "../shared/clock";

export function sampleEvents(periodStart: Date): ClockEventInput[] {
  const at = (hours: number, minutes: number) =>
    new Date(periodStart.getTime() + (hours * 60 + minutes) * 60_000).toISOString();
  const fallbackColor = "#3b82f6";

  return [
    // Already running when the period began — its leading end is the period's, not the event's.
    { id: "z", title: "⚪ Breakfast Club", startDate: at(-1, 10), endDate: at(0, 20), isAllDay: false, fallbackColor },
    // Three deep between 01:00 and 02:00.
    { id: "a", title: "🟢 🎮 Game Time", startDate: at(0, 30), endDate: at(2, 0), isAllDay: false, fallbackColor },
    { id: "b", title: "🔴 Deadline", startDate: at(1, 0), endDate: at(3, 0), isAllDay: false, fallbackColor },
    { id: "c", title: "🟣 Study", startDate: at(1, 30), endDate: at(2, 30), isAllDay: false, fallbackColor },
    // Overlaps nothing — should keep the whole band despite the cluster above.
    { id: "d", title: "🟡 🍽️ Lunch", startDate: at(4, 30), endDate: at(6, 30), isAllDay: false, fallbackColor },
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
    // Twenty minutes with a four-character title: 10° of arc against a three-character budget, so
    // it overflows onto a label whose duration line ("20 min", 6 units) is *wider* than its title
    // (4). Every other card here has a title wider than its duration, so nothing else exercises a
    // card that has to size itself to the trailing line rather than the text (#35).
    //
    // Sited immediately after the conference, so it also stresses #30: the two cards sit 4.36 units
    // apart vertically, down from 28.7 before both grew a duration line. Nothing overlaps, but the
    // margin is now thin enough to see, which is the point of having it on screen.
    { id: "j", title: "🔵 Yoga", startDate: at(10, 40), endDate: at(11, 0), isAllDay: false, fallbackColor },
    // Runs on past the period's end, so the dial must not claim it finishes there.
    { id: "y", title: "🟢 Aftercare", startDate: at(11, 5), endDate: at(13, 30), isAllDay: false, fallbackColor },
  ];
}
