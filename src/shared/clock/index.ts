export {
  TITLE_FONT_SIZE_RATIO,
  TITLE_LINE_OFFSET_RATIO,
  TITLE_RADIUS_RATIO,
  TWO_LINE_MIN_SPAN_DEGREES,
  computeArcTitleLayout,
  fitDurationLine,
  type ArcTitleLayout
} from './arc-title-layout';
export {
  clampLabelPosition,
  faceClearanceLimit,
  labelWidthLimit,
  type ClockBox
} from './clamp-label';
export {
  ROLLING_WINDOW_LOOKAHEAD_HOURS,
  ROLLING_WINDOW_LOOKBEHIND_HOURS,
  angleForTime,
  calculateArcAngles,
  calculateTrueArcAngles,
  combineTitleWithEmoji,
  describeArc,
  elapsedEventIds,
  eventsToClockEvents,
  filterEventsForPeriod,
  getDayStart,
  getFetchWindow,
  getPeriodBounds,
  getPeriodStart,
  getRollingWindow,
  hasEventInProgress,
  parseEventTitle,
  polarToCartesian,
  roundCoord
} from './clock-utils';
export {
  adjustCompositeForContrast,
  adjustForContrast,
  compositeOver,
  contrastRatio,
  readableTextColor,
  relativeLuminance,
  textFlipCoverage
} from './contrast';
export { formatEventDuration } from './duration';
// `emoji.ts` is deliberately absent. Its consumers — `clock-utils`, `pack-lines`, `fit-label` —
// are all inside this directory and import it directly, and re-exporting the pattern here put a
// top-level `new RegExp` in the barrel that esbuild would not tree-shake, carrying the whole
// sequence string into the *server* bundle even though `parseEventTitle` is dropped there.
export {
  computeDrainFraction,
  computeDrainMasks,
  computeDrainTextSplit,
  type DrainMasks,
  type OccludedSpan
} from './drain';
export {
  FEATHER_DEGREES,
  FEATHER_MAX_SPAN_RATIO,
  computeArcFeathers,
  type ArcFeathers,
  type FeatherSpan
} from './feather';
export {
  LINE_HEIGHT_RATIO,
  fitLabelToWidth,
  labelCardHeight,
  labelLineOffsets,
  type LabelLayout
} from './fit-label';
export { arcCharBudget, fitTitleToArc, type FitTitleResult } from './fit-title';
export {
  CHAR_WIDTH_RATIO,
  charBudget,
  normaliseText,
  packLines,
  textWidth,
  type FitTextResult
} from './pack-lines';
export { rectEdgeIntersection, rectsOverlap, type Rect } from './rect-edge';
export { assignRings, type RingAssignment, type RingCandidate } from './ring-layout';
export { describeTextArc } from './text-arc';
export {
  createTimeSource,
  describeClockPin,
  describePinnedInstant,
  parseClockPin,
  type ClockPin,
  type TimeSource
} from './time-source';
export {
  drainEdgeDegrees,
  effectiveShowSeconds,
  elapsedSeconds,
  pauseTimer,
  remainingBandCount,
  remainingSeconds,
  resumeTimer,
  shouldPlayCompletionCue,
  startTimer,
  stopTimer,
  tick,
  type TimerCompletionReason,
  type TimerState,
  type TimerStatus
} from './timer';
export type {
  ArcAngles,
  ClampedArcAngles,
  ClockEvent,
  ClockEventInput,
  ParsedEventTitle
} from './types';
