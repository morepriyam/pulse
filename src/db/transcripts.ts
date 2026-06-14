import { eq } from 'drizzle-orm';

import type { TranscriptResult } from '@/features/transcription/whisper';
import { db } from './client';
import { segments, transcripts } from './schema';

/** Live-queryable: all transcript rows for a draft's segments (joined via the segment FK). */
export function transcriptsForDraft(projectId: string) {
  return db
    .select({
      segmentId: transcripts.segmentId,
      sourceFile: transcripts.sourceFile,
      model: transcripts.model,
      status: transcripts.status,
      language: transcripts.language,
      text: transcripts.text,
      lines: transcripts.lines,
    })
    .from(transcripts)
    .innerJoin(segments, eq(segments.id, transcripts.segmentId))
    .where(eq(segments.projectId, projectId));
}

/** Live-queryable: every transcript row (status/model/file) — the engine's needs-check source. */
export const allTranscriptsQuery = db
  .select({
    segmentId: transcripts.segmentId,
    sourceFile: transcripts.sourceFile,
    model: transcripts.model,
    status: transcripts.status,
  })
  .from(transcripts);

/** Drop every transcript (e.g. on a model switch, so captions regenerate from scratch). */
export async function clearAllTranscripts(): Promise<void> {
  await db.delete(transcripts);
}

/** Mark a segment's transcript in-progress for a given effective file + model (insert or replace). */
export async function markTranscribing(
  segmentId: string,
  sourceFile: string,
  model: string,
): Promise<void> {
  await db
    .insert(transcripts)
    .values({ segmentId, sourceFile, model, status: 'processing' })
    .onConflictDoUpdate({
      target: transcripts.segmentId,
      set: { sourceFile, model, status: 'processing', text: null, lines: null, language: null },
    });
}

/** Persist a completed transcription result. */
export async function saveTranscript(
  segmentId: string,
  sourceFile: string,
  model: string,
  result: TranscriptResult,
): Promise<void> {
  await db
    .update(transcripts)
    .set({
      sourceFile,
      model,
      status: 'done',
      language: result.language,
      text: result.text,
      lines: JSON.stringify(result.lines),
    })
    .where(eq(transcripts.segmentId, segmentId));
}

/** Mark a segment's transcription as failed for a given effective file + model. */
export async function markTranscriptError(
  segmentId: string,
  sourceFile: string,
  model: string,
): Promise<void> {
  await db
    .update(transcripts)
    .set({ sourceFile, model, status: 'error', text: null, lines: null })
    .where(eq(transcripts.segmentId, segmentId));
}
