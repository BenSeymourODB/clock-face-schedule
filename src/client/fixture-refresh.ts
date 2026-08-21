/**
 * The demo fixture's refresh loop.
 *
 * Lives outside `main.ts` so the clock it reads is a parameter rather than a free variable. That is
 * the whole of its correctness condition — #80 was filed because #79's recurrence read `new Date()`
 * while #75's pin held the dial's clock still, and nothing in either suite could fail on the
 * combination.
 */
import {
  type ClockEventInput,
  type ClockPin,
  type DialScaleId,
  type TimeSource,
  dialScale,
  dialWindow
} from "../shared/clock";
import { fixtureAnchor } from "./clock-pin";
import { demoFixture, fixtureCopyIndices, recurringSampleEvents } from "./sample-events";

export interface FixtureRefreshOptions {
  /** Which dial scale is being drawn — it picks the fixture and sizes the window (#34). */
  scale: DialScaleId;
  /** The pin, which decides where the fixture is anchored rather than which clock is read. */
  pin: ClockPin | null;
  /** The dial's own clock. Read on every refresh, and the reason this function takes arguments. */
  now: TimeSource;
  setEvents: (events: ClockEventInput[]) => void;
}

/**
 * A function to call on each poll, which hands the dial the fixture copies now in view.
 *
 * The window keeps moving after load, so a single copy of the fixture scrolls out of it and the dial
 * empties (#62). The clock re-filters what it holds against the live window on every render, so the
 * scrolling needs no help — this only hands it copies it has not been given, and only when the set
 * changes, since `setEvents` redraws every arc.
 *
 * Reads the clock the way the tick does, and must go on doing so: #72's `?now` / `?freeze` routes
 * every time read through one seam, and a frozen clock has to freeze the copy set too. Reading real
 * time here while the dial drew a pinned window would walk the copies out of that window and leave
 * it blank — after about thirteen hours on the 12-hour dial, and inside two on the 1-hour one.
 *
 * Both the fixture and the window it is tiled across come from the scale (#34). The 1-hour dial is
 * what makes this recurrence load-bearing rather than a nicety: its window is 55 minutes, so a
 * single copy loses its elapsed arc within three minutes, is down to one arc by fifty, and is empty
 * at seventy — where the 12-hour one takes about thirteen hours to go blank.
 */
export function fixtureRefresher({ scale, pin, now, setEvents }: FixtureRefreshOptions): () => void {
  const fixture = demoFixture(scale);
  // Once, at load. A per-refresh anchor would re-seat the fixture on the moving window, which is
  // the "freeze the picture instead" answer #62 rejected: nothing would ever elapse or drain (#76).
  const anchor = fixtureAnchor(pin, now(), scale);
  /** Null rather than "", which is what an empty copy list would join to. */
  let emitted: string | null = null;

  return function refresh(): void {
    const view = dialWindow(now(), dialScale(scale));
    const copies = fixtureCopyIndices(fixture, anchor, view).join(",");
    if (copies === emitted) return;
    emitted = copies;
    setEvents(recurringSampleEvents(fixture, anchor, view));
  };
}
