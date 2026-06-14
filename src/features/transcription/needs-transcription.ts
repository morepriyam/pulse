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
 * - Row was produced from a different file (a destructive edit changed the effective file) → yes.
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
): boolean {
  if (!row) return true;
  if (row.sourceFile !== effectiveFile) return true;
  if (row.model !== modelId) return true;
  if (row.status === 'done') return false;
  if (row.status === 'error') return errorAttempts < maxAttempts;
  return true; // 'processing' — resume
}
