/**
 * The decision half of the caption autosave, kept pure for unit tests. The stake: persisting via
 * `saveEditedTranscript` sets `editedLines`, which LOCKS the transcript row against auto
 * re-transcription and model-switch regeneration — so an untouched transcript must never be
 * saved. `lastSaved === null` means the row has no edits (unlocked); once a save happens the
 * editor keeps the DB in sync even if the user edits back to the baseline (`dirty` false again).
 */
export type AutosaveDecision =
  /** Editor matches what's saved — drop any pending save. */
  | 'in-sync'
  /** Row is unlocked and the user hasn't edited — never lock it. */
  | 'skip-untouched'
  /** This exact content is already debouncing — leave the timer alone. */
  | 'already-queued'
  /** New content — (re)start the debounce. */
  | 'queue';

export function autosaveDecision({
  serialized,
  lastSaved,
  lastQueued,
  dirty,
}: {
  /** Serialized current editor lines. */
  serialized: string;
  /** Serialized last-persisted lines, or null if the row has no edits saved. */
  lastSaved: string | null;
  /** Serialized content of the pending debounce, if any. */
  lastQueued: string | null;
  dirty: boolean;
}): AutosaveDecision {
  if (serialized === lastSaved) return 'in-sync';
  if (lastSaved === null && !dirty) return 'skip-untouched';
  if (serialized === lastQueued) return 'already-queued';
  return 'queue';
}
