import type { CompressOptions, VideoProbeResult } from 'react-native-video-trim';

/**
 * Import normalization policy (§ imports).
 *
 * Recordings are pinned (1080p30 H.264 MP4, 5 Mbps — see use-recorder.ts), so the merge
 * engine's fast path only has to cope with what imports bring in. Rather than re-encoding
 * every import (slow, lossy, usually pointless), only inputs that are *hostile* to the
 * FFmpeg merge/upload pipeline are normalized:
 *
 * - exotic video codecs (not H.264/HEVC) — no hardware decode guarantee, merge fallback only
 * - 10-bit / HDR (HLG, PQ) — hardware H.264 encoders reject 10-bit input; SDR displays
 *   need the tone cast anyway once clips are mixed with SDR recordings
 * - display long edge > 1920 — 4K imports inflate every downstream artifact (merge output,
 *   upload) for no visible gain in a 1080p pipeline
 * - frame rate > NORMALIZE_MAX_FPS — 60/120 fps sources (slo-mo, screen recordings) double+
 *   the merge re-encode cost; 29.97 NTSC passes untouched
 * - bitrate far above the recorder's own — e.g. raw 4K masters; bounded to the recorder rate
 * - non-AAC audio (Opus, etc.) — not MP4-muxable by stream copy; conformed audio-only with
 *   the video track untouched when the video is otherwise fine
 *
 * Everything else passes through byte-for-byte (Photos "Passthrough" export), keeping
 * imports instant and lossless. Small mismatches (odd resolutions, rotation, mono audio)
 * are the merge engine's selective-conform job, not the importer's.
 */

/** Long-edge cap matching the recorder's 1920x1080 output. */
export const NORMALIZE_MAX_LONG_EDGE = 1920;
/** Frame-rate ceiling: passes 29.97/30 with margin, catches 40+ (VFR averages, 60, 120). */
export const NORMALIZE_MAX_FPS = 33;
/** Re-encode target: the recorder's own frame rate. */
export const NORMALIZE_TARGET_FPS = 30;
/** Re-encode target: the recorder's own bitrate (5 Mbps, see use-recorder.ts). */
export const NORMALIZE_TARGET_BITRATE = 5_000_000;
/** Sources above this keep their size advantage from a re-encode; ~1.6x recorder rate. */
export const NORMALIZE_MAX_BITRATE = 8_000_000;

/** Video codecs the merge pipeline handles natively (hardware decode on both platforms). */
const NATIVE_VIDEO_CODECS = new Set(['h264', 'hevc']);
/** HDR transfer functions: HLG (iPhone camera default) and PQ (HDR10 / Dolby Vision 8.x). */
const HDR_TRANSFERS = new Set(['arib-std-b67', 'smpte2084']);

export type ImportDecision =
  | { action: 'passthrough' }
  | { action: 'normalize'; options: Partial<CompressOptions>; reasons: string[] };

/** True for 10-bit pixel formats (yuv420p10le, p010le, ...). */
function is10Bit(pixelFormat: string): boolean {
  return pixelFormat.includes('10');
}

/** Effective fps for the decision: average when known (catches VFR), else nominal. */
function effectiveFps(probe: VideoProbeResult): number {
  return probe.averageFps > 0 ? probe.averageFps : probe.nominalFps;
}

/** Display (post-rotation) dimensions: a 90/270 rotation swaps coded width/height. */
function displaySize(probe: VideoProbeResult): { width: number; height: number } {
  const swapped = probe.rotation % 180 !== 0;
  return {
    width: swapped ? probe.height : probe.width,
    height: swapped ? probe.width : probe.height,
  };
}

/**
 * Decide how an imported clip enters the draft: byte-for-byte passthrough, an audio-only
 * conform (video stream-copied), or a full re-encode bounded to the recorder's signature.
 * Pure — feed it a `probeVideo()` result; see module docs for the policy.
 */
export function decideImport(probe: VideoProbeResult): ImportDecision {
  if (!probe.hasVideo) return { action: 'passthrough' };

  const reasons: string[] = [];

  if (!NATIVE_VIDEO_CODECS.has(probe.videoCodec)) {
    reasons.push(`video codec ${probe.videoCodec || 'unknown'}`);
  }
  if (is10Bit(probe.pixelFormat)) {
    reasons.push(`10-bit pixel format ${probe.pixelFormat}`);
  }
  if (HDR_TRANSFERS.has(probe.colorTransfer)) {
    reasons.push(`HDR transfer ${probe.colorTransfer}`);
  }

  const display = displaySize(probe);
  const longEdge = Math.max(display.width, display.height);
  const needsDownscale = longEdge > NORMALIZE_MAX_LONG_EDGE;
  if (needsDownscale) {
    reasons.push(`${display.width}x${display.height} exceeds ${NORMALIZE_MAX_LONG_EDGE}`);
  }

  const fps = effectiveFps(probe);
  const needsFpsCap = fps > NORMALIZE_MAX_FPS;
  if (needsFpsCap) {
    reasons.push(`${Math.round(fps)} fps exceeds ${NORMALIZE_MAX_FPS}`);
  }

  if (probe.bitrate > NORMALIZE_MAX_BITRATE) {
    reasons.push(`${Math.round(probe.bitrate / 1_000_000)} Mbps exceeds ${NORMALIZE_MAX_BITRATE / 1_000_000}`);
  }

  const audioHostile = probe.hasAudio && probe.audioCodec !== 'aac';

  if (reasons.length === 0) {
    if (audioHostile) {
      // Video is fine — conform only the audio track (e.g. Opus → AAC) and
      // stream-copy the video, so the re-encode cost is audio-sized.
      return {
        action: 'normalize',
        options: { copyVideo: true },
        reasons: [`audio codec ${probe.audioCodec}`],
      };
    }
    return { action: 'passthrough' };
  }

  if (audioHostile) {
    reasons.push(`audio codec ${probe.audioCodec}`);
  }

  const options: Partial<CompressOptions> = {
    bitrate: NORMALIZE_TARGET_BITRATE,
    frameRate: NORMALIZE_TARGET_FPS,
  };
  if (needsDownscale) {
    // FFmpeg auto-rotates before filters, so scale against display orientation:
    // cap the long edge, let the short edge follow the aspect ratio (-2).
    if (display.width >= display.height) {
      options.width = NORMALIZE_MAX_LONG_EDGE;
    } else {
      options.height = NORMALIZE_MAX_LONG_EDGE;
    }
  }

  return { action: 'normalize', options, reasons };
}
