import { describe, expect, it, jest } from '@jest/globals';

import type { Segment } from '@/db/schema';
import { segmentOffsets } from '@/utils/segment-window';

// track-metrics reads spacing from the theme, which imports react-native — out of reach for
// this pure-node runner. The mapping only needs the numbers, so stub the spacing scale.
jest.mock('@/constants/theme', () => ({ Spacing: { two: 8, three: 12 } }));
const { msToPx, pxToMs } = require('./track-mapping') as typeof import('./track-mapping');
const { STEP, THUMB_WIDTH } = require('./track-metrics') as typeof import('./track-metrics');

// Minimal Segment factory — only the fields the mapping reads.
const seg = (over: Partial<Segment>): Segment =>
  ({
    id: 'x',
    originalFilename: 'orig.mp4',
    editedFilename: null,
    durationMs: 1000,
    editedDurationMs: null,
    ...over,
  }) as Segment;

const track = (...durations: number[]) =>
  durations.map((durationMs, i) => seg({ id: `s${i}`, durationMs }));

describe('msToPx', () => {
  it('maps the draft start to x 0 and the draft end to the last thumb right edge', () => {
    const segs = track(1000, 500, 2000);
    const offsets = segmentOffsets(segs);
    expect(msToPx(0, segs, offsets)).toBe(0);
    expect(msToPx(3500, segs, offsets)).toBe(2 * STEP + THUMB_WIDTH);
  });

  it('lands a segment boundary exactly on the incoming thumb LEFT edge', () => {
    // The playhead must never park mid-thumb when playback crosses into the next clip.
    const segs = track(1000, 500, 2000);
    const offsets = segmentOffsets(segs);
    expect(msToPx(1000, segs, offsets)).toBe(1 * STEP);
    expect(msToPx(1500, segs, offsets)).toBe(2 * STEP);
  });

  it('maps proportionally within a clip regardless of its duration', () => {
    const segs = track(1000, 4000);
    const offsets = segmentOffsets(segs);
    expect(msToPx(500, segs, offsets)).toBe(THUMB_WIDTH / 2);
    expect(msToPx(1000 + 1000, segs, offsets)).toBe(STEP + THUMB_WIDTH / 4);
  });

  it('skips zero-length clips (failed native reads) instead of landing on them', () => {
    const segs = track(1000, 0, 2000);
    const offsets = segmentOffsets(segs);
    // ms 1000 belongs to s2 (s1 contributes nothing) → third thumb's left edge.
    expect(msToPx(1000, segs, offsets)).toBe(2 * STEP);
  });

  it('returns 0 for an empty draft', () => {
    expect(msToPx(0, [], [])).toBe(0);
  });
});

describe('pxToMs', () => {
  it('maps thumb edges to clip boundaries', () => {
    const segs = track(1000, 500);
    const offsets = segmentOffsets(segs);
    expect(pxToMs(0, segs, offsets)).toBe(0);
    expect(pxToMs(STEP, segs, offsets)).toBe(1000);
    expect(pxToMs(STEP + THUMB_WIDTH, segs, offsets)).toBe(1500);
  });

  it('snaps the gap between thumbs to the preceding clip end', () => {
    const segs = track(1000, 500);
    const offsets = segmentOffsets(segs);
    expect(pxToMs(THUMB_WIDTH + 1, segs, offsets)).toBe(1000);
  });

  it('round-trips with msToPx inside a clip', () => {
    const segs = track(1000, 500, 2000);
    const offsets = segmentOffsets(segs);
    for (const ms of [0, 250, 1000, 1250, 1500, 2500, 3500]) {
      expect(pxToMs(msToPx(ms, segs, offsets), segs, offsets)).toBeCloseTo(ms, 6);
    }
  });

  it('clamps past-the-end positions to the draft end', () => {
    const segs = track(1000);
    const offsets = segmentOffsets(segs);
    expect(pxToMs(10 * STEP, segs, offsets)).toBe(1000);
    expect(pxToMs(0, [], [])).toBe(0);
  });
});
