import { build, parse } from 'subsrt-ts';
import type { Caption, ContentCaption } from 'subsrt-ts/dist/types/handler';

import type { Segment } from '@/db/schema';
import { effMs } from '@/utils/segment-window';
import type { SegmentTranscript } from './use-draft-transcripts';
import type { TranscriptLine } from './whisper';

// Our `TranscriptLine` times are centiseconds (1/100 s); subsrt captions are milliseconds.
const csToMs = (cs: number) => Math.round(cs * 10);
const msToCs = (ms: number) => Math.round(ms / 10);

function linesToCaptions(lines: TranscriptLine[]): ContentCaption[] {
  return lines.map((line, index) => {
    const start = csToMs(line.t0);
    const end = csToMs(line.t1);
    return {
      type: 'caption',
      index: index + 1,
      start,
      end,
      duration: Math.max(0, end - start),
      content: line.text,
      text: line.text,
    };
  });
}

/** Serialize caption lines to an SRT document (universal, sharable). */
export function linesToSrt(lines: TranscriptLine[]): string {
  return build(linesToCaptions(lines), { format: 'srt' });
}

/** Parse an SRT document back into caption lines (no word-level data — SRT has none). */
export function srtToLines(srt: string): TranscriptLine[] {
  return parse(srt)
    .filter((caption: Caption): caption is ContentCaption => caption.type === 'caption')
    .map((caption) => ({
      text: caption.text.trim(),
      t0: msToCs(caption.start),
      t1: msToCs(caption.end),
    }));
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
