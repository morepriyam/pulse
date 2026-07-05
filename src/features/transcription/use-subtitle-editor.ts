import { useCallback, useMemo, useRef, useState } from 'react';

import {
  closeCoalescing,
  emptyHistory,
  type History,
  record,
  redo as redoHistory,
  undo as undoHistory,
} from './edit-history';
import type { TranscriptLine, TranscriptWord } from './whisper';

/** One editable caption cue. Times are centiseconds; `words` drives word-level highlighting. */
export type Cue = {
  id: string;
  text: string;
  t0: number;
  t1: number;
  words: TranscriptWord[];
};

export const MIN_DUR_CS = 30; // never let a cue collapse below ~0.3s
const MAX_HISTORY = 100; // undo depth (snapshots share unchanged cue objects, so this is cheap)

/** Split `text` into word tokens, spreading [t0,t1] across them by character length. */
function distributeWords(text: string, t0: number, t1: number): TranscriptWord[] {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  const span = Math.max(1, t1 - t0);
  const totalChars = tokens.reduce((sum, token) => sum + token.length, 0) || tokens.length;
  const words: TranscriptWord[] = [];
  let cursor = t0;
  for (const token of tokens) {
    const durationCs = Math.round((span * token.length) / totalChars);
    const end = Math.min(t1, cursor + durationCs);
    words.push({ text: token, t0: Math.round(cursor), t1: Math.round(end) });
    cursor = end;
  }
  words[words.length - 1].t1 = t1; // snap the last word to the cue end
  return words;
}

/** Linearly remap existing word times from the old [o0,o1] span onto the new [n0,n1] span. */
function rescaleWords(words: TranscriptWord[], o0: number, o1: number, n0: number, n1: number) {
  const oldSpan = Math.max(1, o1 - o0);
  const newSpan = n1 - n0;
  return words.map((word) => ({
    text: word.text,
    t0: Math.round(n0 + ((word.t0 - o0) / oldSpan) * newSpan),
    t1: Math.round(n0 + ((word.t1 - o0) / oldSpan) * newSpan),
  }));
}

function lineToCue(line: TranscriptLine, id: string): Cue {
  return {
    id,
    text: line.text,
    t0: line.t0,
    t1: line.t1,
    words: line.words?.length
      ? line.words.map((w) => ({ ...w }))
      : distributeWords(line.text, line.t0, line.t1),
  };
}

const bySort = (a: Cue, b: Cue) => a.t0 - b.t0 || a.t1 - b.t1;

/** Cues → persistable caption lines (sorted, empties dropped). */
function cuesToLines(cues: Cue[]): TranscriptLine[] {
  return [...cues]
    .sort(bySort)
    .filter((cue) => cue.text.trim().length > 0)
    .map((cue) => ({ text: cue.text.trim(), t0: cue.t0, t1: cue.t1, words: cue.words }));
}

const serialize = (cues: Cue[]) => JSON.stringify(cuesToLines(cues));

/**
 * Editing state for one segment's captions. Seeds cues from the effective lines, keeps them sorted,
 * and maintains word-level timing across edits (rescale on timing changes, re-distribute on text
 * changes) so the karaoke overlay keeps working. `dirty` tracks unsaved changes vs. the seed.
 *
 * Every mutation is undoable. Rapid edits of the same kind on the same cue (typing bursts, handle
 * drags) coalesce into a single undo step; `endCoalescing` (call on blur / gesture end) closes the
 * current step so the next edit starts a fresh one.
 */
