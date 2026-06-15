import { eq, isNull, sql } from 'drizzle-orm';

import type { TranscriptLine, TranscriptResult } from '@/features/transcription/whisper';
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
      editedLines: transcripts.editedLines,
    })
    .from(transcripts)
    .innerJoin(segments, eq(segments.id, transcripts.segmentId))
    .where(eq(segments.projectId, projectId));
}

/** Live-queryable: every transcript row (status/model/file + edit flag) — the engine's needs-check source. */
export const allTranscriptsQuery = db
  .select({
    segmentId: transcripts.segmentId,
    sourceFile: transcripts.sourceFile,
    model: transcripts.model,
    status: transcripts.status,
    editedLines: transcripts.editedLines,
  })
  .from(transcripts);

/** Load a single segment's transcript row (auto `lines`, `editedLines`, status) for the editor. */
export async function getTranscriptRow(segmentId: string) {
  const [row] = await db
    .select({
      lines: transcripts.lines,
      editedLines: transcripts.editedLines,
      status: transcripts.status,
    })
    .from(transcripts)
    .where(eq(transcripts.segmentId, segmentId));
  return row ?? null;
}

/**
 * Drop auto-generated transcripts (e.g. on a model switch, so captions regenerate from scratch),
 * but PRESERVE rows the user has hand-edited — their captions are tied to the audio, not the
 * model, so a model switch must not wipe them.
 */
export async function clearAutoTranscripts(): Promise<void> {
  await db.delete(transcripts).where(isNull(transcripts.editedLines));
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
      // A (re)transcription only reaches here for a fresh clip or after the effective file changed
      // (a destructive edit) — in both cases any prior hand-edit is stale, so drop it too.
      set: {
        sourceFile,
        model,
        status: 'processing',
        text: null,
        lines: null,
        language: null,
        editedLines: null,
        editedAt: null,
      },
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

/**
 * Persist the user's hand-edited captions for a segment. Stored alongside the auto `lines` (which
 * stay intact for "Reset to auto"); once set, `editedLines` is the effective transcript and locks
 * the row against auto re-transcription and model-switch wipes. Forces status to 'done' so the
 * captions render regardless of the prior auto state. `editedAt` is passed in (scripts can't call
 * Date.now()); pass `Date.now()` from the caller.
 *
 * Upserts: a clip can be captioned before the background engine has inserted a row (no model
 * selected, or still queued), and the edit must still stick. `sourceFile` (the segment's effective
 * file) ties a freshly-inserted row to the right audio so the edit-lock holds; on an existing row
 * it is left untouched (it already matches) so the stored auto `lines` survive for "Reset to auto".
 */
export async function saveEditedTranscript(
  segmentId: string,
  sourceFile: string,
  lines: TranscriptLine[],
  editedAt: number,
): Promise<void> {
  const editedLines = JSON.stringify(lines);
  await db
    .insert(transcripts)
    .values({ segmentId, sourceFile, status: 'done', editedLines, editedAt })
    .onConflictDoUpdate({
      target: transcripts.segmentId,
      set: { status: 'done', editedLines, editedAt },
    });
}

/**
 * Clear a segment's manual edit ("Reset to auto"), unlocking it for the background engine. If the
 * row has no auto `lines` to fall back on (it was edited before auto-transcription produced any),
 * re-arm it to 'processing' so the engine regenerates captions rather than leaving it stranded at
 * an empty 'done'; otherwise keep the stored auto lines + status so they reappear instantly.
 */
export async function clearEditedTranscript(segmentId: string): Promise<void> {
  await db
    .update(transcripts)
    .set({
      editedLines: null,
      editedAt: null,
      status: sql`CASE WHEN ${transcripts.lines} IS NULL THEN 'processing' ELSE ${transcripts.status} END`,
    })
    .where(eq(transcripts.segmentId, segmentId));
}
