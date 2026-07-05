import { describe, expect, it } from '@jest/globals';

import { activeWordIndex } from './word-timing';

// Three back-to-back words at 50cs each: [0,50), [50,100), [100,150).
const words = [
  { t0: 0, t1: 50 },
  { t0: 50, t1: 100 },
  { t0: 100, t1: 150 },
];

describe('activeWordIndex', () => {
  it('returns -1 before the first word starts', () => {
    expect(activeWordIndex(words, -1)).toBe(-1);
  });

  it('returns the word covering the playhead', () => {
    expect(activeWordIndex(words, 0)).toBe(0);
    expect(activeWordIndex(words, 49)).toBe(0);
    expect(activeWordIndex(words, 51)).toBe(1);
    expect(activeWordIndex(words, 125)).toBe(2);
  });

  it('resolves a boundary tie (posCs == t1 == next t0) to the earlier word (inclusive end)', () => {
    // word 0 is [0,50] inclusive, so at exactly 50 the highlight is still on word 0.
    expect(activeWordIndex(words, 50)).toBe(0);
  });

  it('rests on the last started word during a gap between words', () => {
    const gapped = [
      { t0: 0, t1: 20 },
      { t0: 80, t1: 100 },
    ];
    // Playhead at 50cs is past word 0's end but before word 1 starts — highlight stays on word 0.
    expect(activeWordIndex(gapped, 50)).toBe(0);
  });

  it('stays on the last word after the final word ends', () => {
    expect(activeWordIndex(words, 999)).toBe(2);
  });

  it('returns -1 for an empty word list', () => {
    expect(activeWordIndex([], 10)).toBe(-1);
  });
});
