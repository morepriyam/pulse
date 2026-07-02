/**
 * Pure undo/redo history with op-key coalescing, used by the subtitle editor. Snapshots are
 * whole values (the editor stores `Cue[]` arrays, which share unchanged cue objects, so the
 * memory cost per step is one array). Kept free of React so it is unit-testable.
 */

export const COALESCE_MS = 900; // same-op edits inside this window collapse into one undo step

export type History<T> = {
  past: T[];
  future: T[];
  lastOp: { key: string; at: number } | null;
};

export const emptyHistory = <T>(): History<T> => ({ past: [], future: [], lastOp: null });

/**
 * Record that `current` is about to be replaced by an edit. `opKey` names a coalescable
 * operation (e.g. `text:<id>`): consecutive same-key records within COALESCE_MS share the first
 * record's snapshot, so a typing burst or handle drag undoes in one step. `null` = structural
 * op, never coalesced. Any record clears the redo stack.
 */
export function record<T>(
  h: History<T>,
  current: T,
  opKey: string | null,
  now: number,
  max = 100,
): History<T> {
  const coalesce = opKey !== null && h.lastOp?.key === opKey && now - h.lastOp.at < COALESCE_MS;
  const past = coalesce ? h.past : [...h.past, current].slice(-max);
  return { past, future: [], lastOp: opKey ? { key: opKey, at: now } : null };
}

/** Close the current coalescing window (call on text blur / drag end). */
export function closeCoalescing<T>(h: History<T>): History<T> {
  return h.lastOp === null ? h : { ...h, lastOp: null };
}

export function undo<T>(h: History<T>, current: T): { history: History<T>; value: T } | null {
  if (h.past.length === 0) return null;
  return {
    value: h.past[h.past.length - 1],
    history: { past: h.past.slice(0, -1), future: [...h.future, current], lastOp: null },
  };
}

export function redo<T>(h: History<T>, current: T): { history: History<T>; value: T } | null {
  if (h.future.length === 0) return null;
  return {
    value: h.future[h.future.length - 1],
    history: { past: [...h.past, current], future: h.future.slice(0, -1), lastOp: null },
  };
}
