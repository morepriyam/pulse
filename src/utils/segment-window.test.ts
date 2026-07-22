import { describe, expect, it } from '@jest/globals';

import type { Segment } from '@/db/schema';
import { effFile, effMs, indexAtGlobalMs, segmentOffsets, segmentSignature } from './segment-window';

// Minimal Segment factory — only the fields the timeline math reads.
const seg = (over: Partial<Segment>): Segment =>
  ({
    id: 'x',
    originalFilename: 'orig.mp4',
    editedFilename: null,
    durationMs: 1000,
    editedDurationMs: null,
    ...over,
  }) as Segment;

describe('effFile / effMs', () => {
  it('uses the edited file and duration when present, else the original', () => {
    expect(effFile(seg({ editedFilename: 'edit.mp4' }))).toBe('edit.mp4');
    expect(effFile(seg({ editedFilename: null }))).toBe('orig.mp4');
    expect(effMs(seg({ durationMs: 1000, editedDurationMs: 400 }))).toBe(400);
    expect(effMs(seg({ durationMs: 1000, editedDurationMs: null }))).toBe(1000);
  });

  it('never reports a negative contribution', () => {
    expect(effMs(seg({ durationMs: -50, editedDurationMs: null }))).toBe(0);
  });
});

describe('segmentOffsets', () => {
  it('produces prefix sums of effective durations', () => {
    const segs = [seg({ durationMs: 1000 }), seg({ durationMs: 500 }), seg({ durationMs: 2000 })];
    expect(segmentOffsets(segs)).toEqual([0, 1000, 1500]);
  });
});

describe('segmentSignature', () => {
  it('changes when a segment gains an edit or when a re-edit lands at a new revision path', () => {
    const pristine = [seg({ id: 'a' }), seg({ id: 'b' })];
    const edited = [seg({ id: 'a', editedFilename: 'a.edited.100.mp4' }), seg({ id: 'b' })];
    const reEdited = [seg({ id: 'a', editedFilename: 'a.edited.200.mp4' }), seg({ id: 'b' })];

    expect(segmentSignature(edited)).not.toBe(segmentSignature(pristine));
    // Every edit writes a distinct revision-stamped file, so replacing an existing edit must
    // also produce a new signature — this is what invalidates merge/transcript/preview caches.
    expect(segmentSignature(reEdited)).not.toBe(segmentSignature(edited));
  });

  it('is stable when nothing changed', () => {
    const a = [seg({ id: 'a', editedFilename: 'a.edited.100.mp4' })];
    const b = [seg({ id: 'a', editedFilename: 'a.edited.100.mp4' })];
    expect(segmentSignature(a)).toBe(segmentSignature(b));
  });
});

describe('indexAtGlobalMs', () => {
  const segs = [seg({ durationMs: 1000 }), seg({ durationMs: 500 }), seg({ durationMs: 2000 })];
  const offsets = segmentOffsets(segs); // [0, 1000, 1500]

  it('maps a global position to the containing clip', () => {
    expect(indexAtGlobalMs(segs, offsets, 0)).toBe(0);
    expect(indexAtGlobalMs(segs, offsets, 999)).toBe(0);
    expect(indexAtGlobalMs(segs, offsets, 1000)).toBe(1);
    expect(indexAtGlobalMs(segs, offsets, 1600)).toBe(2);
  });

  it('skips zero-length clips and never lands on them', () => {
    const withZero = [seg({ durationMs: 1000 }), seg({ durationMs: 0 }), seg({ durationMs: 2000 })];
    const offs = segmentOffsets(withZero); // [0, 1000, 1000]
    expect(indexAtGlobalMs(withZero, offs, 1000)).toBe(2);
  });
});
