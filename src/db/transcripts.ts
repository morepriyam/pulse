import { eq, sql } from 'drizzle-orm';

import type { TranscriptLine, TranscriptResult } from '@/features/transcription/whisper';
import { db } from './client';
import { draftTranscripts } from './schema';

/** Live-queryable: the single merged transcript row for a draft (or none). */
export function draftTranscriptQuery(projectId: string) {
  return db
    .select({
      projectId: draftTranscripts.projectId,
      signature: draftTranscripts.signature,
      model: draftTranscripts.model,
      status: draftTranscripts.status,
      language: draftTranscripts.language,
      text: draftTranscripts.text,
      lines: draftTranscripts.lines,
      editedLines: draftTranscripts.editedLines,
      durationMs: draftTranscripts.durationMs,
    })
    .from(draftTranscripts)
    .where(eq(draftTranscripts.projectId, projectId));
}

/** Load a draft's merged transcript row (auto `lines`, `editedLines`, status, signature) for the editor/upload. */
export async function getDraftTranscriptRow(projectId: string) {
  const [row] = await db
    .select({
      signature: draftTranscripts.signature,
      lines: draftTranscripts.lines,
      editedLines: draftTranscripts.editedLines,
      status: draftTranscripts.status,
      durationMs: draftTranscripts.durationMs,
    })
    .from(draftTranscripts)
    .where(eq(draftTranscripts.projectId, projectId));
  return row ?? null;
}

/**
 * Mark a draft's merged transcript in-progress for a given segment-set signature + model (insert or
 * replace). A new signature means the merged timeline moved, so any prior auto lines AND hand-edit
 * are stale — cleared here.
 */
export async function markTranscribing(
  projectId: string,
  signature: string,
  model: string,
): Promise<void> {
  await db
    .insert(draftTranscripts)
    .values({ projectId, signature, model, status: 'processing' })
    .onConflictDoUpdate({
      target: draftTranscripts.projectId,
      set: {
        signature,
        model,
        status: 'processing',
        text: null,
        lines: null,
        language: null,
        editedLines: null,
        editedAt: null,
        durationMs: null,
      },
    });
}

/** Persist a completed merged transcription result. */
export async function saveTranscript(
  projectId: string,
  signature: string,
  model: string,
  result: TranscriptResult,
  durationMs: number,
): Promise<void> {
  await db
    .update(draftTranscripts)
    .set({
      signature,
      model,
      status: 'done',
      language: result.language,
      text: result.text,
      lines: JSON.stringify(result.lines),
      durationMs,
    })
    .where(eq(draftTranscripts.projectId, projectId));
}

/** Mark a draft's merged transcription as failed for a given signature + model. */
export async function markTranscriptError(
  projectId: string,
  signature: string,
  model: string,
): Promise<void> {
  await db
    .update(draftTranscripts)
    .set({ signature, model, status: 'error', text: null, lines: null })
    .where(eq(draftTranscripts.projectId, projectId));
}

/**
 * Persist the user's hand-edited captions for a draft's merged transcript. Stored alongside the
 * auto `lines` (which stay intact for "Reset to auto"); while `signature` still matches the current
 * segment set, `editedLines` is the effective transcript. Forces status to 'done' so the captions
 * render regardless of the prior auto state. `editedAt` is passed in by the caller.
 *
 * Upserts: the merged video can be captioned before a row exists (edited from an export with no
 * model yet), and the edit must still stick. `signature` ties the row to the timeline the editor
 * showed — set on insert AND rewritten on conflict, so a hand-edit is never treated as stale
 * against its own video. The stored auto `lines` are left untouched so "Reset to auto" still works.
 */
export async function saveEditedTranscript(
  projectId: string,
  signature: string,
  lines: TranscriptLine[],
  editedAt: number,
): Promise<void> {
  const editedLines = JSON.stringify(lines);
  await db
    .insert(draftTranscripts)
    .values({ projectId, signature, status: 'done', editedLines, editedAt })
    .onConflictDoUpdate({
      target: draftTranscripts.projectId,
      // Rewrite `signature` too: the edit's cue timings match the merged video the editor showed,
      // which corresponds to THIS signature. If the stored row was still on an older signature,
      // binding the edit to the current one is what keeps it from being treated as stale (and
      // wiped) on the next export.
      set: { signature, status: 'done', editedLines, editedAt },
    });
}

/**
 * Clear a draft's manual edit ("Reset to auto"). If the row has no auto `lines` to fall back on (it
 * was edited before transcription produced any), re-arm it to 'processing' so the next export
 * regenerates captions rather than leaving it stranded at an empty 'done'; otherwise keep the
 * stored auto lines + status so they reappear instantly.
 */
export async function clearEditedTranscript(projectId: string): Promise<void> {
  await db
    .update(draftTranscripts)
    .set({
      editedLines: null,
      editedAt: null,
      status: sql`CASE WHEN ${draftTranscripts.lines} IS NULL THEN 'processing' ELSE ${draftTranscripts.status} END`,
    })
    .where(eq(draftTranscripts.projectId, projectId));
}
