// Native-free transcript types + serialization, split out from whisper.ts so the pure parsing logic
// can be unit-tested without loading whisper.rn / react-native-video-trim. whisper.ts re-exports
// these, so existing `from './whisper'` imports keep working.

/**
 * One word of a transcript. `t0`/`t1` are whisper.cpp timestamps in **centiseconds** (1/100s)
 * relative to the clip's audio start. Words drive word-level (karaoke) caption highlighting.
 */
export type TranscriptWord = { text: string; t0: number; t1: number };

/**
 * One transcribed line (caption cue). `t0`/`t1` are **centiseconds** relative to the clip's
 * audio start — divide by 100 for seconds when rendering. `words` (when present) carries the
 * per-word timing within the line; older stored rows may omit it and render line-level only.
 */
export type TranscriptLine = { text: string; t0: number; t1: number; words?: TranscriptWord[] };

export type TranscriptResult = {
  language: string;
  text: string;
  lines: TranscriptLine[];
};

function isTimedText(v: unknown): v is { text: string; t0: number; t1: number } {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.text === 'string' && typeof o.t0 === 'number' && typeof o.t1 === 'number';
}

function isTranscriptLine(v: unknown): v is TranscriptLine {
  if (!isTimedText(v)) return false;
  const words = (v as Record<string, unknown>).words;
  return words === undefined || (Array.isArray(words) && words.every(isTimedText));
}

/** Parse a persisted `lines`/`editedLines` JSON column to `TranscriptLine[]`; `[]` on null/malformed. */
export function parseTranscriptLines(json: string | null | undefined): TranscriptLine[] {
  if (!json) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    // Validate the shape rather than trusting the cast: a row that's valid JSON but the wrong
    // shape (a stray `{}` or a pre-format array) would otherwise yield malformed cues downstream.
    if (!Array.isArray(parsed) || !parsed.every(isTranscriptLine)) return [];
    return parsed;
  } catch {
    return [];
  }
}
