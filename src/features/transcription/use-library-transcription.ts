import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { allSegmentsQuery } from '@/db/drafts';
import type { Segment } from '@/db/schema';
import { selectedModelQuery, setSelectedModel } from '@/db/settings';
import {
  allTranscriptsQuery,
  clearAutoTranscripts,
  markTranscribing,
  markTranscriptError,
  saveTranscript,
} from '@/db/transcripts';
import { absolutize } from '@/utils/file-store';
import { effFile } from '@/utils/segment-window';
import { getActiveDraft } from './active-draft';
import { cancelModelDownloadsExcept, deleteModelsExcept, ensureModel, isModelReady } from './model';
import { getModel, migrateStaleModelId, type WhisperModel } from './models';
import { needsTranscription } from './needs-transcription';
import { isRecordingActive, setResumeHandler } from './recording-signal';
import { releaseVad } from './vad';
import { releaseWhisper, transcribeVideo } from './whisper';

// How many times a clip that errors out is retried within a session before it's given up on. A
// fresh launch resets the count, so a transient failure (device busy, momentary OOM) gets another
// chance next time the app opens, while a genuinely broken clip can't spin forever.
const MAX_TRANSCRIBE_ATTEMPTS = 2;

/** Global transcription status — drives the picker's status line. */
export type TranscriptionStatus =
  | { kind: 'idle' }
  | { kind: 'deleting' }
  | { kind: 'downloading'; bytesWritten: number; totalBytes: number }
  | { kind: 'transcribing'; done: number; total: number };

type Row = {
  model: string | null;
  sourceFile: string;
  status: 'processing' | 'done' | 'error';
  edited: boolean;
};

/**
 * The single, app-wide background transcription engine. Mounted once (see TranscriptionProvider).
 *
 * Driven by the persisted model selection, it keeps every clip in the library captioned:
 * - Selecting a model downloads it (deleting any other), then transcribes the whole library.
 * - Switching models **clears auto-generated transcripts** (captions regenerate per-segment with
 *   the new model) but PRESERVES hand-edited ones — each caption reappears as its clip finishes.
 * - Clearing the model releases the context and deletes the weights.
 * - New clips (recorded/imported anywhere) are picked up automatically.
 *
 * All work is background; Whisper yields between clips while the camera is recording. Returns a
 * coarse `status` for the picker.
 */
