import { describe, expect, it } from '@jest/globals';

import type { Segment } from '@/db/schema';

import { buildBeatManifest } from './beat-manifest';

// Minimal Segment factory — beat-manifest only reads id + effective duration.
const seg = (id: string, durationMs: number): Segment =>
  ({
    id,
    originalFilename: `${id}.mp4`,
    editedFilename: null,
    durationMs,
    editedDurationMs: null,
  }) as Segment;

describe('buildBeatManifest', () => {
  it('emits contiguous beats that sum exactly to the true merged duration', () => {
    const clips = [seg('a', 4000), seg('b', 7000), seg('c', 5000)]; // Σ effMs = 16000
    const trueDurationMs = 16000;
    const { beats, durationMs, version, type } = buildBeatManifest(clips, trueDurationMs);

    expect(version).toBe(1);
    expect(type).toBe('beat-manifest');
    expect(durationMs).toBe(16000);
    expect(beats.map((b) => b.segmentId)).toEqual(['a', 'b', 'c']);
    expect(beats.map((b) => b.order)).toEqual([0, 1, 2]);
    // Head pinned to 0, contiguous, tail pinned to the true duration.
    expect(beats[0].startMs).toBe(0);
    expect(beats[0].endMs).toBe(beats[1].startMs);
    expect(beats[1].endMs).toBe(beats[2].startMs);
    expect(beats[beats.length - 1].endMs).toBe(trueDurationMs);
  });

  it('reconciles drift: scales boundaries to the real merged duration and snaps the tail', () => {
    const clips = [seg('a', 4000), seg('b', 6000)]; // Σ effMs = 10000
    // Real merged file came out 200ms longer than the sum of the clip durations.
    const { beats, durationMs } = buildBeatManifest(clips, 10200);
    expect(durationMs).toBe(10200);
    expect(beats[0].startMs).toBe(0);
    // 4000 * (10200/10000) = 4080
    expect(beats[0].endMs).toBe(4080);
    expect(beats[1].startMs).toBe(4080);
    expect(beats[1].endMs).toBe(10200); // tail snapped exactly, no rounding gap
  });

  it('single-clip draft: one beat spanning the whole duration (no merge, k = 1)', () => {
    const { beats, durationMs } = buildBeatManifest([seg('only', 8000)], 8000);
    expect(durationMs).toBe(8000);
    expect(beats).toHaveLength(1);
    expect(beats[0]).toMatchObject({ segmentId: 'only', order: 0, startMs: 0, endMs: 8000 });
  });

  it('no clips: empty beats, zero duration', () => {
    const { beats } = buildBeatManifest([], 0);
    expect(beats).toEqual([]);
  });
});
