import { Directory, File, Paths } from 'expo-file-system';
import { initWhisperVad, type WhisperVadContext } from 'whisper.rn';

/**
 * Voice-activity-detection pre-gate for transcription.
 *
 * Whisper hallucinates on clips with no real speech: the multilingual model especially emits
 * Chinese on noise (auto language-detection falls back to its training prior) or canned subtitle
 * credits on silence ("Thank you for watching", "Gracias por ver"). whisper.rn 0.6.0 doesn't
 * expose the whisper.cpp no-speech / logprob / entropy thresholds that would suppress this, so we
 * run a Silero VAD pass first and skip Whisper entirely on clips with no detected speech.
 *
 * The VAD model is a tiny (~865 KB) Silero GGML build hosted in the `ggml-org/whisper-vad` repo
 * (the speech models live in `ggerganov/whisper.cpp` — silero is no longer mirrored there). It
 * lives under `vad/` — NOT `models/` — so the single-speech-model-on-disk cleanup
 * (`deleteModelsExcept`) never wipes it on a model switch.
 */
const VAD_URL = 'https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v6.2.0.bin';
const VAD_FILENAME = 'ggml-silero-v6.2.0.bin';
// Completeness floor for a partial/interrupted download (the real file is ~865 KB).
const VAD_MIN_BYTES = 512 * 1024;

function vadDir(): Directory {
  return new Directory(Paths.document, 'vad');
}

function vadFile(): File {
  return new File(Paths.document, 'vad', VAD_FILENAME);
}

function isVadModelReady(): boolean {
  const file = vadFile();
  return file.exists && (file.size ?? 0) >= VAD_MIN_BYTES;
}

/** Ensure the Silero VAD model is on disk, downloading it on first use. Returns its file URI. */
async function ensureVadModel(): Promise<string> {
  const file = vadFile();
  if (isVadModelReady()) return file.uri;

  if (file.exists) file.delete(); // clear a partial/corrupt prior attempt
  vadDir().create({ intermediates: true, idempotent: true });

  const task = File.createDownloadTask(VAD_URL, file);
  await task.downloadAsync();
  if (!isVadModelReady()) {
    if (file.exists) file.delete();
    throw new Error('VAD model download failed or is incomplete');
  }
  return file.uri;
}

// The VAD context is independent of which speech model is selected, so we hold a single instance
// across model switches (it's cheap and tiny) and only release it when on-device AI is turned off.
let ctx: WhisperVadContext | null = null;
let loadPromise: Promise<WhisperVadContext> | null = null;
// Bumped on every releaseVad(); an in-flight loadVad() refuses to install a context built against
// a superseded generation (see loadVad/releaseVad).
let generation = 0;
// Sticky flag set when VAD init fails even on the CPU fallback — the device genuinely can't run the
// VAD, so we stop re-attempting it on every clip (callers fail open and let Whisper run). A model
// download failure (offline) is NOT cached here: it's transient and retried on the next clip.
// Cleared by releaseVad so a later toggle can try again.
let unavailable = false;

/**
 * Build a VAD context, preferring the Metal GPU and falling back to CPU. GPU init throws on
 * simulators / older devices without a usable GPU (mirrors the speech-context init in whisper.ts),
 * so we retry on CPU rather than letting the gate fail open — keeping hallucination suppression
 * active wherever the VAD can run at all.
 */
async function initVadContext(filePath: string): Promise<WhisperVadContext> {
  try {
    return await initWhisperVad({ filePath, useGpu: true });
  } catch {
    return initWhisperVad({ filePath });
  }
}

async function loadVad(): Promise<WhisperVadContext> {
  if (ctx) return ctx;
  if (unavailable) throw new Error('VAD unavailable on this device');
  if (loadPromise) return loadPromise;
  const promise = (async () => {
    // Snapshot synchronously, before any await — see loadContext in whisper.ts
    // for why capturing later would let a releaseVad() slip past the guard.
    const gen = generation;
    await ensureVadModel(); // transient (offline) failures throw here and are intentionally not cached
    let vadCtx: WhisperVadContext;
    try {
      vadCtx = await initVadContext(vadFile().uri);
    } catch (error) {
      unavailable = true; // failed even on CPU — don't retry this on every clip
      throw error;
    }
    if (gen !== generation) {
      // A releaseVad() (model clear) raced this load; don't install a context whose
      // weights may have been deleted. Free it and fail this load.
      await vadCtx.release().catch(() => {});
      throw new Error('VAD load superseded by a model clear');
    }
    ctx = vadCtx;
    return vadCtx;
  })();
  loadPromise = promise;
  try {
    return await promise;
  } finally {
    // Clear only our own promise — releaseVad() (or a load it unblocked) may
    // have replaced `loadPromise` while this one was settling.
    if (loadPromise === promise) loadPromise = null;
  }
}

/** Free the VAD context (e.g. when the model is cleared). Re-loads lazily on next use. */
export async function releaseVad(): Promise<void> {
  generation++; // invalidate any in-flight load so it can't resurrect `ctx` after this returns
  loadPromise = null;
  unavailable = false; // allow a fresh attempt after a model toggle
  const prevCtx = ctx;
  ctx = null;
  await prevCtx?.release();
}

/**
 * Whether the WAV at `wavPath` contains any detected speech. Throws if the VAD model isn't yet
 * available (e.g. offline before its first download) — callers should treat that as "unknown" and
 * fail open (transcribe anyway) rather than dropping captions.
 *
 * NOTE: `detectSpeech` segments' `t0`/`t1` are in **seconds** — unlike Whisper's transcript lines,
 * whose `t0`/`t1` are centiseconds. We only count segments here, but if you ever read these
 * timestamps, do NOT apply the centisecond (`*10` / `/100`) conversion used for caption lines.
 */
export async function hasSpeech(wavPath: string): Promise<boolean> {
  const vadCtx = await loadVad();
  const segments = await vadCtx.detectSpeech(wavPath);
  return segments.length > 0;
}
