import { useSyncExternalStore } from 'react';

/**
 * Coarse transcription status, shown in the On-device AI sheet and (for `transcribing`) on the
 * export screen. Unlike the old always-on background engine, work is now driven on demand by the
 * export orchestration (`useMergedTranscription`) and model selection (`model-manager`), which
 * write into this tiny module-level store. `transcribing` is a single-item state now (one merged
 * video per export), so it carries no done/total count.
 */
export type TranscriptionStatus =
  | { kind: 'idle' }
  | { kind: 'deleting' }
  | { kind: 'downloading'; bytesWritten: number; totalBytes: number }
  | { kind: 'transcribing' };

let current: TranscriptionStatus = { kind: 'idle' };
const listeners = new Set<() => void>();

/** Publish a new status; notifies every mounted `useTranscriptionStatus` consumer. */
export function setTranscriptionStatus(next: TranscriptionStatus): void {
  current = next;
  for (const listener of listeners) listener();
}

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

/** Current transcription status (idle / deleting / downloading / transcribing). */
export function useTranscriptionStatus(): TranscriptionStatus {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => current,
  );
}
