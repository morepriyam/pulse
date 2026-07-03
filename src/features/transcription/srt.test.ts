import { describe, expect, it } from '@jest/globals';

import { linesToVtt } from './srt';
import type { TranscriptLine } from './whisper';

describe('linesToVtt', () => {
  it('emits word-level inline cue timestamps when the line carries words', () => {
    const lines: TranscriptLine[] = [
      {
        text: 'Hello there friend.',
        t0: 0,
        t1: 150,
        words: [
          { text: 'Hello', t0: 0, t1: 50 },
          { text: 'there', t0: 50, t1: 100 },
          { text: 'friend.', t0: 100, t1: 150 },
        ],
      },
    ];
    expect(linesToVtt(lines)).toBe(
      'WEBVTT\n\n' +
        '00:00:00.000 --> 00:00:01.500\n' +
        'Hello <00:00:00.500>there <00:00:01.000>friend.\n',
    );
  });

  it('falls back to a plain cue for a line without word timing', () => {
    const lines: TranscriptLine[] = [{ text: 'Just a line.', t0: 120, t1: 480 }];
    expect(linesToVtt(lines)).toBe(
      'WEBVTT\n\n00:00:01.200 --> 00:00:04.800\nJust a line.\n',
    );
  });

  it('separates multiple cues with blank lines and rolls times past a minute', () => {
    const lines: TranscriptLine[] = [
      { text: 'First.', t0: 0, t1: 100 },
      { text: 'Second.', t0: 6150, t1: 6300 }, // 61.5s → 00:01:01.500
    ];
    const vtt = linesToVtt(lines);
    expect(vtt).toContain('00:00:00.000 --> 00:00:01.000\nFirst.');
    expect(vtt).toContain('\n\n00:01:01.500 --> 00:01:03.000\nSecond.');
  });
});
