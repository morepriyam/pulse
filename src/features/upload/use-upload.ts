import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { projectQuery, setCaptionsUploadStatus, setUploadDestination, setUploadProgress } from '@/db/drafts';
import { clearPendingPairing, parsePendingPairing, type PendingPairing, pendingPairingQuery } from '@/db/pairing';
import type { Segment } from '@/db/schema';
import { useTick } from '@/hooks/use-tick';
import { useDraftTranscripts } from '@/features/transcription/use-draft-transcripts';
import { linesToSrt, mergedLines } from '@/features/transcription/srt';
import { absolutize } from '@/utils/file-store';
import { effFile } from '@/utils/segment-window';

import { waitUntilAppForeground } from './app-state-gate';
import { decodeCapabilityClaims, isClaimsExpired } from './capability-token';
import { uploadRemainderNative } from './native-chunk-upload';
import { type ArtifactKind, cancelTusUpload, type TusUploadOptions, uploadViaTus } from './tus-client';

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

class ExpiredPairingError extends Error {
  readonly retryable = false;
  constructor() {
    super('Upload link expired — ask the operator for a new pairing link.');
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

  // Re-evaluate expiry on a timer too, not just on writes — a token can go stale while the user
  // is just sitting on this screen.
  useTick(EXPIRY_CHECK_INTERVAL_MS);

  const destination: Destination | null = useMemo(
    () =>
      project?.mode === 'upload' &&
      project.uploadServer &&
      project.uploadArtifactId &&
      project.uploadUnit
        ? {
            server: project.uploadServer,
            token: project.uploadToken,
            artifactId: project.uploadArtifactId,
            uploadUnit: project.uploadUnit,
            resourceUrl: project.uploadResourceUrl,
          }
        : null,
    [project],
  );
  const destinationExpired = destination !== null && isTokenExpired(destination.token);

  const rawPendingPairing = parsePendingPairing(pendingPairingRows[0]?.value);
  const pendingPairingExpired = rawPendingPairing !== null && isTokenExpired(rawPendingPairing.token);
  // Only offer the global pending pairing on a draft that hasn't already claimed its own
  // destination — and never once it's expired (§ "don't show it when expired").
  const pendingPairing = destination === null && rawPendingPairing && !pendingPairingExpired ? rawPendingPairing : null;

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
      return uploadViaTus({
        server: destination.server,
        token: destination.token,
        artifactId: artifact.artifactId,
        filename: artifact.filename,
        kind: artifact.kind,
        relatedTo: artifact.relatedTo,
        checksum,
        file: artifact.file,
        resourceUrl,
        signal,
        waitUntilForeground: waitUntilAppForeground,
        uploadRemainder: uploadRemainderNative,
        onProgress,
      });
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
        await uploadOne(
          destination,
          {
            artifactId: Crypto.randomUUID(),
            filename: `${draftId}.srt`,
            kind: 'captions',
            relatedTo: destination.artifactId,
            file: srtFile,
          },
          null,
          undefined,
          signal,
        );
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

      // The wire protocol requires a UUID `artifactId` (see PROTOCOL.md §4.1);
      // this app's local segment ids are `${draftId}-${timestamp}` strings, not
      // UUIDs, so each beat gets a freshly minted UUID for the upload itself.
      // The manifest below records the mapping so order/identity survives.
      const beatArtifactIds = new Map(segments.map((s) => [s.id, Crypto.randomUUID()]));

      for (const segment of segments) {
        const file = new File(absolutize(effFile(segment)));
        const checksum = await sha256Checksum(file);
        const artifactId = beatArtifactIds.get(segment.id)!;
        await uploadOne(
          destination,
          {
            artifactId,
            filename: `${segment.id}.mp4`,
            kind: 'video',
            relatedTo: destination.artifactId,
            file,
          },
          null,
          checksum,
          signal,
        );

        const lines = transcripts.get(segment.id)?.lines ?? [];
        if (lines.length > 0) {
          const srtFile = writeTempTextFile(`${segment.id}.srt`, linesToSrt(lines));
          await uploadOne(
            destination,
            {
              artifactId: Crypto.randomUUID(),
              filename: `${segment.id}.srt`,
              kind: 'captions',
              relatedTo: destination.artifactId,
              file: srtFile,
            },
            null,
            undefined,
            signal,
          );
        }

        completed += 1;
        reportProgress();
      }

      // Ordering manifest, named `.pulse` so it passes pulsevault's default
      // `allowedExtensions.project` allowlist (it doesn't actually mandate the
      // zip format that extension is documented with elsewhere — it's purely
      // an allowlist check — and `uploadUnit: "beat"` is the default, so this
      // has to work without requiring the operator to reconfigure anything).
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
      // Checked before even attempting the request, not just inside `uploadOne` — no point
      // flashing "uploading" for a run that's already dead on arrival.
      if (isTokenExpired(dest.token)) {
        const { reason, retryable } = describeError(new ExpiredPairingError());
        setActiveState({ status: 'error', reason, retryable });
        await setUploadProgress(draftId, { status: 'failed' });
        return;
      }
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
      await clearPendingPairing();
      await start(claimedDestination);
    },
    [draftId, start],
  );

  const cancel = useCallback(async () => {
    controllerRef.current?.abort();
    if (destination?.resourceUrl) {
      await cancelTusUpload(destination.resourceUrl, destination.token);
    }
    await setUploadProgress(draftId, { status: 'idle' });
    setActiveState({ status: 'idle' });
  }, [destination, draftId]);

  return { state, destination, destinationExpired, pendingPairing, start, retry: start, cancel, claim };
}