export function useLibraryTranscription(): TranscriptionStatus {
  const { data: modelRow, updatedAt } = useLiveQuery(selectedModelQuery, []);
  const ready = updatedAt != null;
  const storedModelId = modelRow[0]?.value ?? null;
  const model = getModel(storedModelId);

  // A stored selection that no longer resolves (the model was retired from the catalog, or the
  // value is corrupt) is rewritten to its designated replacement — or cleared — so the user isn't
  // silently left with transcription off. The write flows back through the live query and behaves
  // like a normal model switch: stale weights are deleted and auto captions regenerate.
  useEffect(() => {
    if (ready && storedModelId != null && model == null) {
      void setSelectedModel(migrateStaleModelId(storedModelId)?.id ?? null);
    }
  }, [ready, storedModelId, model]);

  const { data: segments } = useLiveQuery(allSegmentsQuery, []);
  const { data: transcriptRows } = useLiveQuery(allTranscriptsQuery, []);

  const [status, setStatus] = useState<TranscriptionStatus>({ kind: 'idle' });

  const rowById = useMemo(() => {
    const map = new Map<string, Row>();
    for (const row of transcriptRows) {
      map.set(row.segmentId, {
        model: row.model,
        sourceFile: row.sourceFile,
        status: row.status,
        edited: row.editedLines != null,
      });
    }
    return map;
  }, [transcriptRows]);

  // Live values read inside the long-running async pipeline (writing refs during render is
  // disallowed by the React-Compiler lint, so sync them in an effect).
  const segmentsRef = useRef(segments);
  const rowByIdRef = useRef(rowById);
  const modelRef = useRef(model);
  useEffect(() => {
    segmentsRef.current = segments;
    rowByIdRef.current = rowById;
    modelRef.current = model;
  });

  // Keys (`id:file:model`) that are settled for this session — transcribed successfully or given up
  // on after MAX_TRANSCRIBE_ATTEMPTS — so `needs()` skips them without re-reading the DB.
  const processedRef = useRef<Set<string>>(new Set());
  // Per-key failed-attempt counts, so a clip is retried a bounded number of times before being
  // abandoned for the session (a relaunch resets this and gives transient failures another go).
  const errorAttemptsRef = useRef<Map<string, number>>(new Map());
  const runningRef = useRef(false);
  const dirtyRef = useRef(false);
  // Latest `sync` reference, so the lost-wakeup re-check can re-invoke it without making `sync`
  // depend on itself (ref assignment happens in an effect — never during render).
  const syncRef = useRef<() => Promise<void>>(undefined);
  // Tracks the previously-seen model id to detect a genuine switch (vs. the initial load) so we
  // only clear existing captions on an actual change, never on app launch.
  const prevModelIdRef = useRef<string | null | undefined>(undefined);

  const needs = useCallback((segment: Segment, model: WhisperModel): boolean => {
    const file = effFile(segment);
    const key = `${segment.id}:${file}:${model.id}`;
    if (processedRef.current.has(key)) return false; // settled this session
    const row = rowByIdRef.current.get(segment.id);
    return needsTranscription(
      file,
      model.id,
      row,
      errorAttemptsRef.current.get(key) ?? 0,
      MAX_TRANSCRIBE_ATTEMPTS,
      row?.edited ?? false,
    );
  }, []);

  const sync = useCallback(async () => {
    if (runningRef.current) {
      dirtyRef.current = true;
      return;
    }
    runningRef.current = true;
    try {
      do {
        dirtyRef.current = false;
        const model = modelRef.current;
        const currentModelId = model?.id ?? null;

        // Detect a real model change. First resolved value is adopted without clearing (don't wipe
        // captions on launch); any later change clears all transcripts so they regenerate.
        if (prevModelIdRef.current === undefined) {
          prevModelIdRef.current = currentModelId;
        } else if (prevModelIdRef.current !== currentModelId) {
          prevModelIdRef.current = currentModelId;
          processedRef.current.clear();
          // Drop auto captions so they regenerate with the new model, but keep hand-edited rows
          // (their captions are tied to the audio, not the model).
          await clearAutoTranscripts();
        }

        if (!model) {
          await releaseWhisper();
          await releaseVad();
          deleteModelsExcept(null);
          continue;
        }

        // Ensure the selected model is the only one on disk.
        if (!isModelReady(model)) {
          setStatus({ kind: 'deleting' });
          await releaseWhisper();
          deleteModelsExcept(model);
          setStatus({ kind: 'downloading', bytesWritten: 0, totalBytes: model.approxBytes });
          try {
            await ensureModel(model, (progress) => {
              if (modelRef.current?.id === model.id)
                setStatus({ kind: 'downloading', ...progress });
            });
          } catch {
            break; // download failed (offline) — user can reselect to retry
          }
        }

        // Transcribe everything that needs it, yielding while recording. The draft currently on
        // screen is captioned first so its captions appear quickly, ahead of the rest of the library.
        const pending = segmentsRef.current.filter((segment) => needs(segment, model));
        const activeDraft = getActiveDraft();
        const todo = activeDraft
          ? [
              ...pending.filter((segment) => segment.projectId === activeDraft),
              ...pending.filter((segment) => segment.projectId !== activeDraft),
            ]
          : pending;
        if (todo.length > 0) {
          let done = 0;
          setStatus({ kind: 'transcribing', done, total: todo.length });
          for (const segment of todo) {
            if (modelRef.current?.id !== model.id) {
              dirtyRef.current = true; // switched mid-run — restart with the new model
              break;
            }
            if (isRecordingActive()) {
              dirtyRef.current = true; // defer; the resume handler re-runs when recording stops
              break;
            }
            const file = effFile(segment);
            const key = `${segment.id}:${file}:${model.id}`;
            try {
              await markTranscribing(segment.id, file, model.id);
              const result = await transcribeVideo(absolutize(file), model);
              await saveTranscript(segment.id, file, model.id, result);
              processedRef.current.add(key); // done — settled for the session
            } catch {
              await markTranscriptError(segment.id, file, model.id).catch(() => {});
              const attempts = (errorAttemptsRef.current.get(key) ?? 0) + 1;
              errorAttemptsRef.current.set(key, attempts);
              if (attempts >= MAX_TRANSCRIBE_ATTEMPTS)
                processedRef.current.add(key); // give up for this session
              else dirtyRef.current = true; // schedule another pass to retry
            }
            done += 1;
            setStatus({ kind: 'transcribing', done, total: todo.length });
          }
        }
      } while (dirtyRef.current && !isRecordingActive());
    } finally {
      runningRef.current = false;
      setStatus({ kind: 'idle' });
    }
    // Close the lost-wakeup gap: if a resume/model/library change set `dirty` during the teardown
    // above — after the loop exited but before `running` was cleared — re-run now that the lock is
    // released, so deferred work isn't stranded until the next unrelated change.
    if (dirtyRef.current && !isRecordingActive()) void syncRef.current?.();
  }, [needs]);

  // Keep the self-reference fresh for the lost-wakeup re-check (never assign refs during render).
  useEffect(() => {
    syncRef.current = sync;
  }, [sync]);

  // On a model switch, cancel any in-flight download for a now-unselected model so an abandoned
  // (possibly large) pull stops immediately instead of finishing only to be deleted.
  useEffect(() => {
    cancelModelDownloadsExcept(model);
  }, [model]);

  // Re-sync on model change and as the library's clips change.
  useEffect(() => {
    if (ready) void sync();
  }, [ready, model?.id, segments, sync]);

  // Resume deferred work the moment recording stops.
  useEffect(() => {
    setResumeHandler(() => void sync());
    return () => setResumeHandler(null);
  }, [sync]);

  return status;
}
