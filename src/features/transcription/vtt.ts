import type { Segment } from '@/db/schema';
import { effMs } from '@/utils/segment-window';
import type { SegmentTranscript } from './use-draft-transcripts';
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

/** Offset a line (and its words) by `offsetCs` centiseconds — used to stitch clips into one timeline. */
function shiftLine(line: TranscriptLine, offsetCs: number): TranscriptLine {
  return {
    text: line.text,
    t0: line.t0 + offsetCs,
    t1: line.t1 + offsetCs,
    words: line.words?.map((w) => ({ text: w.text, t0: w.t0 + offsetCs, t1: w.t1 + offsetCs })),
  };
}

/**
 * Build a single draft-wide caption timeline from per-segment transcripts: each clip's effective
 * lines are offset by the cumulative effective duration of the clips before it (matching how the
 * merged export video concatenates them). Times stay in centiseconds.
 */
export function mergedLines(
  segments: Segment[],
  transcripts: Map<string, SegmentTranscript>,
): TranscriptLine[] {
  const out: TranscriptLine[] = [];
  let offsetMs = 0;
  for (const segment of segments) {
    const transcript = transcripts.get(segment.id);
    if (transcript?.lines.length) {
      const offsetCs = offsetMs / 10;
      for (const line of transcript.lines) out.push(shiftLine(line, offsetCs));
    }
    offsetMs += effMs(segment);
  }
  return out;
}
