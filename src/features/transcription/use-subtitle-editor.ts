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
  const toks = text.trim().split(/\s+/).filter(Boolean);
  if (!toks.length) return [];
  const span = Math.max(1, t1 - t0);
  const totalChars = toks.reduce((a, t) => a + t.length, 0) || toks.length;
  const words: TranscriptWord[] = [];
  let cursor = t0;
  for (const tok of toks) {
    const dur = Math.round((span * tok.length) / totalChars);
    const end = Math.min(t1, cursor + dur);
    words.push({ text: tok, t0: Math.round(cursor), t1: Math.round(end) });
    cursor = end;
  }
  words[words.length - 1].t1 = t1; // snap the last word to the cue end
  return words;
}

/** Linearly remap existing word times from the old [o0,o1] span onto the new [n0,n1] span. */
function rescaleWords(words: TranscriptWord[], o0: number, o1: number, n0: number, n1: number) {
  const os = Math.max(1, o1 - o0);
  const ns = n1 - n0;
  return words.map((w) => ({
    text: w.text,
    t0: Math.round(n0 + ((w.t0 - o0) / os) * ns),
    t1: Math.round(n0 + ((w.t1 - o0) / os) * ns),
  }));
}

function lineToCue(l: TranscriptLine, id: string): Cue {
  return {
    id,
    text: l.text,
    t0: l.t0,
    t1: l.t1,
    words: l.words?.length ? l.words.map((w) => ({ ...w })) : distributeWords(l.text, l.t0, l.t1),
  };
}

const bySort = (a: Cue, b: Cue) => a.t0 - b.t0 || a.t1 - b.t1;

/** Cues → persistable caption lines (sorted, empties dropped). */
function cuesToLines(cues: Cue[]): TranscriptLine[] {
  return [...cues]
    .sort(bySort)
    .filter((c) => c.text.trim().length > 0)
    .map((c) => ({ text: c.text.trim(), t0: c.t0, t1: c.t1, words: c.words }));
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

  const update = useCallback((id: string, fn: (c: Cue) => Cue) => {
    setCues((cs) => cs.map((c) => (c.id === id ? fn(c) : c)).sort(bySort));
  }, []);

  const setText = useCallback(
    (id: string, text: string) =>
      update(id, (c) => ({ ...c, text, words: distributeWords(text, c.t0, c.t1) })),
    [update],
  );

  const setStart = useCallback(
    (id: string, t0: number) =>
      update(id, (c) => {
        const next = Math.min(Math.max(0, Math.round(t0)), c.t1 - MIN_DUR_CS);
        return { ...c, t0: next, words: rescaleWords(c.words, c.t0, c.t1, next, c.t1) };
      }),
    [update],
  );

  const setEnd = useCallback(
    (id: string, t1: number) =>
      update(id, (c) => {
        const next = Math.max(Math.round(t1), c.t0 + MIN_DUR_CS);
        return { ...c, t1: next, words: rescaleWords(c.words, c.t0, c.t1, c.t0, next) };
      }),
    [update],
  );

  const nudgeStart = useCallback((id: string, delta: number) => {
    setCues((cs) =>
      cs
        .map((c) => {
          if (c.id !== id) return c;
          const next = Math.min(Math.max(0, c.t0 + delta), c.t1 - MIN_DUR_CS);
          return { ...c, t0: next, words: rescaleWords(c.words, c.t0, c.t1, next, c.t1) };
        })
        .sort(bySort),
    );
  }, []);

  const nudgeEnd = useCallback((id: string, delta: number) => {
    setCues((cs) =>
      cs
        .map((c) => {
          if (c.id !== id) return c;
          const next = Math.max(c.t1 + delta, c.t0 + MIN_DUR_CS);
          return { ...c, t1: next, words: rescaleWords(c.words, c.t0, c.t1, c.t0, next) };
        })
        .sort(bySort),
    );
  }, []);

  const remove = useCallback((id: string) => setCues((cs) => cs.filter((c) => c.id !== id)), []);

  /** Insert a new empty cue starting at `atCs` (a ~1.5s default span). */
  const addCueAt = useCallback(
    (atCs: number) => {
      const t0 = Math.max(0, Math.round(atCs));
      const t1 = t0 + 150;
      setCues((cs) => [...cs, { id: nextId(), text: '', t0, t1, words: [] }].sort(bySort));
    },
    [nextId],
  );

  /** Split a cue at `atCs`, partitioning its words into the two halves. */
  const splitAt = useCallback(
    (id: string, atCs: number) => {
      setCues((cs) => {
        const c = cs.find((x) => x.id === id);
        if (!c || atCs <= c.t0 + MIN_DUR_CS || atCs >= c.t1 - MIN_DUR_CS) return cs;
        const left = c.words.filter((w) => w.t0 < atCs);
        const right = c.words.filter((w) => w.t0 >= atCs);
        const mk = (words: TranscriptWord[], t0: number, t1: number): Cue => ({
          id: nextId(),
          text: words.map((w) => w.text).join(' ').trim(),
          t0,
          t1,
          words,
        });
        const a = mk(left, c.t0, Math.round(atCs));
        const b = mk(right, Math.round(atCs), c.t1);
        return cs.filter((x) => x.id !== id).concat([a, b]).sort(bySort);
      });
    },
    [nextId],
  );

  /** Merge a cue with the next one in time order. */
  const mergeNext = useCallback((id: string) => {
    setCues((cs) => {
      const sorted = [...cs].sort(bySort);
      const i = sorted.findIndex((c) => c.id === id);
      if (i < 0 || i >= sorted.length - 1) return cs;
      const a = sorted[i];
      const b = sorted[i + 1];
      const merged: Cue = {
        id: a.id,
        text: `${a.text} ${b.text}`.trim(),
        t0: a.t0,
        t1: b.t1,
        words: [...a.words, ...b.words],
      };
      return sorted.filter((c) => c.id !== a.id && c.id !== b.id).concat(merged).sort(bySort);
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
