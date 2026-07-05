import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useMemo } from 'react';

import { draftTranscriptQuery } from '@/db/transcripts';
import { parseTranscriptLines, type TranscriptLine } from './whisper';

/** Parsed merged transcript for a draft, ready for display/export. */
export type DraftTranscript = {
  status: 'processing' | 'done' | 'error';
  text: string | null;
  /** Effective captions on the merged timeline: the user's edit if present, else the auto lines. */
  lines: TranscriptLine[];
  /** The segment-set signature this transcript was cut against (for staleness checks). */
  signature: string;
  /** True merged duration (ms) the transcript was produced against, or null. */
  durationMs: number | null;
  /** True when the user has hand-edited the merged captions. */
  edited: boolean;
};

/**
 * Read-only: a draft's single MERGED transcript, for rendering captions over the merged video.
 * `lines` is the EFFECTIVE transcript (the hand-edit when present, else the auto lines). Writes are
 * owned by the export transcription orchestration (`useMergedTranscription`) and the subtitle editor.
 * Returns `null` until a transcript row exists for the draft.
 */
export function useDraftTranscript(draftId: string | null): DraftTranscript | null {
  const { data } = useLiveQuery(draftTranscriptQuery(draftId ?? ''), [draftId]);
  return useMemo(() => {
    const row = data[0];
    if (!row) return null;
    const edited = row.editedLines != null;
    return {
      status: row.status,
      text: row.text,
      lines: edited ? parseTranscriptLines(row.editedLines) : parseTranscriptLines(row.lines),
      signature: row.signature,
      durationMs: row.durationMs,
      edited,
    };
  }, [data]);
}
