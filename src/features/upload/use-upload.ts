import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  getUploadArtifact,
  projectQuery,
  setCaptionsUploadStatus,
  setUploadDestination,
  setUploadProgress,
  upsertUploadArtifact,
} from '@/db/drafts';
import { clearPendingPairing, parsePendingPairing, type PendingPairing, pendingPairingQuery } from '@/db/pairing';
import { getDraftToken, getPendingPairingToken } from '@/db/secure-token';
import type { Segment } from '@/db/schema';
import { useTick } from '@/hooks/use-tick';
import { useDraftTranscripts } from '@/features/transcription/use-draft-transcripts';
import { linesToSrt, mergedLines } from '@/features/transcription/srt';
import { absolutize } from '@/utils/file-store';
import { effFile } from '@/utils/segment-window';

import { waitUntilAppForeground } from './app-state-gate';
import { decodeCapabilityClaims, isClaimsExpired } from './capability-token';
import { uploadRemainderNative } from './native-chunk-upload';
import {
  type ArtifactKind,
  cancelTusUpload,
  TusUploadError,
  type TusUploadOptions,
  uploadViaTus,
} from './tus-client';

// Safety margin before a token's real `exp` so we never start a request that would land at the
// server just past expiry — see `capability-token.ts`. Also how often the hook re-checks expiry
// on its own (`useTick`), so a button that's still valid disappears within this long of going stale.
const EXPIRY_BUFFER_MS = 10_000;
const EXPIRY_CHECK_INTERVAL_MS = 15_000;

/** Best-effort: `null` token or an opaquely-shaped one (a non-pulsevault server) means "unknown", not "expired" — never block on what we can't read. */
function isTokenExpired(token: string | null): boolean {
  if (!token) return false;
  const claims = decodeCapabilityClaims(token);
  if (!claims) return false;
  return isClaimsExpired(claims, EXPIRY_BUFFER_MS, Date.now());
}

const EXPIRED_PAIRING_MESSAGE = 'Upload link expired — ask the operator for a new pairing link.';

class ExpiredPairingError extends Error {
  readonly retryable = false;
  constructor() {
    super(EXPIRED_PAIRING_MESSAGE);
    this.name = 'ExpiredPairingError';
  }
}

export type UploadState =
  | { status: 'idle' }
  | { status: 'uploading'; progress: number }
  | { status: 'done'; resourceUrl: string }
  | { status: 'error'; reason: string; retryable: boolean };

type Destination = {
  server: string;
  token: string | null;
  artifactId: string;
  uploadUnit: 'beat' | 'merged';
  resourceUrl: string | null;
};

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function sha256Checksum(file: File): Promise<string> {
  const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, await file.bytes());
  return `sha256:${bufferToHex(digest)}`;
}

/** Writes text to a fresh temp file under the cache directory so it can be sliced/uploaded like any other File. */
function writeTempTextFile(name: string, contents: string): File {
  const dir = new Directory(Paths.cache, 'uploads');
  dir.create({ intermediates: true, idempotent: true });
  const file = new File(dir, name);
  if (file.exists) file.delete();
  file.write(contents);
  return file;
}

function describeError(err: unknown): { reason: string; retryable: boolean } {
  if (err && typeof err === 'object' && 'retryable' in err) {
    const e = err as { message?: string; retryable: boolean };
    return { reason: e.message ?? 'Upload failed', retryable: e.retryable };
  }
  if (err instanceof Error && err.name === 'AbortError') {
    return { reason: 'Cancelled', retryable: true };
  }
  return { reason: err instanceof Error ? err.message : 'Upload failed', retryable: true };
}

