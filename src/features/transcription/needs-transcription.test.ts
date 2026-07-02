import { describe, expect, it } from '@jest/globals';

import { needsTranscription, type TranscriptState } from './needs-transcription';

const MAX = 2;
const done = (over: Partial<TranscriptState> = {}): TranscriptState => ({
  model: 'base.en',
  sourceFile: 'a.mp4',
  status: 'done',
  ...over,
});

describe('needsTranscription', () => {
  it('runs when there is no row yet', () => {
    expect(needsTranscription('a.mp4', 'base.en', undefined, 0, MAX, false)).toBe(true);
  });

  it('skips a matching, completed row', () => {
    expect(needsTranscription('a.mp4', 'base.en', done(), 0, MAX, false)).toBe(false);
  });

  it('re-runs when the effective file changed (destructive edit)', () => {
    expect(needsTranscription('edited.mp4', 'base.en', done(), 0, MAX, false)).toBe(true);
  });

  it('re-runs when the model changed', () => {
    expect(needsTranscription('a.mp4', 'small.en-q5_1', done(), 0, MAX, false)).toBe(true);
  });

  it('resumes a row stranded in processing', () => {
    expect(needsTranscription('a.mp4', 'base.en', done({ status: 'processing' }), 0, MAX, false)).toBe(
      true,
    );
  });

  it('retries an errored row while under the attempt budget', () => {
    const row = done({ status: 'error' });
    expect(needsTranscription('a.mp4', 'base.en', row, 0, MAX, false)).toBe(true);
    expect(needsTranscription('a.mp4', 'base.en', row, 1, MAX, false)).toBe(true);
  });

  it('gives up on an errored row once the budget is spent', () => {
    const row = done({ status: 'error' });
    expect(needsTranscription('a.mp4', 'base.en', row, MAX, MAX, false)).toBe(false);
  });

  it('a file change overrides a spent error budget (fresh file, fresh start)', () => {
    const row = done({ status: 'error', sourceFile: 'old.mp4' });
    expect(needsTranscription('new.mp4', 'base.en', row, MAX, MAX, false)).toBe(true);
  });

  it('locks a hand-edited row against a model switch', () => {
    // Same file, different model — would normally re-run, but the user edit wins.
    expect(needsTranscription('a.mp4', 'small.en-q5_1', done(), 0, MAX, true)).toBe(false);
  });

  it('still re-runs an edited row when the effective file changed (edit is stale)', () => {
    expect(needsTranscription('edited.mp4', 'base.en', done(), 0, MAX, true)).toBe(true);
  });
});
