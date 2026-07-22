import { describe, expect, it } from '@jest/globals';
import type { VideoProbeResult } from 'react-native-video-trim';

import {
  decideImport,
  NORMALIZE_MAX_LONG_EDGE,
  NORMALIZE_TARGET_BITRATE,
  NORMALIZE_TARGET_FPS,
} from './import-normalization';

// Real probeVideo() values from the wild-import corpus in assets/dev/import/
// (see assets/dev/README.md), captured with ffprobe against the committed
// fixtures. Names match the fixture files.
function probe(overrides: Partial<VideoProbeResult>): VideoProbeResult {
  return {
    hasVideo: true,
    videoCodec: 'h264',
    width: 1920,
    height: 1080,
    rotation: 0,
    nominalFps: 30,
    averageFps: 30,
    bitrate: 3_000_000,
    pixelFormat: 'yuv420p',
    colorTransfer: 'bt709',
    hasAudio: true,
    audioCodec: 'aac',
    audioSampleRate: 48000,
    audioChannels: 2,
    duration: 8000,
    fileSize: 3_000_000,
    ...overrides,
  };
}

const FIXTURES: Record<string, VideoProbeResult> = {
  'hdr-hlg-portrait-1080p-30-hevc10': probe({
    videoCodec: 'hevc',
    rotation: 90,
    bitrate: 895_086,
    pixelFormat: 'yuv420p10le',
    colorTransfer: 'arib-std-b67',
  }),
  'hdr-pq-landscape-4k-30-hevc10': probe({
    videoCodec: 'hevc',
    width: 3840,
    height: 2160,
    bitrate: 1_701_365,
    pixelFormat: 'yuv420p10le',
    colorTransfer: 'smpte2084',
  }),
  'mono44k-portrait-1080p-30-h264': probe({
    rotation: 90,
    bitrate: 2_155_971,
    audioSampleRate: 44100,
    audioChannels: 1,
  }),
  'ntsc-landscape-1080p-2997-h264': probe({
    nominalFps: 29.97,
    averageFps: 29.97,
    bitrate: 3_166_876,
  }),
  'opus-landscape-1080p-30-h264': probe({
    bitrate: 4_551_683,
    audioCodec: 'opus',
  }),
  'rot270-portrait-1080p-30-hevc': probe({
    videoCodec: 'hevc',
    rotation: 270,
    bitrate: 433_528,
  }),
  'screenrec-portrait-886x1920-60-h264': probe({
    width: 886,
    height: 1920,
    nominalFps: 60,
    averageFps: 60,
    bitrate: 1_218_503,
  }),
  'slomo-portrait-1080p-120-h264': probe({
    rotation: 90,
    nominalFps: 120,
    averageFps: 120,
    bitrate: 850_255,
  }),
  'square-720x720-30-h264': probe({
    width: 720,
    height: 720,
    bitrate: 890_283,
  }),
  'timelapse-landscape-1080p-30-hevc-noaudio': probe({
    videoCodec: 'hevc',
    bitrate: 3_037_944,
    hasAudio: false,
    audioCodec: '',
    audioSampleRate: -1,
    audioChannels: -1,
  }),
  'vfr-portrait-1080p-h264': probe({
    width: 1080,
    height: 1920,
    nominalFps: 60,
    averageFps: 40,
    bitrate: 2_224_619,
  }),
  'whatsapp-848x464-30-h264-baseline': probe({
    width: 848,
    height: 464,
    bitrate: 745_736,
    audioSampleRate: 44100,
  }),
};

