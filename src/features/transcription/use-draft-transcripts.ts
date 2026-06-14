import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useMemo } from 'react';

import { transcriptsForDraft } from '@/db/transcripts';
import type { TranscriptLine } from './whisper';

/** Parsed transcript for one segment, ready for display. */
export type SegmentTranscript = {
  status: 'processing' | 'done' | 'error';
  text: string | null;
  lines: TranscriptLine[];
};

/**
 * Read-only: the transcripts for a draft's segments, keyed by segment id, for rendering captions.
 * Writes are owned by the global background engine (`useLibraryTranscription`); this just observes.
 */
export function useDraftTranscripts(draftId: string | null): Map<string, SegmentTranscript> {
  const { data } = useLiveQuery(transcriptsForDraft(draftId ?? ''), [draftId]);
  return useMemo(() => {
    const map = new Map<string, SegmentTranscript>();
    for (const r of data) {
      map.set(r.segmentId, {
        status: r.status,
        text: r.text,
        lines: r.lines ? (JSON.parse(r.lines) as TranscriptLine[]) : [],
      });
    }
    return map;
  }, [data]);
}
