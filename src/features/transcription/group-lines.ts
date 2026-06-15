import type { TranscriptLine, TranscriptWord } from './whisper';

// Caption-readability budget (Netflix/BBC-derived). A cue is one short, on-screen line that the
// overlay may wrap to at most two rows; keeping cues at ~42 chars gives punchy, karaoke-friendly
// captions that sync tightly with speech.
const MAX_LINE_CHARS = 42;
// Hard ceiling on a single cue's on-screen duration (centiseconds). 7s is the standard cap.
const MAX_DUR_CS = 700;

const SENTENCE_END = /[.!?…]["')\]]?$/;

/** Collapse the stray space whisper leaves before punctuation when words are joined (" ," → ","). */
function cueText(words: TranscriptWord[]): string {
  return words
    .map((w) => w.text)
    .join(' ')
    .replace(/\s+([,.!?;:…])/g, '$1')
    .trim();
}

function flush(words: TranscriptWord[]): TranscriptLine {
  return { text: cueText(words), t0: words[0].t0, t1: words[words.length - 1].t1, words };
}

/**
 * Fold word-level whisper segments (from a `maxLen: 1` pass) into caption-sized lines, each
 * carrying its `words[]` for word-level (karaoke) highlighting. A new line starts when the
 * current word ends a sentence, when appending the next word would exceed the character budget,
 * or when the cue would run past the max duration. Word `text` is trimmed (whisper prefixes a
 * space); `t0`/`t1` stay in centiseconds.
 */
export function groupWordsIntoLines(segments: TranscriptWord[]): TranscriptLine[] {
  const lines: TranscriptLine[] = [];
  let current: TranscriptWord[] = [];
  let chars = 0;

  for (const seg of segments) {
    const text = seg.text.trim();
    if (!text) continue;
    const word: TranscriptWord = { text, t0: seg.t0, t1: seg.t1 };

    const wouldChars = chars + (current.length ? 1 : 0) + text.length;
    const wouldDur = current.length ? seg.t1 - current[0].t0 : 0;
    if (current.length && (wouldChars > MAX_LINE_CHARS || wouldDur > MAX_DUR_CS)) {
      lines.push(flush(current));
      current = [];
      chars = 0;
    }

    current.push(word);
    chars += (current.length > 1 ? 1 : 0) + text.length;

    if (SENTENCE_END.test(text)) {
      lines.push(flush(current));
      current = [];
      chars = 0;
    }
  }

  if (current.length) lines.push(flush(current));
  return lines;
}
