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
/** Left inset of the track content so the playhead knob at globalMs=0 (centered on the line at
 *  the first thumb's left edge) isn't clipped by the viewport's overflow:hidden. The cursor adds
 *  the same inset to its x so the line stays aligned with the thumbnails. */
export const SCRUB_INSET = KNOB / 2;
/** Vertical breathing room added inside the scroll content (top + bottom) so the active thumb
 *  can scale up by ACTIVE_SCALE without being clipped by the ScrollView's bounds. The playhead
 *  line shifts down by this much to stay on the thumb's top edge. */
export const POP_LANE = 6;
/** How much the thumb the playhead is currently over pops up. 64pt thumb × 0.035 ≈ 2pt, half
 *  each side — fits within POP_LANE. */
export const ACTIVE_SCALE = 1.035;
