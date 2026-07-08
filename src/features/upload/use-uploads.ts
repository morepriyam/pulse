import { useCallback, useSyncExternalStore } from 'react';

import { uploads } from './upload-manager';
import type { LiveUploadState } from './types';

/**
 * Subscribes a component to the background upload manager's live, per-draft
 * state (progress ticks and the transient uploading/done/error status). Uses
 * React's `useSyncExternalStore` — the correct primitive for an external mutable
 * store: it's tearing-safe and the manager returns a stable `===` reference for
 * an untouched draft, so idle drafts never cause spurious re-renders.
 *
 * This is the LIVE channel only (never persisted). Durable per-draft status
 * (uploaded/failed) is read separately from SQLite via drizzle's `useLiveQuery`.
 */
export function useDraftUploadState(draftId: string): LiveUploadState {
  const getSnapshot = useCallback(() => uploads.getDraftState(draftId), [draftId]);
  return useSyncExternalStore(uploads.subscribe, getSnapshot);
}
