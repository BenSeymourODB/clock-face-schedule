export {
  INK_HEIGHT_RATIO,
  TITLE_EDGE_CLEARANCE,
  TITLE_FONT_SIZE_RATIO,
  TITLE_LINE_OFFSET_RATIO,
  TITLE_RADIUS_RATIO,
  TWO_LINE_MIN_SPAN_DEGREES,
  computeArcTitleLayout,
  fitDurationLine,
  type ArcTitleLayout
} from './arc-title-layout';
export {
  SWATCH_GAP,
  SWATCH_RESERVE,
  SWATCH_WIDTH,
  cardSwatchLayout,
  type CardSwatchLayout
} from './card-swatch';
export {
  clampLabelPosition,
  faceClearanceLimit,
  labelVerticalBand,
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
  normaliseAngle,
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
  fitLabelToClearedWidth,
  fitLabelToWidth,
  labelCardHeight,
  labelLineOffsets,
  type ClearedLabelLayout,
  type LabelLayout
} from './fit-label';
export { arcCharBudget, fitTitleToArc, type FitTitleResult } from './fit-title';
export {
  planOptionalLines,
  type GrowthOffer,
  type GrowthPlan
} from './grow-labels';
export {
  LABEL_MARGIN_KNEE_UNITS,
  PANEL_RESERVE_UNITS,
  labelMarginUnits,
  type DrawingBox
} from './label-margin';
export {
  PANEL_CARD_FONT_SIZE,
  PANEL_CARD_GAP,
  PANEL_CARD_MAX_TITLE_LINES,
  PANEL_CARD_PADDING,
  PANEL_CARD_STROKE,
  PANEL_WIDTH_UNITS,
  agendaEntries,
  panelFitsBoard,
  planAgendaCards,
  type AgendaCard,
  type AgendaCardPlan,
  type AgendaEntry,
  type PanelBoard
} from './panel-layout';
export {
  CHAR_WIDTH_RATIO,
  charBudget,
  normaliseText,
  packLines,
  textWidth,
  type FitTextResult
} from './pack-lines';
export { rectEdgeIntersection, rectsOverlap, type Rect } from './rect-edge';
export {
  displaceVertically,
  overlapComponents,
  type VerticalBand
} from './stack-labels';
export {
  ONE_HOUR_SCALE,
  TWELVE_HOUR_SCALE,
  dialOrigin,
  DIAL_SCALES,
  dialScale,
  dialWindow,
  parseDialScaleId,
  type DialScale,
  type DialScaleId
} from './scale';
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
