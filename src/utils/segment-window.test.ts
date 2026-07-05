import { describe, expect, it } from '@jest/globals';

import type { Segment } from '@/db/schema';

import { effFile, effMs, indexAtGlobalMs, segmentOffsets } from './segment-window';

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
