import { describe, expect, it } from '@jest/globals';

import { groupWordsIntoLines } from './group-lines';
import type { TranscriptWord } from './whisper';

// Build word segments at 50cs (0.5s) each, as whisper would emit them with maxLen: 1.
const words = (...texts: string[]): TranscriptWord[] =>
  texts.map((text, i) => ({ text, t0: i * 50, t1: (i + 1) * 50 }));

describe('groupWordsIntoLines', () => {
  it('keeps a short sentence as one line with its words', () => {
    const lines = groupWordsIntoLines(words(' Hello', ' there', ' friend.'));
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toBe('Hello there friend.');
    expect(lines[0].t0).toBe(0);
    expect(lines[0].t1).toBe(150);
    expect(lines[0].words?.map((w) => w.text)).toEqual(['Hello', 'there', 'friend.']);
  });

  it('breaks at sentence-ending punctuation', () => {
    const lines = groupWordsIntoLines(words(' One.', ' Two', ' three.'));
    expect(lines).toHaveLength(2);
    expect(lines[0].text).toBe('One.');
    expect(lines[1].text).toBe('Two three.');
  });

  it('breaks when a line would exceed the character budget', () => {
    const long = words(...Array.from({ length: 12 }, () => 'wordword')); // 8 chars each
    const lines = groupWordsIntoLines(long);
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines) expect(l.text.length).toBeLessThanOrEqual(42);
  });

  it('cleans the stray space before punctuation', () => {
    const lines = groupWordsIntoLines(words(' Wait', ' ,', ' what?'));
    expect(lines[0].text).toBe('Wait, what?');
  });
});
