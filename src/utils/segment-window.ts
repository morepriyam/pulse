import type { Segment } from '@/db/schema';

// Draft-global timeline math for the in-recorder preview. Under the destructive-edit model
// each clip plays its EFFECTIVE file in full — the re-encoded `editedFilename` once edited,
// else the pristine `originalFilename` — so there is no in/out window: in = 0, out =
// effective duration. The SQL in src/db/drafts.ts (`draftListQuery`) mirrors `effMs`.

/** The clip's effective media file (edited if present, else the original). */
export const effFile = (s: Segment) => s.editedFilename ?? s.originalFilename;
/** In-point — always 0 (the file is already physically trimmed). */
export const inMs = (_s: Segment) => 0;
/** Out-point = the effective file's full duration. */
export const outMs = (s: Segment) => s.editedDurationMs ?? s.durationMs;
/** What the clip contributes to the draft's timeline. */
export const effMs = (s: Segment) => Math.max(0, outMs(s) - inMs(s));

/**
 * Stable signature of a segment set's effective files, in order. Changes on add/remove/reorder
 * and on any destructive edit (which swaps `effFile`). Used as the merge cache key (`useExport`)
 * and the merged-transcript staleness key (`draft_transcripts.signature`) so both invalidate in
 * lockstep when the merged timeline moves.
 */
export const segmentSignature = (segments: Segment[]): string => segments.map(effFile).join('|');

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
