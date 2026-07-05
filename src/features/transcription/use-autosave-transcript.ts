import { useCallback, useEffect, useMemo, useRef } from 'react';

import { saveEditedTranscript } from '@/db/transcripts';
import { autosaveDecision } from './autosave-gate';
import type { TranscriptLine } from './whisper';

const DEBOUNCE_MS = 700;

/**
 * Optimistic persistence for the caption editor: debounce-saves `lines` whenever they change,
 * and flushes any pending save on unmount (close / swipe-back), so there is no Save button.
 *
 * Gate that matters: `saveEditedTranscript` sets `editedLines`, which (while the segment-set
 * `signature` still matches) makes the hand-edit the effective transcript. A transcript the user
 * never touched (`savedJson == null` and never dirty) must therefore never be persisted.
 */
export function useAutosaveTranscript({
  projectId,
  signature,
  lines,
  dirty,
  savedJson,
}: {
  projectId: string;
  signature: string;
  /** Current editor lines — memoize at the call site so identity only changes on real edits. */
  lines: TranscriptLine[];
  dirty: boolean;
  /** Raw `editedLines` JSON from the DB row when the screen opened; null = no edits saved yet. */
  savedJson: string | null;
}) {
  // null = never saved (row unlocked). Once a save happens this session we keep the DB in sync
  // even if the user edits back to the baseline — the row is already locked at that point.
  const lastSavedRef = useRef<string | null>(savedJson);
  const lastQueuedRef = useRef<string | null>(null);
  const pendingRef = useRef<TranscriptLine[] | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const commit = useCallback(() => {
    timerRef.current = null;
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    const json = JSON.stringify(pending);
    if (json === lastSavedRef.current) return;
    lastSavedRef.current = json;
    saveEditedTranscript(projectId, signature, pending, Date.now()).catch((err) =>
      console.warn('[autosave] failed to persist captions', err),
    );
  }, [projectId, signature]);
  const commitRef = useRef(commit);
  useEffect(() => {
    commitRef.current = commit;
  }, [commit]);

  const serialized = useMemo(() => JSON.stringify(lines), [lines]);

  useEffect(() => {
    const decision = autosaveDecision({
      serialized,
      lastSaved: lastSavedRef.current,
      lastQueued: lastQueuedRef.current,
      dirty,
    });
    if (decision === 'in-sync') {
      // Already saved (e.g. undo back to the last-persisted state) — drop any stale pending save.
      lastQueuedRef.current = serialized;
      pendingRef.current = null;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      return;
    }
    if (decision === 'skip-untouched' || decision === 'already-queued') return;
    lastQueuedRef.current = serialized;
    pendingRef.current = lines;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => commitRef.current(), DEBOUNCE_MS);
  }, [serialized, dirty, lines]);

  // Flush on unmount so closing the screen never loses the tail of an edit burst.
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      commitRef.current();
    },
    [],
  );

  /** After reset-to-auto (`clearEditedTranscript`): the row is unlocked again — re-arm the gate. */
  const markCleared = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    pendingRef.current = null;
    lastQueuedRef.current = null;
    lastSavedRef.current = null;
  }, []);

  return { markCleared };
}
