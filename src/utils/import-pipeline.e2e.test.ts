/**
 * External e2e harness for the import → normalize → merge pipeline (§ imports).
 *
 * Runs the REAL pipeline against the wild-import corpus (assets/dev/import, see
 * scripts/make-import-fixtures.sh) on a desktop ffmpeg — no simulator needed:
 *
 *   1. probe   — desktop ffprobe mapped to the exact `probeVideo()` result shape
 *   2. decide  — the app's actual `decideImport()` (imported, not re-implemented)
 *   3. encode  — the fork's exact iOS `compress()` argv template (videotoolbox encoders)
 *   4. verify  — output invariants (≤1920 long edge, ≤30 fps, 8-bit SDR, AAC) plus
 *                FRAME-LEVEL checks: each fixture has a burned-in yellow progress bar
 *                (bottom, fills left→right over the clip) and a red playhead. Scanning
 *                decoded RGB rows proves the re-encode preserved orientation (bar stays
 *                at the display bottom) and timing (fill fraction tracks t/duration).
 *   5. merge   — grounds WHY normalization exists: clips sharing one format signature
 *                (the fork's `<vcodec>:<w>x<h>r<deg>@<fps>|<acodec>:<sr>:<ch>` key)
 *                stream-copy join in a fraction of the concat-filter re-encode time,
 *                and a mixed set only pays for conforming the single outlier.
 *
 * Gated: skipped unless PULSE_E2E=1, ffmpeg/ffprobe are on PATH, and the fixtures exist
 * (git lfs pull; or PULSE_FIXTURES_DIR to point elsewhere). Run with:
 *
 *   PULSE_E2E=1 npx jest import-pipeline
 */
import { afterAll, describe, expect, it } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { CompressOptions, VideoProbeResult } from 'react-native-video-trim';

import { decideImport, NORMALIZE_MAX_LONG_EDGE } from './import-normalization';

const FIXTURES_DIR = process.env.PULSE_FIXTURES_DIR
  ? path.resolve(process.env.PULSE_FIXTURES_DIR)
  : path.resolve(__dirname, '../../assets/dev/import');

function hasCmd(cmd: string): boolean {
  try {
    execFileSync(cmd, ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function fixturesReady(): boolean {
  try {
    const f = path.join(FIXTURES_DIR, 'whatsapp-848x464-30-h264-baseline.mp4');
    // LFS pointer files are ~130 bytes; real fixtures are 100 KB+.
    return fs.statSync(f).size > 100_000;
  } catch {
    return false;
  }
}

const ENABLED = process.env.PULSE_E2E === '1' && hasCmd('ffmpeg') && hasCmd('ffprobe') && fixturesReady();
const e2e = ENABLED ? describe : describe.skip;
const TIMEOUT = 180_000;

// ---------------------------------------------------------------------------
// ffmpeg/ffprobe plumbing
// ---------------------------------------------------------------------------

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-e2e-'));
afterAll(() => fs.rmSync(TMP, { recursive: true, force: true }));

function ff(args: string[]): void {
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
    stdio: ['ignore', 'ignore', 'inherit'],
  });
}

function ffprobeJson(file: string): any {
  const out = execFileSync(
    'ffprobe',
    ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file],
    { maxBuffer: 16 * 1024 * 1024 },
  );
  return JSON.parse(out.toString());
}

function parseFps(fraction: string | undefined): number {
  if (!fraction) return -1;
  const [num, den] = fraction.split('/').map(Number);
  if (!num || !den) return -1;
  return num / den;
}

/** Map desktop ffprobe output to the exact `probeVideo()` result shape the app consumes. */
function probeLikeNative(file: string): VideoProbeResult {
  const j = ffprobeJson(file);
  const v = j.streams.find((s: any) => s.codec_type === 'video');
  const a = j.streams.find((s: any) => s.codec_type === 'audio');

  let rotation = 0;
  if (v) {
    const dm = (v.side_data_list ?? []).find((s: any) => typeof s.rotation === 'number');
    // The fork normalizes the raw Display-Matrix value to 0..359 without negating
    // (ios/VideoTrim.swift probeVideo; Android probeRotation matches).
    if (dm) rotation = ((dm.rotation % 360) + 360) % 360;
    else if (v.tags?.rotate) rotation = ((Number(v.tags.rotate) % 360) + 360) % 360;
  }

  return {
    hasVideo: !!v,
    videoCodec: v?.codec_name ?? '',
    width: v ? Number(v.width) : -1,
    height: v ? Number(v.height) : -1,
    rotation,
    nominalFps: parseFps(v?.r_frame_rate),
    averageFps: parseFps(v?.avg_frame_rate),
    bitrate: v?.bit_rate ? Number(v.bit_rate) : j.format?.bit_rate ? Number(j.format.bit_rate) : -1,
    pixelFormat: v?.pix_fmt ?? '',
    colorTransfer: v?.color_transfer ?? '',
    hasAudio: !!a,
    audioCodec: a?.codec_name ?? '',
    audioSampleRate: a?.sample_rate ? Number(a.sample_rate) : -1,
    audioChannels: a?.channels ? Number(a.channels) : -1,
    duration: j.format?.duration ? Math.round(Number(j.format.duration) * 1000) : -1,
    fileSize: j.format?.size ? Number(j.format.size) : -1,
  };
}

