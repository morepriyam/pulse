import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { projectQuery, setUploadDestination } from '@/db/drafts';
import { getDraftToken } from '@/db/secure-token';
import type { Segment } from '@/db/schema';
import { useNow } from '@/hooks/use-now';

import { EXPIRY_CHECK_INTERVAL_MS, isTokenExpired } from './capability-token';
import { type DestinationOption, useDestinations } from './use-destinations';
import { uploads } from './upload-manager';
import type { Destination } from './types';
import { useDraftUploadState } from './use-uploads';

/**
 * The export screen's binding to the background upload system. This hook is now
 * a thin controller — destination-pool selection, `claim`, and a start/cancel/
 * retry surface — that hands the actual upload to the module-scope
 * `uploads` manager (see `upload-manager.ts`). It owns no orchestration, no
 * AbortController, and no "in flight" bookkeeping: leaving the screen no longer
 * aborts the upload, and a run survives navigation/backgrounding because the
 * manager, not this hook, is driving it.
 *
 * `state` is the manager's LIVE per-draft state (uploading/done/error, this
 * session only) via `useSyncExternalStore`; durable status lives in the drizzle
 * `project` row. `mergedRef` is read only at enqueue time — the merge is done by
 * the time Upload is tappable — and captured into the session the manager runs.
 */
export function useUpload(
  draftId: string,
  segments: Segment[],
  mergedRef: RefObject<{ path: string; durationMs: number } | null>,
) {
  const { data: projectRows } = useLiveQuery(projectQuery(draftId), [draftId]);
  const project = projectRows[0];
  // The device-wide pool of paired-but-unconsumed destinations (non-expired only).
  const { destinations } = useDestinations();

  // Reactive wall-clock so expiry re-evaluates on a timer, not just on writes.
  const now = useNow(EXPIRY_CHECK_INTERVAL_MS);

  // The pool destination id this draft was claimed from, so a finished upload can remove it from
  // the pool. Set at `claim`, handed to the manager on the session; the manager deletes the row on
  // success. Kept on the ref so a Retry after a failure still carries it; a re-claim overwrites it.
  const consumedIdRef = useRef<string | null>(null);

  const hasDestination =
    project?.mode === 'upload' &&
    !!project.uploadServer &&
    !!project.uploadArtifactId &&
    !!project.uploadUnit;

  // The bearer token lives in expo-secure-store, not the (reactive) drizzle row — loaded into
  // local state keyed off which draft is showing, and set directly in `claim` so the first upload
  // in the same tap doesn't wait on a re-fetch.
  const [draftToken, setDraftTokenState] = useState<string | null>(null);
  useEffect(() => {
    if (!hasDestination) return;
    let cancelled = false;
    void getDraftToken(draftId).then((token) => {
      if (!cancelled) setDraftTokenState(token);
    });
    return () => {
      cancelled = true;
    };
  }, [draftId, hasDestination]);

  const destination: Destination | null = useMemo(
    () =>
      hasDestination
        ? {
            server: project!.uploadServer!,
            token: draftToken,
            artifactId: project!.uploadArtifactId!,
            uploadUnit: project!.uploadUnit!,
            resourceUrl: project!.uploadResourceUrl,
          }
        : null,
    [hasDestination, project, draftToken],
  );
  const destinationExpired = destination !== null && isTokenExpired(destination.token, now);

  // Which pool destination the user has picked to upload to. Defaults to the most-recent
  // non-expired one, reconciled during render (adjust-state-during-render) as the pool changes.
  const [rawSelectedId, setSelectedId] = useState<string | null>(null);
  const selectedId =
    rawSelectedId && destinations.some((d) => d.id === rawSelectedId)
      ? rawSelectedId
      : (destinations[0]?.id ?? null);
  if (selectedId !== rawSelectedId) setSelectedId(selectedId);
  const selectedDestination = useMemo(
    () => destinations.find((d) => d.id === selectedId) ?? null,
    [destinations, selectedId],
  );

  // The manager's live state for this draft (transient; this session only). Durable status is on
  // the drizzle row above.
  const state = useDraftUploadState(draftId);

  const acknowledgeDone = useCallback(() => uploads.acknowledge(draftId), [draftId]);

  const start = useCallback(
    (explicitDestination?: Destination) => {
      const dest = explicitDestination ?? destination;
      if (!dest) return;
      // Hand the whole run to the manager. Expiry, resume identity, and progress are its concern
      // now; it surfaces an expired token as a non-retryable error on the live state.
      // The session carries the consumed pool id so the manager removes it once the upload actually
      // succeeds. Kept on the ref (not cleared) so a Retry after a failure still removes it; a later
      // re-claim overwrites it with the newly-picked destination.
      uploads.enqueue({
        draftId,
        destination: dest,
        segments,
        merged: mergedRef.current,
        consumedDestinationId: consumedIdRef.current,
      });
    },
    [destination, draftId, segments, mergedRef],
  );

  const cancel = useCallback(() => {
    void uploads.cancel(draftId);
  }, [draftId]);

  // Commits this draft to a chosen pool destination and starts uploading in the same tap. The pool
  // destination is removed only once the upload finishes (the manager does it), so a failed/
  // cancelled attempt keeps it around to retry or re-pick.
  const claim = useCallback(
    async (destinationId: string | null) => {
      const option = destinationId
        ? (destinations.find((d) => d.id === destinationId) ?? null)
        : null;
      if (!option || isTokenExpired(option.token, Date.now())) return;
      const claimedDestination: Destination = {
        server: option.server,
        token: option.token,
        artifactId: option.artifactId,
        uploadUnit: option.uploadUnit,
        resourceUrl: null,
      };
      await setUploadDestination(draftId, {
        server: option.server,
        token: option.token,
        artifactId: option.artifactId,
        uploadUnit: option.uploadUnit,
      });
      setDraftTokenState(option.token);
      consumedIdRef.current = option.id;
      start(claimedDestination);
    },
    [destinations, draftId, start],
  );

  // The destination whose host/mode the UI should name right now: the draft's own claimed
  // destination once a run is underway/finished, otherwise the pool option currently selected.
  const activeDestination: Destination | DestinationOption | null =
    destination && state.status !== 'idle' ? destination : selectedDestination;

  return {
    state,
    destination,
    destinationExpired,
    destinations,
    selectedId,
    setSelectedId,
    selectedDestination,
    activeDestination,
    start,
    retry: start,
    cancel,
    claim,
    acknowledgeDone,
  };
}
