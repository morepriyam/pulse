import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import * as Crypto from 'expo-crypto';
import { Directory, File, FileMode, Paths } from 'expo-file-system';
import { sha256 } from 'js-sha256';

import { deleteDestination } from '@/db/destinations';
import {
  getUploadArtifact,
  projectQuery,
  setCaptionsUploadStatus,
  setUploadDestination,
  setUploadProgress,
  type UploadArtifactKey,
  upsertUploadArtifact,
} from '@/db/drafts';
import type { Segment } from '@/db/schema';
import { getDraftToken } from '@/db/secure-token';
import { getDraftTranscriptRow } from '@/db/transcripts';
import { linesToVtt } from '@/features/transcription/vtt';
import { parseTranscriptLines } from '@/features/transcription/whisper';
import { useNow } from '@/hooks/use-now';
import { absolutize, toFileUri } from '@/utils/file-store';
import { effFile } from '@/utils/segment-window';
import { generateThumbnailFile } from '@/utils/video';

import { waitUntilAppForeground } from './app-state-gate';
import { buildBeatManifest } from './beat-manifest';
import { EXPIRY_CHECK_INTERVAL_MS, isTokenExpired } from './capability-token';
import { uploadRemainderNative } from './native-chunk-upload';
import {
  type ArtifactKind,
  cancelTusUpload,
  TusUploadError,
  type TusUploadOptions,
  uploadViaTus,
} from './tus-client';
import { type DestinationOption, useDestinations } from './use-destinations';

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
  uploadUnit: 'segment' | 'merged';
  resourceUrl: string | null;
};

/** Segmented-mode ordering manifest (`${draftId}-segments.pulse`) — the clip artifactIds in play order. */
type SegmentManifest = {
  version: 1;
  segments: { artifactId: string; order: number }[];
};

/** One artifact to hand to `uploadOne` — a session anchor (video/manifest) or a related sub-artifact (captions). */
type UploadArtifactSpec = {
  artifactId: string;
  filename: string;
  kind: ArtifactKind;
  relatedTo?: string;
  file: File;
};

// Read size for the streaming checksum below — one chunk is the peak memory held.
const CHECKSUM_CHUNK_BYTES = 8 * 1024 * 1024; // 8 MiB

/**
 * Streaming SHA-256 of a file via js-sha256's incremental hasher + chunked
 * `FileHandle` reads, so peak memory is one chunk — not the whole file.
 * (expo-crypto's `digest` is one-shot only, which forced `file.bytes()` to load
 * a potentially multi-hundred-MB merged export into the JS heap at once; and
 * Hermes has no WebAssembly, ruling out wasm hashers.) Yields to the event loop
 * between chunks so the pure-JS hashing never blocks the UI for the whole file,
 * and honors `signal` at each chunk so a cancel doesn't keep burning CPU/battery
 * hashing a file whose upload will never start.
 */
