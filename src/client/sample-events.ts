/**
 * Fixture schedule for `?demo=1` and the local preview.
 *
 * Reached only in demo mode, which labels itself on screen — a display showing invented events has
 * to be obviously doing so. It ships to the deployed app on purpose: judging arc legibility means
 * judging it on the smart board, and waiting for the viewer's real day to contain a useful overlap
 * is not a plan.
 *
 * Chosen to exercise what is hardest to judge from a specification — three-deep overlap, a title
 * too long for its arc, an event short enough to need the minimum-width floor, and an event
 * crossing each end of the period.
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
    // Ten minutes, held open by the minimum-span floor.
    { id: "e", title: "📚 Reading", startDate: at(8, 0), endDate: at(8, 10), isAllDay: false, fallbackColor },
    // Long enough to be promoted to a floating label.
    { id: "f", title: "🔵 Parent Teacher Conference Planning Committee", startDate: at(9, 30), endDate: at(10, 40), isAllDay: false, fallbackColor },
    // Title wraps to two lines *and* carries an emoji — the tightest radial case there is.
    { id: "g", title: "🟠 🎂 Reading and Snacks", startDate: at(6, 40), endDate: at(7, 55), isAllDay: false, fallbackColor },
    // Runs on past the period's end, so the dial must not claim it finishes there.
    { id: "y", title: "🟢 Aftercare", startDate: at(11, 5), endDate: at(13, 30), isAllDay: false, fallbackColor },
  ];
}
