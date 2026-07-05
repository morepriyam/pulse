import type { TranscriptLine } from './whisper';

// Our `TranscriptLine` times are centiseconds (1/100 s); WebVTT timestamps are milliseconds.
const csToMs = (cs: number) => Math.round(cs * 10);

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Milliseconds → WebVTT timestamp (`00:00:01.500`). */
function msToVttTime(ms: number): string {
  const clamped = Math.max(0, Math.round(ms));
  const h = Math.floor(clamped / 3_600_000);
  const m = Math.floor((clamped % 3_600_000) / 60_000);
  const s = Math.floor((clamped % 60_000) / 1000);
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}.${String(clamped % 1000).padStart(3, '0')}`;
}

/**
 * Serialize caption lines to a WebVTT document. WebVTT carries the word-level timing whisper
 * gives us as inline cue timestamps (`word <00:00:01.500>word` — the karaoke syntax), so a web
 * viewer can highlight the exact spoken word the way `CaptionOverlay` does in-app. Lines
 * without word data emit plain cues — viewers fall back to whatever line-level treatment they
 * have.
 */
export function linesToVtt(lines: TranscriptLine[]): string {
  const cues = lines.map((line) => {
    const timing = `${msToVttTime(csToMs(line.t0))} --> ${msToVttTime(csToMs(line.t1))}`;
    const text = line.words?.length
      ? line.words
          .map((w, i) => (i === 0 ? w.text : `<${msToVttTime(csToMs(w.t0))}>${w.text}`))
          .join(' ')
      : line.text;
    return `${timing}\n${text}`;
  });
  return `WEBVTT\n\n${cues.join('\n\n')}\n`;
}
