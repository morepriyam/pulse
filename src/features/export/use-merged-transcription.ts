import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

import type { Segment } from '@/db/schema';
import { selectedModelQuery } from '@/db/settings';
import {
  getDraftTranscriptRow,
  markTranscribing,
  markTranscriptError,
  saveTranscript,
} from '@/db/transcripts';
import { ensureModel, isModelReady } from '@/features/transcription/model-manager';
import { resolveSelectedModel } from '@/features/transcription/models';
import { setTranscriptionStatus } from '@/features/transcription/transcription-status';
import { useDraftTranscript } from '@/features/transcription/use-draft-transcripts';
import type { TranscriptLine } from '@/features/transcription/whisper';
import { transcribeVideo } from '@/features/transcription/whisper';
import { toFileUri } from '@/utils/file-store';
import { segmentSignature } from '@/utils/segment-window';

import type { ExportState } from './use-export';

export type MergedTranscriptionState =
  | { status: 'idle' } // merge not finished yet — nothing to transcribe
  | { status: 'no-model' } // merge done but no on-device model selected — prompt to download
  | { status: 'downloading'; progress: number } // fetching the selected model's weights
  | { status: 'transcribing' } // whisper running on the merged video
  | { status: 'ready' } // captions available (or the video has no speech)
  | { status: 'error'; message: string };

export type MergedTranscription = {
  state: MergedTranscriptionState;
  /** Effective merged captions for the overlay (hand-edit if present, else auto). */
  lines: TranscriptLine[];
};

/**
 * Drives transcription of a draft's MERGED video, replacing the old always-on per-clip background
 * engine. Runs once the merge completes: ensures the selected model is on disk (downloading if
 * needed), then transcribes the whole merged timeline in one pass and persists it as the draft's
 * single transcript. Staleness is keyed on the segment-set signature — a clip change re-merges
 * (new `mergeState`) and re-transcribes, discarding stale auto lines and hand-edits. With no model
 * selected it stops at `no-model` so the screen can prompt the user to download one; captions are
 * then simply absent (the video still uploads).
 */
export function useMergedTranscription(
  draftId: string,
  clips: Segment[],
  mergeState: ExportState,
): MergedTranscription {
  const { data: modelRows } = useLiveQuery(selectedModelQuery, []);
  const selectedModelId = modelRows[0]?.value ?? null;

  // Live effective captions for the overlay (updates instantly when the editor autosaves).
  const transcript = useDraftTranscript(draftId);
  const lines = transcript?.lines ?? [];

  const [state, setState] = useState<MergedTranscriptionState>({ status: 'idle' });

  const signature = useMemo(() => segmentSignature(clips), [clips]);
  const mergeStatus = mergeState.status;
  const outputPath = mergeState.status === 'done' ? mergeState.outputPath : null;
  const mergedDurationMs = mergeState.status === 'done' ? mergeState.durationMs : 0;

  useEffect(() => {
    // A clip change (or model switch) mid-run must not commit stale lines — only the latest run
    // is allowed to write state/DB. Mirrors `useExport`'s own latch. `controller` additionally
    // aborts the native whisper inference on teardown so it stops contending with a new
    // recording and can't be released out from under a model switch.
    let current = true;
    const controller = new AbortController();
    void (async () => {
      if (mergeStatus !== 'done' || !outputPath) {
        if (current) setState({ status: 'idle' });
        return;
      }
      const model = resolveSelectedModel(selectedModelId);
      if (!model) {
        if (current) setState({ status: 'no-model' });
        return;
      }
      // Reuse a fresh, completed transcript for this exact timeline — don't re-run whisper (or
      // wipe hand-edits) when the merged video hasn't changed since it was last transcribed.
      const row = await getDraftTranscriptRow(draftId);
      if (!current) return;
      if (row && row.signature === signature && row.status === 'done') {
        setState({ status: 'ready' });
        return;
      }
      try {
        if (!isModelReady(model)) {
          setState({ status: 'downloading', progress: 0 });
          setTranscriptionStatus({
            kind: 'downloading',
            bytesWritten: 0,
            totalBytes: model.approxBytes,
          });
          await ensureModel(model, ({ bytesWritten, totalBytes }) => {
            if (!current) return;
            setState({
              status: 'downloading',
              progress: totalBytes ? bytesWritten / totalBytes : 0,
            });
            setTranscriptionStatus({ kind: 'downloading', bytesWritten, totalBytes });
          });
        }
        if (!current) return;
        setState({ status: 'transcribing' });
        setTranscriptionStatus({ kind: 'transcribing' });
        await markTranscribing(draftId, signature, model.id);
        const result = await transcribeVideo(toFileUri(outputPath), model, {
          signal: controller.signal,
        });
        if (!current) return;
        await saveTranscript(draftId, signature, model.id, result, mergedDurationMs);
        if (!current) return;
        setState({ status: 'ready' });
      } catch (e) {
        // A superseded/torn-down run must not touch the shared per-draft row or the global status
        // store — a newer run may already own them.
        if (!current) return;
        await markTranscriptError(draftId, signature, model.id).catch(() => {});
        setState({
          status: 'error',
          message: e instanceof Error ? e.message : 'Could not transcribe the video.',
        });
      } finally {
        if (current) setTranscriptionStatus({ kind: 'idle' });
      }
    })();
    return () => {
      current = false;
      controller.abort();
    };
  }, [draftId, mergeStatus, outputPath, mergedDurationMs, signature, selectedModelId]);

  return { state, lines };
}
