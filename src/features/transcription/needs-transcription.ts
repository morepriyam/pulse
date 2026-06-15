/** The persisted transcript facts the engine decides from (a subset of the `transcripts` row). */
export type TranscriptState = {
  model: string | null;
  sourceFile: string;
  status: 'processing' | 'done' | 'error';
};

/**
 * Pure decision: does the clip identified by (`effectiveFile`, `modelId`) need (re)transcription,
 * given its current DB row and how many times it has already failed this session?
 *
 * - No row yet → yes.
 * - Row was produced from a different file (a destructive edit changed the effective file) → yes
 *   (this also drops any now-stale hand-edit, whose timings no longer match the new audio).
 * - Row is hand-edited (and still for this file) → no. The user's captions are locked: a model
 *   switch must not regenerate over them, since captions are tied to the audio, not the model.
 * - Row was produced by a different model → yes.
 * - Done → no.
 * - Errored → retry only while under the attempt budget.
 * - Processing → yes (stranded by a killed app; resume).
 *
 * The caller separately skips keys already settled this session; this function is the DB-driven part.
 */
export function needsTranscription(
  effectiveFile: string,
  modelId: string,
  row: TranscriptState | undefined,
  errorAttempts: number,
  maxAttempts: number,
  isEdited: boolean,
): boolean {
  if (!row) return true;
  if (row.sourceFile !== effectiveFile) return true;
  if (isEdited) return false; // user-locked for this file
  if (row.model !== modelId) return true;
  if (row.status === 'done') return false;
  if (row.status === 'error') return errorAttempts < maxAttempts;
  return true; // 'processing' — resume
}