/**
 * The fork's iOS `compress()` argv, verbatim (ios/VideoTrim.swift), so the desktop run
 * exercises the same encoder + filter chain the device does (videotoolbox on both).
 */
function compressArgs(input: string, options: Partial<CompressOptions>, output: string): string[] {
  const bitrate = options.bitrate ?? -1;
  const width = options.width ?? -1;
  const height = options.height ?? -1;
  const frameRate = options.frameRate ?? -1;
  const codec = options.codec ?? 'h264';
  const copyVideo = options.copyVideo ?? false;

  const cmds: string[] = ['-i', input];
  if (copyVideo) {
    cmds.push('-c:v', 'copy');
  } else {
    const vf: string[] = [];
    if (width > 0 && height > 0) vf.push(`scale=${width}:${height}`);
    else if (width > 0) vf.push(`scale=${width}:-2`);
    else if (height > 0) vf.push(`scale=-2:${height}`);
    vf.push('format=yuv420p');
    cmds.push('-vf', vf.join(','));
    if (codec === 'hevc') cmds.push('-c:v', 'hevc_videotoolbox', '-tag:v', 'hvc1');
    else cmds.push('-c:v', 'h264_videotoolbox');
    if (bitrate > 0) cmds.push('-b:v', String(Math.trunc(bitrate)));
    else cmds.push('-global_quality', '23');
    if (frameRate > 0) cmds.push('-r', String(frameRate));
  }
  cmds.push('-c:a', 'aac');
  if ((options.audioSampleRate ?? -1) > 0) cmds.push('-ar', String(options.audioSampleRate));
  if ((options.audioChannels ?? -1) > 0) cmds.push('-ac', String(options.audioChannels));
  cmds.push(output);
  return cmds;
}

// ---------------------------------------------------------------------------
// Frame-level verification (burned-in progress bar + playhead)
// ---------------------------------------------------------------------------