/**
 * Drives uploading a draft to its paired server. Branches on the destination's
 * stored `uploadUnit`: `"merged"` uploads the single merged export video plus
 * one merged-SRT captions artifact (same session); `"beat"` uploads each
 * segment's effective file individually under its own existing id, plus a
 * small ordering manifest and per-beat captions — no merge/re-encode pass at
 * all in that branch. Every secondary artifact in a session declares
 * `relatedTo` pointing at the session anchor (`destination.artifactId`) so the
 * one capability token issued for that anchor authorizes the whole session.
 *
 * Every secondary artifact's identity (and, once known, its resource URL) is
 * persisted in `upload_artifacts` keyed by a stable local key (e.g. a beat's
 * `${segmentId}:video`) — a retry looks up the existing entry and resumes it
 * via `tus-client`'s normal HEAD-then-PATCH resume path instead of minting a
 * fresh artifactId and re-uploading a duplicate from byte 0.
 */
export function useUpload(
  draftId: string,
  segments: Segment[],
  merged: { path: string; durationMs: number } | null,
) {
  const { data: projectRows } = useLiveQuery(projectQuery(draftId), [draftId]);
  const project = projectRows[0];
  const { data: pendingPairingRows } = useLiveQuery(pendingPairingQuery);
  const transcripts = useDraftTranscripts(draftId);
  // Transient state for an *active* run (uploading/error this session); when
  // idle, the displayed status instead derives directly from the DB below —
  // an already-uploaded draft shows "done" without a redundant effect+setState
  // round-trip just to mirror persisted state into local state.
  const [activeState, setActiveState] = useState<UploadState>({ status: 'idle' });

  const controllerRef = useRef<AbortController | null>(null);
  // Guards a double-tap on Retry from leaking the previous run's controller — `start` would
  // otherwise overwrite `controllerRef.current` with a second one while the first is still
  // running, making the first uncancellable.
  const runningRef = useRef(false);
  // The sub-artifact actually being uploaded right now — not necessarily the session anchor
  // (e.g. mid-captions-upload in merged mode, or a beat segment) — so `cancel()` can DELETE
  // the resource that's really in flight instead of always targeting the anchor.
  const currentUploadRef = useRef<{ artifactId: string; resourceUrl: string | null } | null>(null);

  // Re-evaluate expiry on a timer too, not just on writes — a token can go stale while the user
  // is just sitting on this screen.
  useTick(EXPIRY_CHECK_INTERVAL_MS);

  const hasDestination =
    project?.mode === 'upload' && !!project.uploadServer && !!project.uploadArtifactId && !!project.uploadUnit;

  // The bearer token lives in expo-secure-store, not the (reactive) drizzle-backed `project`
  // row — SecureStore has no live-query equivalent, so it's loaded into local state keyed off
  // which draft is showing, and set directly wherever this hook itself writes a fresh token
  // (`claim()`) so the very first upload in the same tap doesn't have to wait on a re-fetch.
  // Stale/unused rather than actively reset when `hasDestination` is false — `destination`
  // below only ever reads it while `hasDestination` is true, and the effect re-fires (keyed
  // on `draftId`) the moment a destination reappears, so nothing reads a wrong-draft value.
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
  const destinationExpired = destination !== null && isTokenExpired(destination.token);

  // Keyed on the row's raw value (not a fresh `parsePendingPairing()` object every render) so
  // the token-loading effect below only re-fires when the pairing actually changes.
  const rawPendingPairing = useMemo(
    () => parsePendingPairing(pendingPairingRows[0]?.value),
    [pendingPairingRows],
  );
  // Stale/unused rather than actively reset when there's no pending pairing — `pendingPairing`
  // below only ever reads it alongside a truthy `rawPendingPairing`.
  const [pendingToken, setPendingTokenState] = useState<string | null>(null);
  useEffect(() => {
    if (!rawPendingPairing) return;
    let cancelled = false;
    void getPendingPairingToken().then((token) => {
      if (!cancelled) setPendingTokenState(token);
    });
    return () => {
      cancelled = true;
    };
  }, [rawPendingPairing]);
  const pendingPairingExpired = rawPendingPairing !== null && isTokenExpired(pendingToken);
  // Only offer the global pending pairing on a draft that hasn't already claimed its own
  // destination — and never once it's expired (§ "don't show it when expired").
  const pendingPairing: PendingPairing | null =
    destination === null && rawPendingPairing && !pendingPairingExpired
      ? { ...rawPendingPairing, token: pendingToken }
      : null;

  // Garbage-collect a pairing that went stale before anyone claimed it, so it doesn't linger as
  // dead state and doesn't get raced into `claim()` by a stale closure.
  useEffect(() => {
    if (rawPendingPairing && pendingPairingExpired) void clearPendingPairing();
  }, [rawPendingPairing, pendingPairingExpired]);

  const state: UploadState =
    activeState.status === 'idle' && project?.uploadStatus === 'uploaded' && project.uploadResourceUrl
      ? { status: 'done', resourceUrl: project.uploadResourceUrl }
      : activeState;

  const uploadOne = useCallback(
    async (
      destination: Destination,
      artifact: { artifactId: string; filename: string; kind: ArtifactKind; relatedTo?: string; file: File },
      resourceUrl: string | null,
      checksum: string | undefined,
      signal: AbortSignal,
      onProgress?: TusUploadOptions['onProgress'],
    ) => {
      // Checked before every single artifact (not just once at the start of a run) — a
      // beat-mode session uploads many small files in sequence, and a token that was fine at
      // the start can go stale partway through. Stopping here with a clear, non-retryable
      // reason beats letting the loop run into a confusing wall of 403s.
      if (isTokenExpired(destination.token)) throw new ExpiredPairingError();
      currentUploadRef.current = { artifactId: artifact.artifactId, resourceUrl };
      const result = await uploadViaTus({
        server: destination.server,
        token: destination.token,
        artifactId: artifact.artifactId,
        filename: artifact.filename,
        kind: artifact.kind,
        relatedTo: artifact.relatedTo,
        checksum,
        file: artifact.file,
        resourceUrl,
        onResourceCreated: (url) => {
          currentUploadRef.current = { artifactId: artifact.artifactId, resourceUrl: url };
        },
        signal,
        // A single `uploadOne` call can span one long-lived retry loop (many HEAD/PATCH
        // cycles), and the app can sit backgrounded for hours mid-upload — long enough for
        // the token to expire between attempts even though it was checked at the top of this
        // function. Re-checking here, every time the loop regains foreground (not just once
        // at the start), surfaces the same clear `ExpiredPairingError`-shaped message instead
        // of a confusing 403 deep inside the retry loop's backoff.
        waitUntilForeground: async (sig) => {
          await waitUntilAppForeground(sig);
          if (isTokenExpired(destination.token)) {
            throw new TusUploadError(EXPIRED_PAIRING_MESSAGE, { retryable: false });
          }
        },
        uploadRemainder: uploadRemainderNative,
        onProgress,
      });
      currentUploadRef.current = { artifactId: artifact.artifactId, resourceUrl: result.resourceUrl };
      return result;
    },
    [],
  );

  const uploadMerged = useCallback(
    async (destination: Destination, signal: AbortSignal) => {
      if (!merged) throw new Error('Export is not ready yet');
      const file = new File(merged.path);
      const checksum = await sha256Checksum(file);
      const result = await uploadOne(
        destination,
        { artifactId: destination.artifactId, filename: `${draftId}.mp4`, kind: 'video', file },
        destination.resourceUrl,
        checksum,
        signal,
        ({ bytesSent, totalBytes }) =>
          setActiveState({ status: 'uploading', progress: totalBytes ? bytesSent / totalBytes : 0 }),
      );
      await setUploadProgress(draftId, { status: 'uploaded', resourceUrl: result.resourceUrl });

      const lines = mergedLines(segments, transcripts);
      if (lines.length > 0) {
        await setCaptionsUploadStatus(draftId, 'uploading');
        const srtFile = writeTempTextFile(`${draftId}.srt`, linesToSrt(lines));
        // Reuse a previously-reserved captions artifact so a retry after a captions-PATCH
        // failure resumes it instead of minting a new UUID and uploading a duplicate.
        const existing = await getUploadArtifact(draftId, 'captions');
        const captionsArtifactId = existing?.artifactId ?? Crypto.randomUUID();
        if (!existing) await upsertUploadArtifact(draftId, 'captions', { artifactId: captionsArtifactId });
        const captionsResult = await uploadOne(
          destination,
          {
            artifactId: captionsArtifactId,
            filename: `${draftId}.srt`,
            kind: 'captions',
            relatedTo: destination.artifactId,
            file: srtFile,
          },
          existing?.resourceUrl ?? null,
          undefined,
          signal,
        );
        await upsertUploadArtifact(draftId, 'captions', {
          artifactId: captionsArtifactId,
          resourceUrl: captionsResult.resourceUrl,
        });
        await setCaptionsUploadStatus(draftId, 'uploaded');
      }
      return result.resourceUrl;
    },
    [draftId, merged, segments, transcripts, uploadOne],
  );

  const uploadBeats = useCallback(
    async (destination: Destination, signal: AbortSignal) => {
      const totalBytes = segments.length;
      let completed = 0;
      const reportProgress = () =>
        setActiveState({ status: 'uploading', progress: totalBytes ? completed / totalBytes : 0 });

      for (const segment of segments) {
        const file = new File(absolutize(effFile(segment)));
        const checksum = await sha256Checksum(file);

        // The wire protocol requires a UUID `artifactId` (see PROTOCOL.md §4.1); this app's
        // local segment ids are `${draftId}-${timestamp}` strings, not UUIDs, so each beat
        // gets a freshly minted UUID the first time it's uploaded. Persisted in
        // `upload_artifacts` so a retry resumes the SAME artifact instead of minting another.
        const videoKey = `${segment.id}:video`;
        const existingVideo = await getUploadArtifact(draftId, videoKey);
        const videoArtifactId = existingVideo?.artifactId ?? Crypto.randomUUID();
        if (!existingVideo) await upsertUploadArtifact(draftId, videoKey, { artifactId: videoArtifactId });
        const videoResult = await uploadOne(
          destination,
          {
            artifactId: videoArtifactId,
            filename: `${segment.id}.mp4`,
            kind: 'video',
            relatedTo: destination.artifactId,
            file,
          },
          existingVideo?.resourceUrl ?? null,
          checksum,
          signal,
        );
        await upsertUploadArtifact(draftId, videoKey, {
          artifactId: videoArtifactId,
          resourceUrl: videoResult.resourceUrl,
        });

        const lines = transcripts.get(segment.id)?.lines ?? [];
        if (lines.length > 0) {
          const captionsKey = `${segment.id}:captions`;
          const existingCaptions = await getUploadArtifact(draftId, captionsKey);
          const captionsArtifactId = existingCaptions?.artifactId ?? Crypto.randomUUID();
          if (!existingCaptions) {
            await upsertUploadArtifact(draftId, captionsKey, { artifactId: captionsArtifactId });
          }
          const srtFile = writeTempTextFile(`${segment.id}.srt`, linesToSrt(lines));
          const captionsResult = await uploadOne(
            destination,
            {
              artifactId: captionsArtifactId,
              filename: `${segment.id}.srt`,
              kind: 'captions',
              relatedTo: destination.artifactId,
              file: srtFile,
            },
            existingCaptions?.resourceUrl ?? null,
            undefined,
            signal,
          );
          await upsertUploadArtifact(draftId, captionsKey, {
            artifactId: captionsArtifactId,
            resourceUrl: captionsResult.resourceUrl,
          });
        }

        completed += 1;
        reportProgress();
      }

      // Ordering manifest, named `.pulse` so it passes pulsevault's default
      // `allowedExtensions.project` allowlist (it doesn't actually mandate the
      // zip format that extension is documented with elsewhere — it's purely
      // an allowlist check — and `uploadUnit: "beat"` is the default, so this
      // has to work without requiring the operator to reconfigure anything).
      const beatArtifactIds = new Map<string, string>();
      for (const segment of segments) {
        const row = await getUploadArtifact(draftId, `${segment.id}:video`);
        if (row) beatArtifactIds.set(segment.id, row.artifactId);
      }
      const manifest = JSON.stringify({
        version: 1,
        beats: segments.map((s, i) => ({ artifactId: beatArtifactIds.get(s.id), order: i })),
      });
      const manifestFile = writeTempTextFile(`${draftId}-manifest.pulse`, manifest);
      const result = await uploadOne(
        destination,
        { artifactId: destination.artifactId, filename: `${draftId}-manifest.pulse`, kind: 'project', file: manifestFile },
        destination.resourceUrl,
        undefined,
        signal,
      );
      return result.resourceUrl;
    },
    [draftId, segments, transcripts, uploadOne],
  );

  // Accepts an explicit destination so `claim()` can kick off the very first upload in the same
  // tap that wrote it — the live query that normally produces `destination` hasn't re-run yet at
  // that point.
  const start = useCallback(
    async (explicitDestination?: Destination) => {
      const dest = explicitDestination ?? destination;
      if (!dest) return;
      // A run is already in flight — ignore a double-tap on Retry rather than overwriting
      // `controllerRef.current` and leaking the first run's controller uncancellable.
      if (runningRef.current) return;
      // Checked before even attempting the request, not just inside `uploadOne` — no point
      // flashing "uploading" for a run that's already dead on arrival.
      if (isTokenExpired(dest.token)) {
        const { reason, retryable } = describeError(new ExpiredPairingError());
        setActiveState({ status: 'error', reason, retryable });
        await setUploadProgress(draftId, { status: 'failed' });
        return;
      }
      runningRef.current = true;
      const controller = new AbortController();
      controllerRef.current = controller;
      setActiveState({ status: 'uploading', progress: 0 });
      await setUploadProgress(draftId, { status: 'uploading' });
      try {
        const resourceUrl =
          dest.uploadUnit === 'merged'
            ? await uploadMerged(dest, controller.signal)
            : await uploadBeats(dest, controller.signal);
        setActiveState({ status: 'done', resourceUrl });
      } catch (err) {
        const { reason, retryable } = describeError(err);
        setActiveState({ status: 'error', reason, retryable });
        await setUploadProgress(draftId, { status: 'failed' });
      } finally {
        runningRef.current = false;
        currentUploadRef.current = null;
      }
    },
    [destination, draftId, uploadMerged, uploadBeats],
  );

  // Claims the device's one pending pairing for this draft and starts uploading immediately —
  // there's no separate "choose destination" step anymore (§ pairing UX), so a single tap both
  // commits the draft to this server and kicks off the upload.
  const claim = useCallback(
    async (pairing: PendingPairing) => {
      if (isTokenExpired(pairing.token)) return;
      const claimedDestination: Destination = {
        server: pairing.server,
        token: pairing.token,
        artifactId: pairing.artifactId,
        uploadUnit: pairing.uploadUnit,
        resourceUrl: null,
      };
      await setUploadDestination(draftId, pairing);
      setDraftTokenState(pairing.token);
      await clearPendingPairing();
      await start(claimedDestination);
    },
    [draftId, start],
  );

  const cancel = useCallback(async () => {
    controllerRef.current?.abort();
    // Target whatever's actually in flight right now — a beat/captions sub-artifact may not
    // be the session anchor (`destination.resourceUrl`) at all — falling back to the anchor
    // only if nothing had started uploading yet.
    const target = currentUploadRef.current?.resourceUrl ?? destination?.resourceUrl ?? null;
    if (target) {
      await cancelTusUpload(target, destination?.token ?? null);
    }
    await setUploadProgress(draftId, { status: 'idle' });
    setActiveState({ status: 'idle' });
  }, [destination, draftId]);

  // Abort whatever's in flight if this hook instance unmounts mid-upload — otherwise the
  // upload loop (and its DB writes) keeps running after the screen that started it is gone,
  // potentially racing a fresh hook instance mounted for the same draft.
  useEffect(() => {
    return () => {
      controllerRef.current?.abort();
    };
  }, []);

  return { state, destination, destinationExpired, pendingPairing, start, retry: start, cancel, claim };
}
