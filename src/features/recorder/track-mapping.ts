import type { Segment } from '@/db/schema';
import { clamp } from '@/utils/math';
import { effMs, indexAtGlobalMs } from '@/utils/segment-window';
import { STEP, THUMB_WIDTH } from './track-metrics';

// Pure px ↔ ms mapping for the segment track. Thumbs are fixed-width, so each thumb maps
// proportionally onto its segment's effective (trimmed) duration; gap positions between
// thumbs snap to the preceding clip's end (see pxToMs — `local` is clamped to THUMB_WIDTH).
// Extracted from the playhead cursor so the math is unit-testable without the
// Reanimated/gesture machinery around it.

/** Draft-global ms → x in track-content coordinates. */
export function msToPx(globalMs: number, segments: Segment[], offsets: number[]): number {
  const i = indexAtGlobalMs(segments, offsets, globalMs);
  if (i < 0) return 0;
  const eff = effMs(segments[i]);
  const frac = eff > 0 ? clamp((globalMs - offsets[i]) / eff, 0, 1) : 0;
  return i * STEP + frac * THUMB_WIDTH;
}

/** x in track-content coordinates → draft-global ms (gaps snap to the thumb's end). */
export function pxToMs(x: number, segments: Segment[], offsets: number[]): number {
  const i = clamp(Math.floor(x / STEP), 0, segments.length - 1);
  if (!segments[i]) return 0;
  const local = clamp(x - i * STEP, 0, THUMB_WIDTH);
  return offsets[i] + (local / THUMB_WIDTH) * effMs(segments[i]);
}
