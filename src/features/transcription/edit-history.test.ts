import { describe, expect, it } from '@jest/globals';

import {
  closeCoalescing,
  COALESCE_MS,
  emptyHistory,
  type History,
  record,
  redo,
  undo,
} from './edit-history';

const T0 = 1_000_000;

describe('edit-history', () => {
  it('records a step and undoes/redoes it', () => {
    let h: History<string> = emptyHistory();
    h = record(h, 'a', null, T0);

    const u = undo(h, 'b');
    expect(u?.value).toBe('a');
    expect(u!.history.past).toHaveLength(0);

    const r = redo(u!.history, 'a');
    expect(r?.value).toBe('b');
    expect(r!.history.past).toEqual(['a']);
    expect(r!.history.future).toHaveLength(0);
  });

  it('returns null when there is nothing to undo/redo', () => {
    const h = emptyHistory<string>();
    expect(undo(h, 'x')).toBeNull();
    expect(redo(h, 'x')).toBeNull();
  });

  it('coalesces same-key edits inside the window into one step', () => {
    // Simulates a typing burst: h -> he -> hey, all under key text:1.
    let h: History<string> = emptyHistory();
    h = record(h, '', 'text:1', T0);
    h = record(h, 'h', 'text:1', T0 + 100);
    h = record(h, 'he', 'text:1', T0 + 200);
    expect(h.past).toEqual(['']); // one snapshot — undo lands before the burst

    const u = undo(h, 'hey');
    expect(u?.value).toBe('');
  });

  it('does not coalesce across different keys', () => {
    let h: History<string> = emptyHistory();
    h = record(h, 'a', 'text:1', T0);
    h = record(h, 'b', 'text:2', T0 + 100);
    expect(h.past).toEqual(['a', 'b']);
  });

  it('does not coalesce once the window has elapsed', () => {
    let h: History<string> = emptyHistory();
    h = record(h, 'a', 'text:1', T0);
    h = record(h, 'b', 'text:1', T0 + COALESCE_MS);
    expect(h.past).toEqual(['a', 'b']);
  });

  it('never coalesces structural (null-key) ops, and they break a coalescing chain', () => {
    let h: History<string> = emptyHistory();
    h = record(h, 'a', null, T0);
    h = record(h, 'b', null, T0 + 1);
    expect(h.past).toEqual(['a', 'b']);

    h = record(h, 'c', 'text:1', T0 + 2);
    h = record(h, 'd', null, T0 + 3); // split/merge/delete mid-burst
    h = record(h, 'e', 'text:1', T0 + 4); // same key again, but the chain was broken
    expect(h.past).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('closeCoalescing makes the next same-key edit start a fresh step', () => {
    let h: History<string> = emptyHistory();
    h = record(h, 'a', 'text:1', T0);
    h = closeCoalescing(h); // blur / drag end
    h = record(h, 'b', 'text:1', T0 + 100);
    expect(h.past).toEqual(['a', 'b']);
  });

  it('recording clears the redo stack', () => {
    let h: History<string> = emptyHistory();
    h = record(h, 'a', null, T0);
    const u = undo(h, 'b')!;
    expect(u.history.future).toEqual(['b']);

    h = record(u.history, u.value, null, T0 + 1);
    expect(h.future).toHaveLength(0);
  });

  it('caps the undo depth, dropping the oldest snapshots', () => {
    let h: History<number> = emptyHistory();
    for (let i = 0; i < 10; i++) h = record(h, i, null, T0 + i, 3);
    expect(h.past).toEqual([7, 8, 9]);
  });
});
