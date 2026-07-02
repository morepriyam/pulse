import { describe, expect, it } from '@jest/globals';

import { autosaveDecision } from './autosave-gate';

describe('autosave-gate', () => {
  it('never persists an untouched transcript (would lock it against re-transcription)', () => {
    expect(
      autosaveDecision({ serialized: '[auto]', lastSaved: null, lastQueued: null, dirty: false }),
    ).toBe('skip-untouched');
  });

  it('queues the first real edit on an unlocked row', () => {
    expect(
      autosaveDecision({ serialized: '[edit]', lastSaved: null, lastQueued: null, dirty: true }),
    ).toBe('queue');
  });

  it('keeps the DB in sync after a save even when the editor is back at its baseline', () => {
    // User edited (save happened), then undid to the clean baseline: dirty is false but the
    // last-saved content differs, so the baseline still gets persisted.
    expect(
      autosaveDecision({
        serialized: '[baseline]',
        lastSaved: '[edit]',
        lastQueued: null,
        dirty: false,
      }),
    ).toBe('queue');
  });

  it('is in-sync when the editor matches the last save (drops stale pending work)', () => {
    expect(
      autosaveDecision({ serialized: '[a]', lastSaved: '[a]', lastQueued: '[b]', dirty: true }),
    ).toBe('in-sync');
  });

  it('leaves the running debounce alone when content has not changed since queueing', () => {
    expect(
      autosaveDecision({ serialized: '[a]', lastSaved: '[old]', lastQueued: '[a]', dirty: true }),
    ).toBe('already-queued');
  });

  it('opens on a row that already has edits without immediately re-queueing identical content', () => {
    expect(
      autosaveDecision({ serialized: '[e]', lastSaved: '[e]', lastQueued: null, dirty: false }),
    ).toBe('in-sync');
  });
});
