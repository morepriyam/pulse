import { useCallback, useMemo, useRef, useState } from 'react';

import type { TranscriptLine, TranscriptWord } from './whisper';

/** One editable caption cue. Times are centiseconds; `words` drives word-level highlighting. */
export type Cue = {
  id: string;
  text: string;
  t0: number;
  t1: number;
  words: TranscriptWord[];
};

const MIN_DUR_CS = 30; // never let a cue collapse below ~0.3s

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

  const update = useCallback((id: string, fn: (cue: Cue) => Cue) => {
    setCues((cues) => cues.map((cue) => (cue.id === id ? fn(cue) : cue)).sort(bySort));
  }, []);

  const setText = useCallback(
    (id: string, text: string) =>
      update(id, (cue) => ({ ...cue, text, words: distributeWords(text, cue.t0, cue.t1) })),
    [update],
  );

  const setStart = useCallback(
    (id: string, t0: number) =>
      update(id, (cue) => {
        const next = Math.min(Math.max(0, Math.round(t0)), cue.t1 - MIN_DUR_CS);
        return { ...cue, t0: next, words: rescaleWords(cue.words, cue.t0, cue.t1, next, cue.t1) };
      }),
    [update],
  );

  const setEnd = useCallback(
    (id: string, t1: number) =>
      update(id, (cue) => {
        const next = Math.max(Math.round(t1), cue.t0 + MIN_DUR_CS);
        return { ...cue, t1: next, words: rescaleWords(cue.words, cue.t0, cue.t1, cue.t0, next) };
      }),
    [update],
  );

  const nudgeStart = useCallback(
    (id: string, delta: number) =>
      update(id, (cue) => {
        const next = Math.min(Math.max(0, cue.t0 + delta), cue.t1 - MIN_DUR_CS);
        return { ...cue, t0: next, words: rescaleWords(cue.words, cue.t0, cue.t1, next, cue.t1) };
      }),
    [update],
  );

  const nudgeEnd = useCallback(
    (id: string, delta: number) =>
      update(id, (cue) => {
        const next = Math.max(cue.t1 + delta, cue.t0 + MIN_DUR_CS);
        return { ...cue, t1: next, words: rescaleWords(cue.words, cue.t0, cue.t1, cue.t0, next) };
      }),
    [update],
  );

  const remove = useCallback(
    (id: string) => setCues((cues) => cues.filter((cue) => cue.id !== id)),
    [],
  );

  /** Insert a new empty cue starting at `atCs` (a ~1.5s default span). */
  const addCueAt = useCallback(
    (atCs: number) => {
      const t0 = Math.max(0, Math.round(atCs));
      const t1 = t0 + 150;
      setCues((cues) => [...cues, { id: nextId(), text: '', t0, t1, words: [] }].sort(bySort));
    },
    [nextId],
  );

  /** Split a cue at `atCs`, partitioning its words into the two halves. */
  const splitAt = useCallback(
    (id: string, atCs: number) => {
      setCues((cues) => {
        const target = cues.find((cue) => cue.id === id);
        if (!target || atCs <= target.t0 + MIN_DUR_CS || atCs >= target.t1 - MIN_DUR_CS)
          return cues;
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
        return cues
          .filter((cue) => cue.id !== id)
          .concat([left, right])
          .sort(bySort);
      });
    },
    [nextId],
  );

  /** Merge a cue with the next one in time order. */
  const mergeNext = useCallback((id: string) => {
    setCues((cues) => {
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
  }, []);

  /** Reseed the editor (e.g. "reset to auto"); marks the editor clean against the new lines. */
  const reset = useCallback(
    (lines: TranscriptLine[]) => {
      const next = seed(lines);
      setCues(next);
      setBaseline(serialize(next));
    },
    [seed],
  );

  const toLines = useCallback((): TranscriptLine[] => cuesToLines(cues), [cues]);

  const dirty = useMemo(() => serialize(cues) !== baseline, [cues, baseline]);

  return {
    cues,
    dirty,
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
