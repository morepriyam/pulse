import type { Segment } from '@/db/schema';

// The single TS definition of a segment's non-destructive trim window over its original
// file (§1.0c): null trim edges fall back to the clip's natural bounds, and the effective
// duration is the window's length. The SQL in src/db/drafts.ts (`draftListQuery`) mirrors
// these semantics and must stay in sync.

/** The window's in-point (absolute ms into the original file). */
export const inMs = (s: Segment) => s.trimStartMs ?? 0;
/** The window's out-point (absolute ms into the original file). */
export const outMs = (s: Segment) => s.trimEndMs ?? s.durationMs;
/** The window's length — what the clip contributes to the draft's timeline. */
export const effMs = (s: Segment) => Math.max(0, outMs(s) - inMs(s));

/** Draft-global prefix sums: `offsets[i]` = total effective ms before clip `i`. */
export function segmentOffsets(segments: Segment[]): number[] {
  const offsets: number[] = [];
  let acc = 0;
  for (const s of segments) {
    offsets.push(acc);
    acc += effMs(s);
  }
  return offsets;
}

/**
 * Index of the playable segment containing draft-global `ms` — zero-length clips
 * (e.g. `durationMs: 0` from a failed native read) are skipped, never landed on.
 * Returns -1 when no segment is playable.
 */
export function indexAtGlobalMs(segments: Segment[], offsets: number[], ms: number): number {
  let index = -1;
  for (let i = 0; i < segments.length; i++) {
    if (effMs(segments[i]) <= 0) continue;
    if (offsets[i] <= ms) index = i;
    else break;
  }
  return index;
}
