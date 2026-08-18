export {
  TITLE_FONT_SIZE_RATIO,
  TITLE_RADIUS_RATIO,
  TWO_LINE_MIN_SPAN_DEGREES,
  computeArcTitleLayout,
  type ArcTitleLayout
} from './arc-title-layout';
export {
  clampLabelPosition,
  faceClearanceLimit,
  labelWidthLimit,
  type ClockBox
} from './clamp-label';
export {
  calculateArcAngles,
  calculateTrueArcAngles,
  describeArc,
  elapsedEventIds,
  eventsToClockEvents,
  filterEventsForPeriod,
  getDayStart,
  getFetchWindow,
  getPeriodBounds,
  getPeriodStart,
  parseEventTitle,
  polarToCartesian,
  roundCoord
} from './clock-utils';
export { readableTextColor, relativeLuminance } from './contrast';
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
export { fitTitleToArc, type FitTitleResult } from './fit-title';
export {
  CHAR_WIDTH_RATIO,
  charBudget,
  normaliseText,
  packLines,
  textWidth,
  type FitTextResult
} from './pack-lines';
export { rectEdgeIntersection } from './rect-edge';
export { assignRings, type RingAssignment, type RingCandidate } from './ring-layout';
export { describeTextArc } from './text-arc';
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
