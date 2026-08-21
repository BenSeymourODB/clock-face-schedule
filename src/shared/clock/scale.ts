/**
 * The dial's time scale: how many minutes one revolution is worth, where that revolution's zero
 * sits, and how much of it either side of `now` is drawn.
 *
 * A clock face carries two scales at once — the hour hand's 12-hour revolution and the minute
 * hand's 1-hour one — but the event band has only ever used the outer one, at 0.5° per minute
 * (#32). At that resolution a 20-minute event and a 40-minute event differ by 10°, about the gap
 * between two minute ticks, and a classroom day is mostly sub-hour events. The 1-hour scale runs
 * the same band at 6° per minute instead.
 *
 * Both scales stay drawn in either mode; only the emphasis moves. That is what keeps the dial
 * honest about the time while still saying which scale it is currently about.
 */
import {
  ROLLING_WINDOW_LOOKAHEAD_HOURS,
  ROLLING_WINDOW_LOOKBEHIND_HOURS,
  getPeriodStart
} from './clock-utils';

/** Minutes in an hour, spelled out where it is a unit conversion rather than a duration. */
const MINUTES_PER_HOUR = 60;

const MS_PER_MINUTE = 60 * 1000;

export type DialScaleId = '12h' | '1h';

export interface DialScale {
  id: DialScaleId;
  /** Minutes in one full revolution — what `angleForTime` divides by. */
  periodMinutes: number;
  /** Minutes the drawn window reaches behind `now`. */
  lookbehindMinutes: number;
  /** Minutes the drawn window reaches ahead of `now`. */
  lookaheadMinutes: number;
}

/** The dial as it has always been: a 12-hour revolution, showing #25's rolling window. */
export const TWELVE_HOUR_SCALE: DialScale = {
  id: '12h',
  periodMinutes: 12 * MINUTES_PER_HOUR,
  lookbehindMinutes: ROLLING_WINDOW_LOOKBEHIND_HOURS * MINUTES_PER_HOUR,
  lookaheadMinutes: ROLLING_WINDOW_LOOKAHEAD_HOURS * MINUTES_PER_HOUR
};

/**
 * A 60-minute revolution, showing 5 minutes back and 50 ahead.
 *
 * **Not the literal next hour.** Centring the window on `now` would spend half of it on time that
 * has passed; taking the whole hour ahead would leave a just-finished event with nowhere to fade
 * out. Five minutes of look-behind is enough to see what has only just ended — which is what a
 * room asks about when it asks "are we late" — and the other 50 go where the question usually
 * points.
 *
 * The two sum to 55 minutes, so the band spans **330°** and leaves the same 30° gap #25 arrived at
 * independently for the 12-hour view. The window track therefore reads identically in both modes,
 * which is worth keeping rather than a coincidence to tidy away.
 */
export const ONE_HOUR_SCALE: DialScale = {
  id: '1h',
  periodMinutes: MINUTES_PER_HOUR,
  lookbehindMinutes: 5,
  lookaheadMinutes: 50
};

/**
 * Every scale the dial has, keyed by id.
 *
 * Exported so a caller can enumerate the scales rather than list them — a hand-written list is how
 * a new scale gets past a check written for the old ones, and the `DialScaleId` union forces an
 * entry here for every scale that exists. `event-arc.test.ts` iterates it to hold #58's
 * feather/drain clearance, which is a function of `lookbehindMinutes`, across whatever scales the
 * dial grows.
 */
export const DIAL_SCALES: Record<DialScaleId, DialScale> = {
  '12h': TWELVE_HOUR_SCALE,
  '1h': ONE_HOUR_SCALE
};

export function dialScale(id: DialScaleId): DialScale {
  return DIAL_SCALES[id];
}

/**
 * Read a scale id off untrusted input — a URL parameter or a stored preference.
 *
 * Anything unrecognised falls back to the 12-hour dial rather than throwing. A wall display that
 * refuses to render because someone mistyped a query string has failed worse than one showing the
 * default scale.
 */
export function parseDialScaleId(raw: string | null | undefined): DialScaleId {
  return raw === '1h' ? '1h' : '12h';
}

/**
 * The angle origin for a scale: the timestamp that sits at 12 o'clock, 0°.
 *
 * Fixed to the clock rather than to `now`, in both modes, which is what keeps constraint 1 of the
 * two-time-scales brainstorm — an arc is drawn where the hands will point at its time. On the
 * 12-hour scale that is the AM/PM period boundary; on the 1-hour scale it is the top of the
 * containing hour, so minute 0 lands at twelve o'clock and the minute hand's own angle *is* the
 * angle of `now` on the band.
 */
export function dialOrigin(time: Date, scale: DialScale): Date {
  if (scale.id === '1h') {
    const hourStart = new Date(time);
    hourStart.setMinutes(0, 0, 0);
    return hourStart;
  }

  return getPeriodStart(time);
}

/**
 * The window the dial draws at this scale: `lookbehindMinutes` behind `time`, `lookaheadMinutes`
 * ahead of it.
 *
 * Rolls continuously with `time` in both modes. Note the window and the origin need not agree and
 * usually do not — the window is what events are clamped and filtered to, the origin is only where
 * 0° is, and every window here wraps past its origin's revolution rather than being reduced modulo
 * 360 (#33).
 */
export function dialWindow(time: Date, scale: DialScale): { windowStart: Date; windowEnd: Date } {
  return {
    windowStart: new Date(time.getTime() - scale.lookbehindMinutes * MS_PER_MINUTE),
    windowEnd: new Date(time.getTime() + scale.lookaheadMinutes * MS_PER_MINUTE)
  };
}
