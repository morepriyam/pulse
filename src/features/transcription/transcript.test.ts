import { describe, expect, it } from '@jest/globals';

import { parseTranscriptLines } from './transcript';

describe('parseTranscriptLines', () => {
  it('returns [] for null/undefined/empty input', () => {
    expect(parseTranscriptLines(null)).toEqual([]);
    expect(parseTranscriptLines(undefined)).toEqual([]);
    expect(parseTranscriptLines('')).toEqual([]);
  });

  it('returns [] for non-JSON', () => {
    expect(parseTranscriptLines('not json {')).toEqual([]);
  });

  it('parses a well-formed line array', () => {
    const json = JSON.stringify([{ text: 'hi', t0: 0, t1: 50 }]);
    expect(parseTranscriptLines(json)).toEqual([{ text: 'hi', t0: 0, t1: 50 }]);
  });

  it('parses lines carrying word-level timing', () => {
    const lines = [{ text: 'hi there', t0: 0, t1: 100, words: [{ text: 'hi', t0: 0, t1: 50 }] }];
    expect(parseTranscriptLines(JSON.stringify(lines))).toEqual(lines);
  });

  it('rejects valid-JSON-but-wrong-shape rather than yielding malformed cues', () => {
    // The bug this guards: a cast would let these through and produce broken cues downstream.
    expect(parseTranscriptLines('{}')).toEqual([]); // object, not array
    expect(parseTranscriptLines(JSON.stringify([{ foo: 1 }]))).toEqual([]); // missing text/t0/t1
    expect(parseTranscriptLines(JSON.stringify([{ text: 'x', t0: '0', t1: 1 }]))).toEqual([]); // t0 not a number
    expect(parseTranscriptLines(JSON.stringify(['just a string']))).toEqual([]);
  });

  it('rejects the whole array if any element is malformed', () => {
    const mixed = JSON.stringify([{ text: 'ok', t0: 0, t1: 1 }, { text: 'bad' }]);
    expect(parseTranscriptLines(mixed)).toEqual([]);
  });

  it('rejects a line whose words contain a malformed entry', () => {
    const bad = JSON.stringify([{ text: 'x', t0: 0, t1: 1, words: [{ text: 'w' }] }]);
    expect(parseTranscriptLines(bad)).toEqual([]);
  });
});