export function useSubtitleEditor(initial: TranscriptLine[]) {
  // Monotonic id source for cues created at runtime (add/split). Read ONLY inside event handlers,
  // never during render — seeded cues get deterministic index ids instead (see `seed`).
  const idRef = useRef(0);
  const nextId = useCallback(() => `cue_${idRef.current++}`, []);

  // Pure (ref-free) so it can run inside useState initializers: seed cues replace the whole list,
  // so index-based ids are unique within the list and never collide with the `cue_*` handler ids.
  const seed = useCallback(
    (lines: TranscriptLine[]): Cue[] =>
      [...lines].sort((a, b) => a.t0 - b.t0).map((l, i) => lineToCue(l, `seed_${i}`)),
    [],
  );

  const [cues, setCues] = useState<Cue[]>(() => seed(initial));
  // Baseline is the SEEDED cues serialized (the seed may synthesize word timing for word-less
  // lines), so the editor opens clean rather than appearing dirty from that normalization.
  const [baseline, setBaseline] = useState(() => serialize(seed(initial)));

  // History lives in refs so mutations (which fire at drag/typing rates) don't churn extra state;
  // all cue changes flow through mutate/undo/redo/reset, which keep cuesRef in lockstep with the
  // rendered state. `canUndo/canRedo` mirror the stack sizes into state for the header buttons.
  const cuesRef = useRef(cues);
  const historyRef = useRef<History<Cue[]>>(emptyHistory());
  const [histFlags, setHistFlags] = useState({ canUndo: false, canRedo: false });

  const syncFlags = useCallback(() => {
    setHistFlags((f) => {
      const canUndo = historyRef.current.past.length > 0;
      const canRedo = historyRef.current.future.length > 0;
      return f.canUndo === canUndo && f.canRedo === canRedo ? f : { canUndo, canRedo };
    });
  }, []);

  /**
   * Apply `fn` to the cue list, recording history. `opKey` names a coalescable operation
   * (e.g. `text:<id>`, see edit-history.ts); `null` = structural op, never coalesced.
   * Returning the input array skips history (no-op).
   */
  const mutate = useCallback(
    (opKey: string | null, fn: (cues: Cue[]) => Cue[]) => {
      const prev = cuesRef.current;
      const next = fn(prev);
      if (next === prev) return;
      historyRef.current = record(historyRef.current, prev, opKey, Date.now(), MAX_HISTORY);
      cuesRef.current = next;
      setCues(next);
      syncFlags();
    },
    [syncFlags],
  );

  /** Close the current coalescing window (call on text blur / drag end). */
  const endCoalescing = useCallback(() => {
    historyRef.current = closeCoalescing(historyRef.current);
  }, []);

  const undo = useCallback(() => {
    const result = undoHistory(historyRef.current, cuesRef.current);
    if (!result) return;
    historyRef.current = result.history;
    cuesRef.current = result.value;
    setCues(result.value);
    syncFlags();
  }, [syncFlags]);

  const redo = useCallback(() => {
    const result = redoHistory(historyRef.current, cuesRef.current);
    if (!result) return;
    historyRef.current = result.history;
    cuesRef.current = result.value;
    setCues(result.value);
    syncFlags();
  }, [syncFlags]);

  const updateCue = useCallback(
    (opKey: string, id: string, fn: (cue: Cue) => Cue) => {
      mutate(opKey, (cues) => {
        if (!cues.some((cue) => cue.id === id)) return cues;
        return cues.map((cue) => (cue.id === id ? fn(cue) : cue)).sort(bySort);
      });
    },
    [mutate],
  );

  const setText = useCallback(
    (id: string, text: string) =>
      updateCue(`text:${id}`, id, (cue) => ({
        ...cue,
        text,
        words: distributeWords(text, cue.t0, cue.t1),
      })),
    [updateCue],
  );

  const setStart = useCallback(
    (id: string, t0: number) =>
      updateCue(`t0:${id}`, id, (cue) => {
        const next = Math.min(Math.max(0, Math.round(t0)), cue.t1 - MIN_DUR_CS);
        return { ...cue, t0: next, words: rescaleWords(cue.words, cue.t0, cue.t1, next, cue.t1) };
      }),
    [updateCue],
  );

  const setEnd = useCallback(
    (id: string, t1: number) =>
      updateCue(`t1:${id}`, id, (cue) => {
        const next = Math.max(Math.round(t1), cue.t0 + MIN_DUR_CS);
        return { ...cue, t1: next, words: rescaleWords(cue.words, cue.t0, cue.t1, cue.t0, next) };
      }),
    [updateCue],
  );

  const nudgeStart = useCallback(
    (id: string, delta: number) =>
      updateCue(`t0:${id}`, id, (cue) => {
        const next = Math.min(Math.max(0, cue.t0 + delta), cue.t1 - MIN_DUR_CS);
        return { ...cue, t0: next, words: rescaleWords(cue.words, cue.t0, cue.t1, next, cue.t1) };
      }),
    [updateCue],
  );

  const nudgeEnd = useCallback(
    (id: string, delta: number) =>
      updateCue(`t1:${id}`, id, (cue) => {
        const next = Math.max(cue.t1 + delta, cue.t0 + MIN_DUR_CS);
        return { ...cue, t1: next, words: rescaleWords(cue.words, cue.t0, cue.t1, cue.t0, next) };
      }),
    [updateCue],
  );

  const remove = useCallback(
    (id: string) =>
      mutate(null, (cues) => {
        const next = cues.filter((cue) => cue.id !== id);
        return next.length === cues.length ? cues : next;
      }),
    [mutate],
  );

  /** Insert a new empty cue starting at `atCs` (a ~1.5s default span). Returns its id. */
  const addCueAt = useCallback(
    (atCs: number): string => {
      const id = nextId();
      const t0 = Math.max(0, Math.round(atCs));
      const t1 = t0 + 150;
      mutate(null, (cues) => [...cues, { id, text: '', t0, t1, words: [] }].sort(bySort));
      return id;
    },
    [mutate, nextId],
  );

  /**
   * Split a cue at `atCs`, partitioning its words into the two halves.
   * Returns the id of the half that starts at the split point (or null if the split was invalid),
   * so callers can keep the selection on the playhead's side.
   */
  const splitAt = useCallback(
    (id: string, atCs: number): string | null => {
      const target = cuesRef.current.find((cue) => cue.id === id);
      if (!target || atCs <= target.t0 + MIN_DUR_CS || atCs >= target.t1 - MIN_DUR_CS) return null;
      const leftWords = target.words.filter((w) => w.t0 < atCs);
      const rightWords = target.words.filter((w) => w.t0 >= atCs);
      const makeHalf = (words: TranscriptWord[], t0: number, t1: number): Cue => ({
        id: nextId(),
        text: words
          .map((w) => w.text)
          .join(' ')
          .trim(),
        t0,
        t1,
        words,
      });
      const left = makeHalf(leftWords, target.t0, Math.round(atCs));
      const right = makeHalf(rightWords, Math.round(atCs), target.t1);
      mutate(null, (cues) =>
        cues
          .filter((cue) => cue.id !== id)
          .concat([left, right])
          .sort(bySort),
      );
      return right.id;
    },
    [mutate, nextId],
  );

  /** Merge a cue with the next one in time order. */
  const mergeNext = useCallback(
    (id: string) => {
      mutate(null, (cues) => {
        const sorted = [...cues].sort(bySort);
        const index = sorted.findIndex((cue) => cue.id === id);
        if (index < 0 || index >= sorted.length - 1) return cues;
        const first = sorted[index];
        const second = sorted[index + 1];
        const merged: Cue = {
          id: first.id,
          text: `${first.text} ${second.text}`.trim(),
          t0: first.t0,
          t1: second.t1,
          words: [...first.words, ...second.words],
        };
        return sorted
          .filter((cue) => cue.id !== first.id && cue.id !== second.id)
          .concat(merged)
          .sort(bySort);
      });
    },
    [mutate],
  );

  /** Reseed the editor (e.g. "reset to auto"); marks the editor clean and clears history. */
  const reset = useCallback(
    (lines: TranscriptLine[]) => {
      const next = seed(lines);
      cuesRef.current = next;
      historyRef.current = emptyHistory();
      setCues(next);
      setBaseline(serialize(next));
      syncFlags();
    },
    [seed, syncFlags],
  );

  const toLines = useCallback((): TranscriptLine[] => cuesToLines(cues), [cues]);

  const dirty = useMemo(() => serialize(cues) !== baseline, [cues, baseline]);

  return {
    cues,
    dirty,
    canUndo: histFlags.canUndo,
    canRedo: histFlags.canRedo,
    undo,
    redo,
    endCoalescing,
    setText,
    setStart,
    setEnd,
    nudgeStart,
    nudgeEnd,
    remove,
    addCueAt,
    splitAt,
    mergeNext,
    reset,
    toLines,
  };
}
