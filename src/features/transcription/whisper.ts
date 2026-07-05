import { deleteFile, extractAudio } from 'react-native-video-trim';
import { initWhisper, type WhisperContext } from 'whisper.rn';

import { groupWordsIntoLines } from './group-lines';
import { ensureModel, modelFileUri } from './model';
import type { WhisperModel } from './models';
import type { TranscriptResult } from './transcript';
import { hasSpeech } from './vad';

// Re-exported so the many existing `from './whisper'` imports of these keep working; the definitions
// now live in the native-free `transcript.ts` so they can be unit-tested without the whisper.rn/
// react-native-video-trim native deps this module pulls in.
export type { TranscriptLine, TranscriptResult, TranscriptWord } from './transcript';
export { parseTranscriptLines } from './transcript';

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
// Bumped on every release. An in-flight `loadContext` captures the value at the start of its async
// work and, after building its context, refuses to install it if the generation has moved on — so a
// model switch/delete (`releaseWhisper` + `deleteModelsExcept`) can never leave `current` pointing
// at a context whose weights were deleted out from under it.
let generation = 0;

// `maxLen: 1` makes whisper emit one segment per word, each with its own t0/t1 — the only way
// whisper.rn surfaces word-level timing (its result exposes segments, not tokens). We then fold
// those words back into caption-sized lines ourselves (see group-lines.ts), which gives both
// word-level timing (for karaoke highlighting) and readable, standards-sized cues.
const WORD_PER_SEGMENT = 1;

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
  generation++; // invalidate any in-flight load so it can't resurrect `current` after this returns
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
  // Wait out any in-flight load in a LOOP: a resumed waiter must re-check both
  // exits, otherwise two callers waiting on the same load would both proceed to
  // start their own — duplicate loads where the loser's context (hundreds of MB
  // of native memory) is overwritten in `current` without ever being released.
  for (;;) {
    if (current?.id === model.id) return current.ctx;
    if (!loadPromise) break;
    await loadPromise.catch(() => {});
  }

  const promise = (async () => {
    // Snapshot SYNCHRONOUSLY — the IIFE body runs synchronously up to its first
    // await, so nothing can bump `generation` before this line. A releaseWhisper()
    // landing during any of the awaits below moves `generation` past this value
    // and the post-init check discards the stale context. (Capturing after the
    // teardown await would leave a window where a release lands first and the
    // snapshot reads the already-bumped value, silently passing the guard.)
    const gen = generation;

    // Free the previously-loaded (different-model) context inline — not via
    // releaseWhisper(), which would bump `generation` and immediately invalidate
    // the load we're about to start.
    const prev = current?.ctx ?? null;
    current = null;
    await prev?.release().catch(() => {});

    await ensureModel(model); // no-op if already on disk
    const ctx = await initContext(modelFileUri(model));
    if (gen !== generation) {
      // A model switch/delete raced this load; the weights may already be gone.
      // Free what we built and fail this load rather than caching a stale context.
      await ctx.release().catch(() => {});
      throw new Error('whisper model load superseded by a model switch/delete');
    }
    current = { id: model.id, ctx };
    return ctx;
  })();
  loadPromise = promise;
  try {
    return await promise;
  } finally {
    // Clear only our own promise — releaseWhisper() or a newer load may have
    // replaced `loadPromise` while we were settling; nulling theirs would let a
    // third caller start yet another duplicate load.
    if (loadPromise === promise) loadPromise = null;
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
  options?: { onProgress?: (progress: number) => void; signal?: AbortSignal },
): Promise<TranscriptResult> {
  const { onProgress, signal } = options ?? {};
  const { outputPath: wavPath } = await extractAudio(videoUri, { outputExt: 'wav' });
  try {
    // Pre-gate on voice activity: silent/noise-only clips make Whisper hallucinate (the
    // multilingual model emits Chinese on noise, or canned subtitle credits on silence). Skip
    // Whisper entirely and store an empty transcript so the clip settles instead of re-running.
    if (await isSilent(wavPath)) return EMPTY_TRANSCRIPT;

    const ctx = await loadContext(model);
    // `tokenTimestamps` is what lets `maxLen` split output by token; with `maxLen: 1` we get one
    // word per segment (with per-word t0/t1), then regroup into caption lines ourselves.
    // `language` honors the model: 'en' for the English-only models, 'auto' for the multilingual one.
    //
    // Speed knobs for the on-device hot path (captions, not subtitling a film):
    // - `maxThreads`: whisper.rn defaults to 2–4; modern iPhones have 6 cores, so let inference use
    //   them. whisper.cpp clamps to what's actually available, so over-asking on a 4-core device is
    //   safe.
    // - `beamSize: 1` + `bestOf: 1`: greedy, single-candidate decoding. Beam search / multi-candidate
    //   sampling is the slow default; the quality delta on clear speech is negligible for captions.
    const { stop, promise } = ctx.transcribe(wavPath, {
      language: model.lang,
      maxLen: WORD_PER_SEGMENT,
      tokenTimestamps: true,
      maxThreads: 6,
      beamSize: 1,
      bestOf: 1,
      onProgress,
    });
    // Cancellation (export screen left, or the run superseded by a clip change): stop the native
    // inference so it stops contending with a new recording/transcription AND so a later
    // `releaseWhisper()` (model switch/delete) can't free the context out from under a live call.
    const onAbort = () => void stop().catch(() => {});
    signal?.addEventListener('abort', onAbort);
    try {
      const result = await promise;
      return {
        language: result.language,
        text: result.result.trim(),
        lines: groupWordsIntoLines(result.segments),
      };
    } finally {
      signal?.removeEventListener('abort', onAbort);
    }
  } finally {
    await deleteFile(wavPath).catch(() => {});
  }
}
