import { Directory, File, Paths } from 'expo-file-system';

import { modelUrl, type WhisperModel } from './models';

// On-device Whisper model files live under the document directory (so they survive launches) and
// are downloaded on demand. Only the currently-selected model is kept on disk — switching deletes
// the others — so the app never holds more than one set of weights at a time.
//
//   models/ggml-<id>.bin
//
// A partial/interrupted download is shorter than the real file; we treat anything well under the
// model's approximate size as incomplete.
const COMPLETE_FRACTION = 0.7;

function modelsDir(): Directory {
  return new Directory(Paths.document, 'models');
}

function modelFile(m: WhisperModel): File {
  return new File(Paths.document, 'models', m.filename);
}

/** Whether the given model is fully downloaded. */
export function isModelReady(m: WhisperModel): boolean {
  const file = modelFile(m);
  return file.exists && (file.size ?? 0) >= m.approxBytes * COMPLETE_FRACTION;
}

/** Absolute file URI of the model's weights (only valid once downloaded). */
export function modelFileUri(m: WhisperModel): string {
  return modelFile(m).uri;
}

export type ModelProgress = { bytesWritten: number; totalBytes: number };

// In-flight downloads keyed by filename, so concurrent callers (e.g. the global lifecycle on Home
// and a transcribe fallback in the recorder) share one download instead of racing on the same file.
// We keep the DownloadTask alongside the promise so a model switch can cancel a now-stale download
// (e.g. abandoning a 574 MB pull) instead of letting it run to completion only to be deleted.
type InFlight = { promise: Promise<string>; task: { cancel: () => void } };
const inFlight = new Map<string, InFlight>();

/**
 * Ensure the given model is on disk, downloading it if missing. Idempotent and safe to call
 * concurrently. `onProgress` (from the first caller of an in-flight download) reports byte
 * progress. Returns the model's absolute file URI.
 */
export function ensureModel(
  m: WhisperModel,
  onProgress?: (p: ModelProgress) => void,
): Promise<string> {
  const file = modelFile(m);
  if (isModelReady(m)) return Promise.resolve(file.uri);

  const existing = inFlight.get(m.filename);
  if (existing) return existing.promise;

  if (file.exists) file.delete(); // clear a partial/corrupt prior attempt
  modelsDir().create({ intermediates: true, idempotent: true });

  const task = File.createDownloadTask(modelUrl(m), file, {
    onProgress: ({ bytesWritten, totalBytes }) => onProgress?.({ bytesWritten, totalBytes }),
  });

  const promise = (async () => {
    await task.downloadAsync();
    if (!isModelReady(m)) {
      if (file.exists) file.delete();
      throw new Error('Whisper model download failed or is incomplete');
    }
    return file.uri;
  })();

  inFlight.set(m.filename, { promise, task });
  return promise.finally(() => inFlight.delete(m.filename));
}

/**
 * Cancel any in-flight model download other than `keep` (pass `null` to cancel all). Called on a
 * model switch so an abandoned download stops immediately instead of finishing just to be deleted.
 * A cancelled download rejects its `ensureModel` promise, which the engine treats like a failed
 * download and retries on next selection.
 */
export function cancelModelDownloadsExcept(keep: WhisperModel | null): void {
  for (const [filename, entry] of inFlight) {
    if (filename !== keep?.filename) entry.task.cancel();
  }
}

/**
 * Delete every downloaded model file except `keep` (pass `null` to delete all). Used when
 * switching models so only one set of weights occupies disk at a time.
 */
export function deleteModelsExcept(keep: WhisperModel | null): void {
  const dir = modelsDir();
  if (!dir.exists) return;
  for (const entry of dir.list()) {
    if (entry instanceof File && entry.name.endsWith('.bin') && entry.name !== keep?.filename) {
      entry.delete();
    }
  }
}