describe('decideImport against the wild-import fixture corpus', () => {
  it.each([
    'mono44k-portrait-1080p-30-h264',
    'ntsc-landscape-1080p-2997-h264',
    'rot270-portrait-1080p-30-hevc',
    'square-720x720-30-h264',
    'timelapse-landscape-1080p-30-hevc-noaudio',
    'whatsapp-848x464-30-h264-baseline',
  ])('%s passes through untouched', (name) => {
    expect(decideImport(FIXTURES[name])).toEqual({ action: 'passthrough' });
  });

  it('opus audio gets an audio-only conform with the video stream-copied', () => {
    const d = decideImport(FIXTURES['opus-landscape-1080p-30-h264']);
    expect(d).toEqual({
      action: 'normalize',
      options: { copyVideo: true },
      reasons: ['audio codec opus'],
    });
  });

  it.each([
    ['hdr-hlg-portrait-1080p-30-hevc10', ['10-bit', 'HDR transfer arib-std-b67']],
    ['hdr-pq-landscape-4k-30-hevc10', ['10-bit', 'HDR transfer smpte2084']],
    ['screenrec-portrait-886x1920-60-h264', ['60 fps']],
    ['slomo-portrait-1080p-120-h264', ['120 fps']],
    ['vfr-portrait-1080p-h264', ['40 fps']],
  ])('%s is re-encoded (%p)', (name, expectedReasons) => {
    const d = decideImport(FIXTURES[name]);
    expect(d.action).toBe('normalize');
    if (d.action !== 'normalize') return;
    expect(d.options.copyVideo).toBeUndefined();
    expect(d.options.bitrate).toBe(NORMALIZE_TARGET_BITRATE);
    expect(d.options.frameRate).toBe(NORMALIZE_TARGET_FPS);
    for (const fragment of expectedReasons) {
      expect(d.reasons.join('; ')).toContain(fragment);
    }
  });

  it('4K landscape is capped on width; portrait/1080p sources are not scaled', () => {
    const fourK = decideImport(FIXTURES['hdr-pq-landscape-4k-30-hevc10']);
    expect(fourK.action).toBe('normalize');
    if (fourK.action === 'normalize') {
      expect(fourK.options.width).toBe(NORMALIZE_MAX_LONG_EDGE);
      expect(fourK.options.height).toBeUndefined();
    }

    const hlg = decideImport(FIXTURES['hdr-hlg-portrait-1080p-30-hevc10']);
    expect(hlg.action).toBe('normalize');
    if (hlg.action === 'normalize') {
      expect(hlg.options.width).toBeUndefined();
      expect(hlg.options.height).toBeUndefined();
    }
  });
});

describe('decideImport edge cases beyond the corpus', () => {
  it('audio-less files with fine video pass through', () => {
    expect(decideImport(probe({ hasAudio: false, audioCodec: '' }))).toEqual({
      action: 'passthrough',
    });
  });

  it('audio-only files (no video stream) pass through', () => {
    expect(decideImport(probe({ hasVideo: false, videoCodec: '' })).action).toBe('passthrough');
  });

  it('exotic video codecs are re-encoded', () => {
    const d = decideImport(probe({ videoCodec: 'vp9' }));
    expect(d.action).toBe('normalize');
    if (d.action === 'normalize') {
      expect(d.reasons.join('; ')).toContain('vp9');
    }
  });

  it('excessive bitrate alone triggers a re-encode', () => {
    const d = decideImport(probe({ bitrate: 45_000_000 }));
    expect(d.action).toBe('normalize');
    if (d.action === 'normalize') {
      expect(d.options.bitrate).toBe(NORMALIZE_TARGET_BITRATE);
    }
  });

  it('hostile audio on a hostile video is folded into the full re-encode', () => {
    const d = decideImport(probe({ averageFps: 60, nominalFps: 60, audioCodec: 'opus' }));
    expect(d.action).toBe('normalize');
    if (d.action === 'normalize') {
      expect(d.options.copyVideo).toBeUndefined();
      expect(d.reasons.join('; ')).toContain('audio codec opus');
    }
  });

  it('portrait 4K (rotated coded-landscape) is capped on height', () => {
    const d = decideImport(probe({ width: 3840, height: 2160, rotation: 90 }));
    expect(d.action).toBe('normalize');
    if (d.action === 'normalize') {
      expect(d.options.height).toBe(NORMALIZE_MAX_LONG_EDGE);
      expect(d.options.width).toBeUndefined();
    }
  });

  it('unknown fps (probe -1) does not trigger the fps rule', () => {
    expect(decideImport(probe({ nominalFps: -1, averageFps: -1 }))).toEqual({
      action: 'passthrough',
    });
  });

  it('unknown bitrate (probe -1) does not trigger the bitrate rule', () => {
    expect(decideImport(probe({ bitrate: -1 }))).toEqual({ action: 'passthrough' });
  });

  it('8-bit chroma-subsampling formats with "10" in the name are not treated as 10-bit', () => {
    // yuv410p/yuv411p are 8-bit 4:1:0 / 4:1:1 — only a 10/10le/10be depth suffix means 10-bit.
    expect(decideImport(probe({ pixelFormat: 'yuv410p' }))).toEqual({ action: 'passthrough' });
    expect(decideImport(probe({ pixelFormat: 'yuv411p' }))).toEqual({ action: 'passthrough' });
  });

  it('10-bit depth suffixes are still caught (be as well as le, and biplanar p010)', () => {
    for (const pixelFormat of ['yuv420p10le', 'yuv420p10be', 'p010le']) {
      const d = decideImport(probe({ pixelFormat }));
      expect(d.action).toBe('normalize');
      if (d.action === 'normalize') expect(d.reasons).toContain(`10-bit pixel format ${pixelFormat}`);
    }
  });
});
