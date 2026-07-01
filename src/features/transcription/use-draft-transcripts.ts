import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useMemo } from 'react';

import { transcriptsForDraft } from '@/db/transcripts';
import type { TranscriptLine } from './whisper';

/** Parsed transcript for one segment, ready for display. */
export type SegmentTranscript = {
  status: 'processing' | 'done' | 'error';
  text: string | null;
  /** Effective captions for display/export: the user's edit if present, else the auto lines. */
  lines: TranscriptLine[];
  /** True when the user has hand-edited this segment's captions. */
  edited: boolean;
};

function parseLines(json: string | null): TranscriptLine[] {
  if (!json) return [];
  try {
    return JSON.parse(json) as TranscriptLine[];
  } catch {
    return [];
  }
}

/**
 * Read-only: the transcripts for a draft's segments, keyed by segment id, for rendering captions.
 * `lines` is the EFFECTIVE transcript (the hand-edit when present, else the auto lines). Writes are
 * owned by the global background engine (`useLibraryTranscription`) and the subtitle editor.
 */
export function useDraftTranscripts(draftId: string | null): Map<string, SegmentTranscript> {
  const { data } = useLiveQuery(transcriptsForDraft(draftId ?? ''), [draftId]);
  return useMemo(() => {
    const map = new Map<string, SegmentTranscript>();
    for (const row of data) {
      const edited = row.editedLines != null;
      map.set(row.segmentId, {
        status: row.status,
        text: row.text,
        lines: edited ? parseLines(row.editedLines) : parseLines(row.lines),
        edited,
      });
    }
    return map;
  }, [data]);
}
