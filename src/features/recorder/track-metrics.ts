import { Spacing } from '@/constants/theme';

// Single source of truth for the segment-track geometry, shared by the segment bar
// (layout) and the playhead cursor (px ↔ ms mapping). The bar's Sortable.Grid MUST use
// TRACK_GAP as its columnGap — the cursor mapping assumes slot i starts at i * STEP.

export const THUMB_HEIGHT = 64;
export const THUMB_WIDTH = 48;
export const TRACK_GAP = Spacing.two;
/** Record-button diameter + its gap above the bar — shared so the drag-to-trash button can
 *  sit exactly where the record button is (clean swap as one fades out and the other in). */
export const RECORD_BUTTON_SIZE = 76;
export const RECORD_BAR_GAP = Spacing.three;
/** Horizontal rhythm of the track: one thumb + the grid's column gap. */
export const STEP = THUMB_WIDTH + TRACK_GAP;
/** Extra lane below the thumbs the cursor knob hangs into (keeps it off taps/✕/drag). */
export const SCRUB_LANE = 16;
export const KNOB = 14;