async function sha256Checksum(file: File, signal?: AbortSignal): Promise<string> {
  const size = file.size;
  if (size == null) {
    // Hashing zero bytes would produce a "valid" checksum the server 422s on —
    // fail loudly instead so the real problem (unreadable file) surfaces.
    throw new Error(`Cannot checksum ${file.name}: file size unavailable`);
  }
  const hasher = sha256.create();
  const reader = file.open(FileMode.ReadOnly);
  try {
    let remaining = size;
    while (remaining > 0) {
      if (signal?.aborted) {
        throw Object.assign(new Error('Cancelled'), { name: 'AbortError' });
      }
      const chunk = reader.readBytes(Math.min(CHECKSUM_CHUNK_BYTES, remaining));
      if (chunk.length === 0) break; // EOF earlier than expected — hash what we got
      hasher.update(chunk);
      remaining -= chunk.length;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  } finally {
    reader.close();
  }
  return `sha256:${hasher.hex()}`;
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

/** Shared shape of `TusUploadError` and `ExpiredPairingError` — the two error types `describeError` special-cases. */
type RetryableError = Error & { retryable: boolean };

type ErrorDescription = { reason: string; retryable: boolean };

function describeError(err: unknown): ErrorDescription {
  if (
    err &&
    typeof err === 'object' &&
    'retryable' in err &&
    typeof (err as { retryable: unknown }).retryable === 'boolean'
  ) {
    const retryableError = err as RetryableError;
    return {
      reason: retryableError.message ?? 'Upload failed',
      retryable: retryableError.retryable,
    };
  }
  if (err instanceof Error && err.name === 'AbortError') {
    return { reason: 'Cancelled', retryable: true };
  }
  return { reason: err instanceof Error ? err.message : 'Upload failed', retryable: true };
}

/**
 * Drives uploading a draft to its paired server. Branches on the destination's
 * stored `uploadUnit`: `"merged"` uploads the single merged export video plus a
 * merged-VTT captions artifact, a beat manifest (per-segment timecodes on the
 * merged timeline) and a thumbnail (all one session); `"segment"` uploads each
 * segment's effective file individually under its own existing id, plus a small
 * ordering manifest — no captions, no thumbnail, no merge/re-encode pass at all
 * in that branch. Every secondary artifact in a session declares `relatedTo`
 * pointing at the session anchor (`destination.artifactId`) so the one
 * capability token issued for that anchor authorizes the whole session.
 *
 * Every secondary artifact's identity (and, once known, its resource URL) is
 * persisted in `upload_artifacts` keyed by a stable local key (e.g. a segment's
 * `${segmentId}:video`) — a retry looks up the existing entry and resumes it
 * via `tus-client`'s normal HEAD-then-PATCH resume path instead of minting a
 * fresh artifactId and re-uploading a duplicate from byte 0.
 *
 * `mergedRef` is a ref (not a plain value) so this hook can be called — and its `destination` read
 * — before the merged output is known. Its identity is stable across renders, which is what lets
 * `export.tsx` decide whether to auto-merge at all (via `useExport`'s `auto` option) using this
 * hook's own `destination`, without a circular "useExport needs destination, useUpload needs
 * merged" dependency. Only read at upload time (`uploadMerged`), never rendered, so a ref is
 * enough — no re-render needed when the merge finishes.
 */
export function useUpload(
  draftId: string,
  segments: Segment[],
  mergedRef: RefObject<{ path: string; durationMs: number } | null>,
) {
  const { data: projectRows } = useLiveQuery(projectQuery(draftId), [draftId]);
  const project = projectRows[0];
  // The device-wide pool of paired-but-unconsumed destinations (non-expired only). Any draft can
  // select one to upload to; several servers can be paired at once (§ destination pool).
  const { destinations } = useDestinations();
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
  // Set synchronously by `cancel()` before it aborts the in-flight run, so `start`'s catch can tell
  // an intentional cancellation from a real failure and leave the terminal (idle) state to `cancel()`
  // instead of racing it with an 'error'/'failed' write. Reset at the top of each `start`.
  const cancelledRef = useRef(false);
  // The sub-artifact actually being uploaded right now — not necessarily the session anchor
  // (e.g. mid-captions-upload in merged mode, or a segment clip) — so `cancel()` can DELETE
  // the resource that's really in flight instead of always targeting the anchor.
  const currentUploadRef = useRef<{ artifactId: string; resourceUrl: string | null } | null>(null);
  // The pool destination id this draft was claimed from, so a *finished* upload can remove it
  // from the pool (single-use — § destination lifecycle). Set at `claim`, survives retries of the
  // same claim, cleared once consumed. Null for a draft whose destination came from a prior
  // session (already consumed) — nothing left in the pool to delete.
  const consumedIdRef = useRef<string | null>(null);

  // Reactive wall-clock so expiry re-evaluates on a timer too, not just on writes — a token can go
  // stale while the user is just sitting on this screen.
  const now = useNow(EXPIRY_CHECK_INTERVAL_MS);

  const hasDestination =
    project?.mode === 'upload' &&
    !!project.uploadServer &&
    !!project.uploadArtifactId &&
    !!project.uploadUnit;

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

  const destination: Destination | null = useMemo(() => {
    // Re-derives the same conditions as `hasDestination`, but inside the closure
    // so TypeScript narrows the nullable columns for real — no `!` assertions.
    if (project?.mode !== 'upload') return null;
    const { uploadServer, uploadArtifactId, uploadUnit, uploadResourceUrl } = project;
    if (!uploadServer || !uploadArtifactId || !uploadUnit) return null;
    return {
      server: uploadServer,
      token: draftToken,
      artifactId: uploadArtifactId,
      uploadUnit,
      resourceUrl: uploadResourceUrl,
    };
  }, [project, draftToken]);
  const destinationExpired = destination !== null && isTokenExpired(destination.token, now);

  // Which pool destination the user has picked to upload to. Defaults to the most-recent
  // non-expired one, and is kept valid as the pool changes (a consumed/deleted/expired
  // destination drops out — fall back to the newest remaining). Reconciled during render (the
  // adjust-state-during-render pattern, as on the home screen) rather than in an effect, so the
  // corrected value is used the same render instead of after an extra commit. Not tied to the
  // draft's own claimed `destination`: the pool is the "change your mind at the end" surface.
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

  // Deliberately NOT derived from the persisted `uploadStatus === 'uploaded'` — a finished
  // upload is surfaced once (the watch prompt on the export screen) and then leaves no
  // lingering "uploaded" UI behind in the draft. `done` therefore only ever appears for a run
  // that completed in THIS session; the DB row still records the upload for resume/history.
  const state: UploadState = activeState;

  // Dismisses a completed run's `done` state after the one-time watch prompt has been shown —
  // returns the section to its normal selector view with no persistent post-upload button.
  const acknowledgeDone = useCallback(() => {
    setActiveState((prev) => (prev.status === 'done' ? { status: 'idle' } : prev));
  }, []);

  const uploadOne = useCallback(
    async (
      destination: Destination,
      artifact: UploadArtifactSpec,
      resourceUrl: string | null,
      checksum: string | undefined,
      signal: AbortSignal,
      onProgress?: TusUploadOptions['onProgress'],
    ) => {
      // Checked before every single artifact (not just once at the start of a run) — a
      // segmented session uploads many small files in sequence, and a token that was fine at
      // the start can go stale partway through. Stopping here with a clear, non-retryable
      // reason beats letting the loop run into a confusing wall of 403s.
      if (isTokenExpired(destination.token, Date.now())) throw new ExpiredPairingError();
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
          if (isTokenExpired(destination.token, Date.now())) {
            throw new TusUploadError(EXPIRED_PAIRING_MESSAGE, { retryable: false });
          }
        },
        uploadRemainder: uploadRemainderNative,
        onProgress,
      });
      currentUploadRef.current = {
        artifactId: artifact.artifactId,
        resourceUrl: result.resourceUrl,
      };
      return result;
    },
    [],
  );

  // Reserve → upload → persist a session-related artifact (captions / beat manifest / thumbnail).
  // Owns the whole resumable-upload dance once: the artifactId is reserved BEFORE the upload and its
  // resourceUrl persisted AFTER, so a retry looks up the stored id and resumes via HEAD-then-PATCH
  // instead of minting a fresh UUID and re-uploading from byte 0. All three secondaries share it.
  const uploadRelatedArtifact = useCallback(
    async (
      destination: Destination,
      localKey: UploadArtifactKey,
      spec: { filename: string; kind: ArtifactKind; file: File },
      signal: AbortSignal,
    ): Promise<void> => {
      const existing = await getUploadArtifact(draftId, localKey);
      const artifactId = existing?.artifactId ?? Crypto.randomUUID();
      if (!existing) await upsertUploadArtifact(draftId, localKey, { artifactId });
      const result = await uploadOne(
        destination,
        {
          artifactId,
          filename: spec.filename,
          kind: spec.kind,
          relatedTo: destination.artifactId,
          file: spec.file,
        },
        existing?.resourceUrl ?? null,
        undefined,
        signal,
      );
      await upsertUploadArtifact(draftId, localKey, {
        artifactId,
        resourceUrl: result.resourceUrl,
      });
    },
    [draftId, uploadOne],
  );

  // The draft's cover for a merged upload: the first clip's persisted jpeg, or a frame extracted
  // from the merged output if that clip has none (legacy rows). `null` if neither is available.
  const resolveThumbnailFile = useCallback(
    async (mergedPath: string): Promise<File | null> => {
      const firstThumb = segments[0]?.thumbnail;
      if (firstThumb) {
        const persisted = new File(absolutize(firstThumb));
        if (persisted.exists) return persisted;
      }
      const dir = new Directory(Paths.cache, 'uploads');
      dir.create({ intermediates: true, idempotent: true });
      const out = new File(dir, `${draftId}.jpg`);
      if (out.exists) out.delete();
      const ok = await generateThumbnailFile(toFileUri(mergedPath), out.uri);
      return ok && out.exists ? out : null;
    },
    [draftId, segments],
  );

  const uploadMerged = useCallback(
    async (destination: Destination, signal: AbortSignal) => {
      const merged = mergedRef.current;
      if (!merged) throw new Error('Export is not ready yet');
      const file = new File(merged.path);
      const checksum = await sha256Checksum(file, signal);
      const result = await uploadOne(
        destination,
        { artifactId: destination.artifactId, filename: `${draftId}.mp4`, kind: 'video', file },
        destination.resourceUrl,
        checksum,
        signal,
        ({ bytesSent, totalBytes }) =>
          setActiveState({
            status: 'uploading',
            progress: totalBytes ? bytesSent / totalBytes : 0,
          }),
      );
      // Persist the video's resource URL now (so a crash mid-session resumes the video via HEAD),
      // but keep the draft status 'uploading' — it isn't marked 'uploaded' until every related
      // artifact below has landed, so an interrupted session never records as done-but-incomplete.
      await setUploadProgress(draftId, { status: 'uploading', resourceUrl: result.resourceUrl });

      // Captions: the draft's single MERGED transcript (hand-edit if present, else auto). Produced
      // once at export time — already on the merged timeline, so no per-clip stitching.
      const row = await getDraftTranscriptRow(draftId);
      const lines = parseTranscriptLines(row?.editedLines ?? row?.lines);
      if (lines.length > 0) {
        await setCaptionsUploadStatus(draftId, 'uploading');
        // VTT rather than SRT: WebVTT carries whisper's word-level timing as inline cue
        // timestamps, so web viewers can karaoke-highlight exactly like the in-app overlay.
        const vttFile = writeTempTextFile(`${draftId}.vtt`, linesToVtt(lines));
        await uploadRelatedArtifact(
          destination,
          'captions',
          { filename: `${draftId}.vtt`, kind: 'captions', file: vttFile },
          signal,
        );
        await setCaptionsUploadStatus(draftId, 'uploaded');
      }

      // Beat manifest: precise per-segment timecodes on the merged timeline (groundwork for HLS).
      const manifestFile = writeTempTextFile(
        `${draftId}-beats.pulse`,
        JSON.stringify(buildBeatManifest(segments, merged.durationMs)),
      );
      await uploadRelatedArtifact(
        destination,
        'manifest',
        { filename: `${draftId}-beats.pulse`, kind: 'project', file: manifestFile },
        signal,
      );

      // Thumbnail (poster frame).
      const thumbFile = await resolveThumbnailFile(merged.path);
      if (thumbFile) {
        await uploadRelatedArtifact(
          destination,
          'thumbnail',
          { filename: `${draftId}.jpg`, kind: 'thumbnail', file: thumbFile },
          signal,
        );
      }

      // Everything landed — only now is the merged session truly complete.
      await setUploadProgress(draftId, { status: 'uploaded', resourceUrl: result.resourceUrl });
      return result.resourceUrl;
    },
    [draftId, mergedRef, segments, uploadOne, uploadRelatedArtifact, resolveThumbnailFile],
  );

  const uploadSegments = useCallback(
    async (destination: Destination, signal: AbortSignal) => {
      const totalBytes = segments.length;
      let completed = 0;
      const reportProgress = () =>
        setActiveState({ status: 'uploading', progress: totalBytes ? completed / totalBytes : 0 });

      for (const segment of segments) {
        const file = new File(absolutize(effFile(segment)));
        const checksum = await sha256Checksum(file, signal);

        // The wire protocol requires a UUID `artifactId` (see PROTOCOL.md §4.1); this app's
        // local segment ids are `${draftId}-${timestamp}` strings, not UUIDs, so each segment
        // gets a freshly minted UUID the first time it's uploaded. Persisted in
        // `upload_artifacts` so a retry resumes the SAME artifact instead of minting another.
        const videoKey = `${segment.id}:video` as const;
        const existingVideo = await getUploadArtifact(draftId, videoKey);
        const videoArtifactId = existingVideo?.artifactId ?? Crypto.randomUUID();
        if (!existingVideo)
          await upsertUploadArtifact(draftId, videoKey, { artifactId: videoArtifactId });
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

        completed += 1;
        reportProgress();
      }

      // Ordering manifest, named `.pulse` so it passes pulsevault's default
      // `allowedExtensions.project` allowlist (it doesn't actually mandate the
      // zip format that extension is documented with elsewhere — it's purely
      // an allowlist check). Segmented uploads carry ONLY the clip mp4s plus this
      // ordering manifest — no captions, no thumbnail (those are merged-mode only).
      const segmentArtifactIds = new Map<string, string>();
      for (const segment of segments) {
        const row = await getUploadArtifact(draftId, `${segment.id}:video` as const);
        if (row) segmentArtifactIds.set(segment.id, row.artifactId);
      }
      const manifest: SegmentManifest = {
        version: 1,
        segments: segments.map((s, i) => {
          const artifactId = segmentArtifactIds.get(s.id);
          // Every clip's video was reserved+uploaded in the loop above, so this is always present.
          // Assert rather than let `JSON.stringify` silently drop an `undefined` key and emit an
          // entry with no `artifactId` — an unresumable, malformed manifest.
          if (!artifactId) throw new Error(`No uploaded video artifact for segment ${s.id}`);
          return { artifactId, order: i };
        }),
      };
      const manifestFile = writeTempTextFile(`${draftId}-segments.pulse`, JSON.stringify(manifest));
      const result = await uploadOne(
        destination,
        {
          artifactId: destination.artifactId,
          filename: `${draftId}-segments.pulse`,
          kind: 'project',
          file: manifestFile,
        },
        destination.resourceUrl,
        undefined,
        signal,
      );
      return result.resourceUrl;
    },
    [draftId, segments, uploadOne],
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
      if (isTokenExpired(dest.token, Date.now())) {
        const { reason, retryable } = describeError(new ExpiredPairingError());
        setActiveState({ status: 'error', reason, retryable });
        await setUploadProgress(draftId, { status: 'failed' });
        return;
      }
      runningRef.current = true;
      cancelledRef.current = false;
      const controller = new AbortController();
      controllerRef.current = controller;
      setActiveState({ status: 'uploading', progress: 0 });
      await setUploadProgress(draftId, { status: 'uploading' });
      try {
        const resourceUrl =
          dest.uploadUnit === 'merged'
            ? await uploadMerged(dest, controller.signal)
            : await uploadSegments(dest, controller.signal);
        setActiveState({ status: 'done', resourceUrl });
        // Upload finished — remove the consumed destination from the pool so it stops showing in
        // the selector/home float (its single-use artifactId is spent). No-op if this draft's
        // destination came from an already-consumed prior session.
        if (consumedIdRef.current) {
          await deleteDestination(consumedIdRef.current);
          consumedIdRef.current = null;
        }
      } catch (err) {
        // A user cancel() already owns the terminal state (idle) and set `cancelledRef` before
        // aborting — don't race it with an 'error'/'failed' write for the abort it triggered.
        if (!cancelledRef.current) {
          const { reason, retryable } = describeError(err);
          setActiveState({ status: 'error', reason, retryable });
          await setUploadProgress(draftId, { status: 'failed' });
        }
      } finally {
        runningRef.current = false;
        currentUploadRef.current = null;
      }
    },
    [destination, draftId, uploadMerged, uploadSegments],
  );

  // Commits this draft to a chosen pool destination and starts uploading in the same tap. The
  // pool destination isn't removed here — only once the upload actually *finishes* (see `start`)
  // — so a failed/cancelled attempt keeps it around to retry or re-pick. Re-claiming an
  // already-claimed draft to a different destination RE-PAIRS it (setUploadDestination resets
  // progress, rotates the token, wipes the old session's sub-artifact mappings) — the escape
  // hatch when the prior session is dead or the operator minted a different upload unit.
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
      await start(claimedDestination);
    },
    [destinations, draftId, start],
  );

  const cancel = useCallback(async () => {
    // Claim the terminal state before aborting so `start`'s catch (which the abort triggers) defers
    // to the idle write below instead of racing it with an error state.
    cancelledRef.current = true;
    controllerRef.current?.abort();
    // Target whatever's actually in flight right now — a segment/captions sub-artifact may not
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
      // Same claim as cancel(): mark the abort as intentional BEFORE firing it, so
      // `start`'s catch doesn't record a navigation-away as `status: 'failed'` in the
      // DB — worse, that late write could clobber a fresh hook instance (mounted for
      // the same draft) that has already started and written 'uploading'.
      cancelledRef.current = true;
      controllerRef.current?.abort();
    };
  }, []);

  // The destination whose host/mode the UI should name right now: the draft's own claimed
  // destination once a run is underway or finished (uploading/done/error/expired), otherwise the
  // pool option the user has currently selected to upload to.
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
