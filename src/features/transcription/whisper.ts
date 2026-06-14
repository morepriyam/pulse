import { deleteFile, extractAudio } from 'react-native-video-trim';
import { initWhisper, type WhisperContext } from 'whisper.rn';

import { ensureModel, modelFileUri } from './model';
import type { WhisperModel } from './models';
import { hasSpeech } from './vad';

/**
 * One transcribed line. `t0`/`t1` are whisper.cpp timestamps in **centiseconds** (1/100s)
 * relative to the clip's audio start — divide by 100 for seconds when rendering.
 */
export type TranscriptLine = { text: string; t0: number; t1: number };

export type TranscriptResult = {
  language: string;
  text: string;
  lines: TranscriptLine[];
};

/** A clip with no detected speech: a settled, empty transcript (no captions, never re-run). */
const EMPTY_TRANSCRIPT: TranscriptResult = { language: '', text: '', lines: [] };

/**
 * Whether the clip has no speech worth transcribing. Runs the VAD pre-gate; if the VAD itself is
 * unavailable (e.g. its model hasn't downloaded yet offline) we fail **open** — assume speech and
 * let Whisper run — so a VAD hiccup never silently drops real captions.
 */
async function isSilent(wavPath: string): Promise<boolean> {
  try {
    return !(await hasSpeech(wavPath));
  } catch {
    return false;
  }
}

// A Whisper context is expensive to create (loads the weights into memory) and is reusable across
// clips, so we hold a single instance, tagged with the model it was built from. Switching models
// releases the old context before loading the new one.
let current: { id: string; ctx: WhisperContext } | null = null;
let loadPromise: Promise<WhisperContext> | null = null;

// Cap on a single caption line's length (characters). Whisper emits whole utterances as one
// segment; splitting to caption-sized chunks (requires token timestamps) gives short, readable
// lines that sync tightly with playback instead of one long paragraph.
const CAPTION_MAX_LEN = 42;

/**
 * Build a Whisper context, preferring on-device acceleration. `useGpu` runs inference on the
 * Metal GPU (iOS) — several times faster and far lighter on battery than the CPU path — with
 * Flash Attention on top. Older devices / simulators without a usable GPU throw on init, so we
 * fall back to the plain CPU context rather than failing transcription outright.
 */
async function initContext(filePath: string): Promise<WhisperContext> {
  try {
    return await initWhisper({ filePath, useGpu: true, useFlashAttn: true });
  } catch {
    return initWhisper({ filePath });
  }
}

/** Free the active Whisper context (e.g. on model switch / delete). Re-loads lazily on next use. */
export async function releaseWhisper(): Promise<void> {
  loadPromise = null;
  const ctx = current?.ctx ?? null;
  current = null;
  await ctx?.release();
}

/**
 * Get a Whisper context for `model`, loading (and downloading, if needed) on first use and
 * swapping the context when the selected model changes. Idempotent for the already-loaded model.
 */
async function loadContext(model: WhisperModel): Promise<WhisperContext> {
  if (current?.id === model.id) return current.ctx;
  if (loadPromise) await loadPromise.catch(() => {});
  if (current?.id === model.id) return current.ctx;

  loadPromise = (async () => {
    await releaseWhisper();
    await ensureModel(model); // no-op if already on disk
    const ctx = await initContext(modelFileUri(model));
    current = { id: model.id, ctx };
    return ctx;
  })();
  try {
    return await loadPromise;
  } finally {
    loadPromise = null;
  }
}

/**
 * Transcribe a single video clip's audio on-device with the given model.
 *
 * Pipeline: extract the audio track to a 16-bit PCM WAV via react-native-video-trim (FFmpegKit's
 * default WAV codec is pcm_s16le, exactly what whisper.cpp wants), then run Whisper — which
 * auto-resamples to 16kHz and downmixes to mono. The temp WAV is removed afterwards. The model
 * is expected to be downloaded already (the manager handles the download phase); if not, it is
 * fetched here as a fallback.
 *
 * @param videoUri absolute file URI to the clip (the effective edited-or-original file).
 */
export async function transcribeVideo(
  videoUri: string,
  model: WhisperModel,
  onProgress?: (progress: number) => void,
): Promise<TranscriptResult> {
  const { outputPath: wavPath } = await extractAudio(videoUri, { outputExt: 'wav' });
  try {
    // Pre-gate on voice activity: silent/noise-only clips make Whisper hallucinate (the
    // multilingual model emits Chinese on noise, or canned subtitle credits on silence). Skip
    // Whisper entirely and store an empty transcript so the clip settles instead of re-running.
    if (await isSilent(wavPath)) return EMPTY_TRANSCRIPT;

    const ctx = await loadContext(model);
    // `tokenTimestamps` is what lets `maxLen` split a long utterance into caption-sized lines.
    // `language` honors the model: 'en' for the English-only models, 'auto' for the multilingual one.
    //
    // Speed knobs for the on-device hot path (captions, not subtitling a film):
    // - `maxThreads`: whisper.rn defaults to 2–4; modern iPhones have 6 cores, so let inference use
    //   them. whisper.cpp clamps to what's actually available, so over-asking on a 4-core device is
    //   safe.
    // - `beamSize: 1` + `bestOf: 1`: greedy, single-candidate decoding. Beam search / multi-candidate
    //   sampling is the slow default; the quality delta on clear speech is negligible for captions.
    const { promise } = ctx.transcribe(wavPath, {
      language: model.lang,
      maxLen: CAPTION_MAX_LEN,
      tokenTimestamps: true,
      maxThreads: 6,
      beamSize: 1,
      bestOf: 1,
      onProgress,
    });
    const result = await promise;
    return {
      language: result.language,
      text: result.result.trim(),
      lines: result.segments.map((s) => ({ text: s.text, t0: s.t0, t1: s.t1 })),
    };
  } finally {
    await deleteFile(wavPath).catch(() => {});
  }
}