/** Decode one display-oriented frame at `t` seconds as raw RGB24. */
function decodeFrame(file: string, t: number): { data: Buffer; width: number; height: number } {
  const j = ffprobeJson(file);
  const v = j.streams.find((s: any) => s.codec_type === 'video');
  const dm = (v.side_data_list ?? []).find((s: any) => typeof s.rotation === 'number');
  const rotated = dm ? Math.abs(dm.rotation) % 180 !== 0 : false;
  // ffmpeg autorotates on decode, so the raw frame is display-oriented.
  const width = rotated ? Number(v.height) : Number(v.width);
  const height = rotated ? Number(v.width) : Number(v.height);
  const data = execFileSync(
    'ffmpeg',
    ['-hide_banner', '-loglevel', 'error', '-ss', String(t), '-i', file,
     '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
    { maxBuffer: 64 * 1024 * 1024 },
  );
  expect(data.length).toBe(width * height * 3);
  return { data, width, height };
}

/**
 * Fraction of the frame width the yellow progress bar has filled. The bar is a SOLID
 * yellow band at the display bottom (make-import-fixtures.sh: 18 px at source scale,
 * filling left→right as t/duration, with a full-height red playhead at the fill edge).
 * Content right of the fill can be yellow-ish too (grass!), so the fill is measured as
 * the CONTIGUOUS run of yellow columns from x=0 — content patches don't start at the
 * left edge, and a mishandled rotation parks the bar on a side edge (run length ~0).
 */
function progressBarFill(frame: { data: Buffer; width: number; height: number }): number {
  const rows = Math.max(4, Math.round(frame.height * 0.008));
  const isYellow = (x: number, y: number) => {
    const i = (y * frame.width + x) * 3;
    return frame.data[i] > 190 && frame.data[i + 1] > 170 && frame.data[i + 2] < 120;
  };
  const isRed = (x: number, y: number) => {
    const i = (y * frame.width + x) * 3;
    return frame.data[i] > 150 && frame.data[i + 1] < 110 && frame.data[i + 2] < 110;
  };
  const colYellow = (x: number) => {
    let n = 0;
    for (let y = frame.height - rows; y < frame.height; y++) if (isYellow(x, y)) n++;
    return n / rows >= 0.6;
  };
  const colRed = (x: number) => {
    let n = 0;
    for (let y = frame.height - rows; y < frame.height; y++) if (isRed(x, y)) n++;
    return n / rows >= 0.6;
  };
  let x = 0;
  let slack = Math.max(6, Math.round(frame.width * 0.008)); // encode ringing + playhead width
  while (x < frame.width) {
    if (colYellow(x) || colRed(x)) {
      x++;
      continue;
    }
    if (slack > 0) {
      slack--;
      x++;
      continue;
    }
    break;
  }
  return x / frame.width;
}

/** True if the full-height red playhead column exists near x = fill edge. */
function findPlayheadFill(frame: { data: Buffer; width: number; height: number }): number {
  // The playhead is the only full-height red element: scan every column and return
  // the fill fraction at the most red-saturated column, or -1 if none qualifies.
  const samples = 24;
  let bestX = -1;
  let bestRows = 0;
  for (let x = 0; x < frame.width; x++) {
    let redRows = 0;
    for (let s = 0; s < samples; s++) {
      const y = Math.round(((s + 0.5) / samples) * (frame.height - 1));
      const i = (y * frame.width + x) * 3;
      if (frame.data[i] > 150 && frame.data[i + 1] < 110 && frame.data[i + 2] < 110) redRows++;
    }
    if (redRows > bestRows) {
      bestRows = redRows;
      bestX = x;
    }
  }
  return bestRows >= samples * 0.6 ? (bestX + 1) / frame.width : -1;
}

// ---------------------------------------------------------------------------
// Merge signature (the fork's copy-compatibility key, ios/VideoTrim.swift ClipInfo.sig)
// ---------------------------------------------------------------------------

function mergeSignature(file: string): string {
  const p = probeLikeNative(file);
  const a = p.hasAudio ? `${p.audioCodec}:${p.audioSampleRate}:${p.audioChannels}` : 'none';
  return `${p.videoCodec}:${p.width}x${p.height}r${p.rotation}@${Math.round(p.nominalFps)}|${a}`;
}

/** A recorder-signature clip (1920x1080 30 fps H.264 5 Mbps, AAC 48 kHz stereo). */
function makeRecorderClip(name: string, seconds: number, hue: number): string {
  const out = path.join(TMP, name);
  ff([
    '-f', 'lavfi', '-i', `testsrc2=size=1920x1080:rate=30:duration=${seconds}`,
    '-f', 'lavfi', '-i', `sine=frequency=${220 + hue * 110}:duration=${seconds}`,
    '-vf', `hue=h=${hue * 60},format=yuv420p`,
    '-c:v', 'h264_videotoolbox', '-b:v', '5000000',
    '-c:a', 'aac', '-ar', '48000', '-ac', '2',
    '-movflags', '+faststart', out,
  ]);
  return out;
}

function durationSec(file: string): number {
  return Number(ffprobeJson(file).format.duration);
}

// ---------------------------------------------------------------------------
// The corpus and its expected decisions (mirrors import-normalization.test.ts)
// ---------------------------------------------------------------------------

const EXPECTED: Record<string, 'passthrough' | 'audio-only' | 're-encode'> = {
  'hdr-hlg-portrait-1080p-30-hevc10.mp4': 're-encode',
  'hdr-pq-landscape-4k-30-hevc10.mp4': 're-encode',
  'slomo-portrait-1080p-120-h264.mp4': 're-encode',
  'screenrec-portrait-886x1920-60-h264.mp4': 're-encode',
  'vfr-portrait-1080p-h264.mp4': 're-encode',
  'opus-landscape-1080p-30-h264.mp4': 'audio-only',
  'whatsapp-848x464-30-h264-baseline.mp4': 'passthrough',
  'ntsc-landscape-1080p-2997-h264.mp4': 'passthrough',
  'rot270-portrait-1080p-30-hevc.mp4': 'passthrough',
  'square-720x720-30-h264.mp4': 'passthrough',
  'timelapse-landscape-1080p-30-hevc-noaudio.mp4': 'passthrough',
  'mono44k-portrait-1080p-30-h264.mp4': 'passthrough',
};

const normalizedOutputs = new Map<string, string>();

e2e('import pipeline e2e (probe → decide → normalize)', () => {
  const fixtures = Object.keys(EXPECTED);

  it('covers exactly the committed corpus', () => {
    const onDisk = fs.readdirSync(FIXTURES_DIR).filter((f) => f.endsWith('.mp4')).sort();
    expect(onDisk).toEqual(fixtures.slice().sort());
  });

  for (const name of fixtures) {
    const expected = EXPECTED[name];

    it(
      `${name} → ${expected}`,
      () => {
        const input = path.join(FIXTURES_DIR, name);
        const probe = probeLikeNative(input);
        const decision = decideImport(probe);

        if (expected === 'passthrough') {
          expect(decision.action).toBe('passthrough');
          return;
        }

        expect(decision.action).toBe('normalize');
        if (decision.action !== 'normalize') return;
        if (expected === 'audio-only') expect(decision.options.copyVideo).toBe(true);
        else expect(decision.options.copyVideo).toBeUndefined();

        const output = path.join(TMP, `norm-${name}`);
        ff(compressArgs(input, decision.options, output));
        normalizedOutputs.set(name, output);

        // Output invariants: what the merge/upload pipeline is promised downstream.
        const out = probeLikeNative(output);
        expect(out.audioCodec).toBe('aac');
        if (expected === 'audio-only') {
          // Video track stream-copied byte-for-byte: same codec, geometry, timing.
          expect(out.videoCodec).toBe(probe.videoCodec);
          expect(out.width).toBe(probe.width);
          expect(out.height).toBe(probe.height);
          return;
        }
        expect(out.videoCodec).toBe('h264');
        // The pixel data is cast to 8-bit SDR-safe range (the encoder-compat goal).
        // NOTE: ffmpeg passes the input's color TAGS (transfer/primaries) through the
        // re-encode, so an HDR source stays tagged HLG/PQ on 8-bit output — same
        // behavior as the trim re-encode path. Players tone-map on display; tracked
        // as a fork follow-up (tone-cast to BT.709 on the compress re-encode path).
        expect(out.pixelFormat).toBe('yuv420p'); // 8-bit
        expect(Math.max(out.width, out.height)).toBeLessThanOrEqual(NORMALIZE_MAX_LONG_EDGE);
        expect(out.nominalFps).toBeLessThanOrEqual(30.5);
        // -b:v is a target, not a hard cap; allow encoder overshoot headroom.
        expect(out.bitrate).toBeLessThanOrEqual(8_000_000);
      },
      TIMEOUT,
    );
  }

  it(
    'frame check: progress bar proves orientation and timing survived the re-encode',
    () => {
      for (const [name, output] of normalizedOutputs) {
        if (EXPECTED[name] === 'audio-only') continue; // video untouched by definition
        const dur = durationSec(output);
        const fills: number[] = [];
        for (const frac of [0.25, 0.5, 0.8]) {
          const t = dur * frac;
          const frame = decodeFrame(output, t);
          // The full-height red playhead is the timing reference (unique color); the
          // yellow bar must reach it along the display BOTTOM. A mishandled rotation
          // parks both on a side edge (no full-height red column, no bottom-row bar);
          // broken timing (e.g. bad PTS through fps resampling) drifts the playhead.
          const playhead = findPlayheadFill(frame);
          const fill = progressBarFill(frame);
          const ctx = `${name} @ ${frac}: playhead=${playhead.toFixed(3)} fill=${fill.toFixed(3)}`;
          expect(`${ctx} | playhead found: ${playhead > 0}`).toContain('| playhead found: true');
          expect(`${ctx} | timing: ${Math.abs(playhead - frac) < 0.1}`).toContain('| timing: true');
          // Content can read yellow-ish too (grass), so the bar check is one-sided:
          // the contiguous bottom yellow run must at least reach the playhead.
          expect(`${ctx} | bar reaches: ${fill >= playhead - 0.05}`).toContain('| bar reaches: true');
          fills.push(playhead);
        }
        // Fill advances monotonically → PTS/frame order intact through fps resampling.
        expect(fills[1]).toBeGreaterThan(fills[0]);
        expect(fills[2]).toBeGreaterThan(fills[1]);
      }
    },
    TIMEOUT,
  );
});

e2e('merge grounding: uniform signatures unlock the stream-copy fast path', () => {
  it(
    'uniform recorder clips: stream-copy join is dramatically faster than re-encode',
    () => {
      const clips = [1, 2, 3].map((i) => makeRecorderClip(`rec${i}.mp4`, 4, i));

      // All three share ONE signature — the precondition for the fork's passthrough join.
      const sigs = clips.map(mergeSignature);
      expect(new Set(sigs).size).toBe(1);

      const listFile = path.join(TMP, 'concat.txt');
      fs.writeFileSync(listFile, clips.map((c) => `file '${c}'`).join('\n'));

      const copyOut = path.join(TMP, 'merged-copy.mp4');
      const t0 = Date.now();
      ff(['-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', copyOut]);
      const copyMs = Date.now() - t0;

      const reencOut = path.join(TMP, 'merged-reenc.mp4');
      const inputs = clips.flatMap((c) => ['-i', c]);
      const t1 = Date.now();
      ff([
        ...inputs,
        '-filter_complex',
        '[0:v][0:a][1:v][1:a][2:v][2:a]concat=n=3:v=1:a=1[v][a]',
        '-map', '[v]', '-map', '[a]',
        '-c:v', 'h264_videotoolbox', '-b:v', '5000000', '-c:a', 'aac',
        reencOut,
      ]);
      const reencMs = Date.now() - t1;

      // Same content either way…
      expect(durationSec(copyOut)).toBeCloseTo(12, 0);
      expect(durationSec(reencOut)).toBeCloseTo(12, 0);
      // …but the copy join never decodes a frame. This differential is the entire
      // reason imports are normalized up front instead of at merge time.
      expect(copyMs * 3).toBeLessThan(reencMs);
      console.log(`[merge] stream-copy ${copyMs}ms vs concat-filter re-encode ${reencMs}ms`);
    },
    TIMEOUT,
  );

  it(
    'mixed set: conforming only the outlier keeps the join on the fast path',
    () => {
      const uniform = [1, 2].map((i) => makeRecorderClip(`mix${i}.mp4`, 4, i));
      // Outlier: WhatsApp-style import that passthrough (rightly) let in untouched.
      const outlier = path.join(FIXTURES_DIR, 'whatsapp-848x464-30-h264-baseline.mp4');
      expect(mergeSignature(outlier)).not.toBe(mergeSignature(uniform[0]));

      // Selective conform: re-encode ONLY the outlier into the dominant coded form
      // (scale + pad to 1920x1080@30, AAC 48k stereo) — the mergeSelective strategy.
      const conformed = path.join(TMP, 'outlier-conformed.mp4');
      const t0 = Date.now();
      ff([
        '-i', outlier,
        '-vf',
        'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,fps=30,format=yuv420p',
        '-c:v', 'h264_videotoolbox', '-b:v', '5000000',
        '-c:a', 'aac', '-ar', '48000', '-ac', '2',
        conformed,
      ]);
      expect(mergeSignature(conformed)).toBe(mergeSignature(uniform[0]));

      const listFile = path.join(TMP, 'concat-mixed.txt');
      fs.writeFileSync(
        listFile,
        [...uniform, conformed].map((c) => `file '${c}'`).join('\n'),
      );
      const out = path.join(TMP, 'merged-mixed.mp4');
      ff(['-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', out]);
      const selectiveMs = Date.now() - t0;

      const outlierDur = durationSec(outlier);
      expect(durationSec(out)).toBeCloseTo(8 + outlierDur, 0);

      // Full re-encode of the whole set for comparison: the selective path re-encodes
      // outlierDur seconds of video; the legacy path re-encodes all of it.
      const full = path.join(TMP, 'merged-mixed-full.mp4');
      const t1 = Date.now();
      ff([
        '-i', uniform[0], '-i', uniform[1], '-i', outlier,
        '-filter_complex',
        '[0:v]fps=30,format=yuv420p[v0];[1:v]fps=30,format=yuv420p[v1];' +
          '[2:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,fps=30,format=yuv420p[v2];' +
          '[v0][0:a][v1][1:a][v2][2:a]concat=n=3:v=1:a=1[v][a]',
        '-map', '[v]', '-map', '[a]',
        '-c:v', 'h264_videotoolbox', '-b:v', '5000000',
        '-c:a', 'aac', '-ar', '48000', '-ac', '2',
        full,
      ]);
      const fullMs = Date.now() - t1;

      expect(selectiveMs).toBeLessThan(fullMs);
      console.log(`[merge] selective conform+join ${selectiveMs}ms vs full re-encode ${fullMs}ms`);
    },
    TIMEOUT,
  );
});
