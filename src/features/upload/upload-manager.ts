import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';

import { deleteDestination, getDestinationIdByArtifactId } from '@/db/destinations';
import {
  getResumableDrafts,
  getUploadArtifact,
  projectQuery,
  segmentsForDraft,
  setCaptionsUploadStatus,
  setUploadMerged,
  setUploadProgress,
  type UploadArtifactKey,
  upsertUploadArtifact,
} from '@/db/drafts';
import type { Project } from '@/db/schema';
import { getDraftToken } from '@/db/secure-token';
import { getDraftTranscriptRow } from '@/db/transcripts';
import { linesToVtt } from '@/features/transcription/vtt';
import { parseTranscriptLines } from '@/features/transcription/whisper';
import { absolutize, toFileUri } from '@/utils/file-store';
import { effFile } from '@/utils/segment-window';
import { generateThumbnailFile } from '@/utils/video';

import { buildBeatManifest } from './beat-manifest';
import { isTokenExpired } from './capability-token';
import { keepAlive } from './keep-alive';
import { uploadNotify } from './notify';
import { tusServerTransport } from './transports/tus-server-transport';
import type { ArtifactKind } from './tus-client';
import type {
  Destination,
  LiveUploadState,
  UploadProgress,
  UploadSession,
  UploadTransport,
} from './types';

const EXPIRED_PAIRING_MESSAGE = 'Upload link expired — ask the operator for a new pairing link.';

class ExpiredPairingError extends Error {
  readonly retryable = false;
  constructor() {
    super(EXPIRED_PAIRING_MESSAGE);
    this.name = 'ExpiredPairingError';
  }
}

/** Stable idle reference so `useSyncExternalStore`'s `getSnapshot` returns `===` for untouched drafts. */
const IDLE: LiveUploadState = { status: 'idle' };

/** Segmented-mode ordering manifest — the clip artifactIds in play order. */
type SegmentManifest = {
  version: 1;
  segments: { artifactId: string; order: number }[];
};

type RetryableError = Error & { retryable: boolean };
type ErrorDescription = { reason: string; retryable: boolean };

function describeError(err: unknown): ErrorDescription {
  if (err && typeof err === 'object' && 'retryable' in err) {
    const retryableError = err as RetryableError;
    return { reason: retryableError.message ?? 'Upload failed', retryable: retryableError.retryable };
  }
  if (err instanceof Error && err.name === 'AbortError') {
    return { reason: 'Cancelled', retryable: true };
  }
  return { reason: err instanceof Error ? err.message : 'Upload failed', retryable: true };
}

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function sha256Checksum(file: File): Promise<string> {
  const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, await file.bytes());
  return `sha256:${bufferToHex(digest)}`;
}

/** Writes text to a fresh temp file under the cache dir so it can be uploaded like any other File. */
function writeTempTextFile(name: string, contents: string): File {
  const dir = new Directory(Paths.cache, 'uploads');
  dir.create({ intermediates: true, idempotent: true });
  const file = new File(dir, name);
  if (file.exists) file.delete();
  file.write(contents);
  return file;
}

/** A session anchor (video/manifest) or a related sub-artifact — the input to `uploadOne`. */
type ArtifactInput = {
  artifactId: string;
  filename: string;
  kind: ArtifactKind;
  relatedTo?: string;
  file: File;
};

/**
 * The app-wide, screen-independent upload engine. A module-scope singleton
 * (created once at import, exported as `uploads`) that owns a queue of upload
 * sessions and drives them to completion regardless of which screen is mounted
 * or whether the app is foregrounded — the piece that replaces the orchestration
 * that used to live inside the `useUpload` React hook.
 *
 * Durable state (destination, resume identity, status) lives in SQLite; this
 * holds only what SQLite doesn't: the in-flight AbortControllers, the live
 * byte-progress the UI subscribes to (never persisted per-tick), a run-lock, and
 * the enqueued sessions (which carry the merged output path). Because the queue
 * of pending work is really the set of drafts with an `uploading` status in
 * SQLite, a session is crash-safe up to its resume identity; the one thing not
 * yet persisted is the merged output path — so an upload survives navigation and
 * backgrounding today, and after-kill resume of a merged upload lands with the
 * follow-up that persists that path.
 */
class BackgroundUploadManager {
  private readonly transport: UploadTransport = tusServerTransport;

  private readonly listeners = new Set<() => void>();
  private readonly live = new Map<string, LiveUploadState>();
  private readonly sessions = new Map<string, UploadSession>();
  private readonly controllers = new Map<string, AbortController>();
  private readonly currentUpload = new Map<string, { artifactId: string; resourceUrl: string | null }>();
  /** Drafts whose run failed — kept in `sessions` so `retry` can re-run them, but skipped by the drain. */
  private readonly failed = new Set<string>();
  private running = false;
  /** Set when a new upload is enqueued while a drain is already running, so it isn't stranded. */
  private wake = false;

  // ---- subscription surface (useSyncExternalStore) ----

  readonly subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  };

  readonly getDraftState = (draftId: string): LiveUploadState => this.live.get(draftId) ?? IDLE;

  private emit(): void {
    for (const cb of this.listeners) cb();
  }

  private setLive(draftId: string, state: LiveUploadState): void {
    if (state.status === 'idle') this.live.delete(draftId);
    else this.live.set(draftId, state);
    this.emit();
  }

  // ---- public API ----

  /** Queue a draft's upload and start draining if not already. Ignored if the draft is already in flight. */
  enqueue(session: UploadSession): void {
    if (this.controllers.has(session.draftId)) return;
    // Dead on arrival — surface the expired pairing immediately instead of flashing 'uploading'
    // and churning the DB status before the run inevitably fails inside `uploadOne`.
    if (isTokenExpired(session.destination.token, Date.now())) {
      this.setLive(session.draftId, {
        status: 'error',
        reason: EXPIRED_PAIRING_MESSAGE,
        retryable: false,
      });
      void setUploadProgress(session.draftId, { status: 'failed' });
      return;
    }
    this.failed.delete(session.draftId);
    this.sessions.set(session.draftId, session);
    // Ask for notification permission now — a foreground moment (the user just tapped Upload) — so
    // the background completion/failure banner can fire later without prompting mid-upload.
    void uploadNotify.ensurePermission();
    // Persist the merged output so an app kill mid-upload can be resumed from launch (see
    // `hydrateFromDb`). Everything else the run needs is already durable in the drizzle row.
    if (session.merged) void setUploadMerged(session.draftId, session.merged);
    this.setLive(session.draftId, { status: 'uploading', progress: 0 });
    void setUploadProgress(session.draftId, { status: 'uploading' });
    void this.ensureRunning();
  }

  /**
   * Re-run a failed upload. Reuses the in-memory session if present, otherwise reconstructs it from
   * durable state — so the uploads inbox can retry a run that failed before the app was relaunched.
   */
  async retry(draftId: string): Promise<void> {
    if (this.controllers.has(draftId)) return;
    let session = this.sessions.get(draftId);
    if (!session) {
      const [row] = await projectQuery(draftId);
      if (!row) return;
      const result = await this.reconstructSession(row);
      if (!result.ok) {
        // Can't rebuild the run (expired token / evicted export) — surface it rather than silently
        // no-op, so the user sees a clear reason and can re-pair / re-export.
        this.setLive(draftId, { status: 'error', reason: result.reason, retryable: false });
        await setUploadProgress(draftId, { status: 'failed' });
        return;
      }
      session = result.session;
    }
    this.failed.delete(draftId);
    this.sessions.set(draftId, session);
    if (session.merged) void setUploadMerged(draftId, session.merged);
    this.setLive(draftId, { status: 'uploading', progress: 0 });
    void setUploadProgress(draftId, { status: 'uploading' });
    void this.ensureRunning();
  }

  /** Abort + server-cancel whatever's in flight for a draft, and drop it from the queue. */
  async cancel(draftId: string): Promise<void> {
    this.controllers.get(draftId)?.abort();
    const session = this.sessions.get(draftId);
    // Target whatever's actually in flight — a sub-artifact may not be the session anchor —
    // falling back to the anchor only if nothing had started uploading yet.
    const target =
      this.currentUpload.get(draftId)?.resourceUrl ?? session?.destination.resourceUrl ?? null;
    const token = session?.destination.token ?? null;
    // Drop it from the queue and reset durable + live state FIRST — before the network round-trip
    // below. You often cancel *because* the network died, so a slow/failing server-cancel must not
    // leave the row stuck 'uploading'; the resume path (`hydrateFromDb`) would otherwise resurrect
    // and complete the run the user just cancelled.
    this.sessions.delete(draftId);
    this.failed.delete(draftId);
    this.controllers.delete(draftId);
    this.currentUpload.delete(draftId);
    await setUploadProgress(draftId, { status: 'idle' });
    this.setLive(draftId, { status: 'idle' });
    // Best-effort server-side cancel (TUS DELETE); its failure must not revert the reset above. A
    // stale server-side "uploading" sidecar is the documented un-wedge gap (re-pair / fresh id).
    if (target) {
      try {
        await this.transport.cancel(target, token);
      } catch {
        // Network down / already gone — the local reset stands.
      }
    }
  }

  /** Dismiss a finished run's `done` state back to idle (after the one-time watch prompt). */
  acknowledge(draftId: string): void {
    if (this.getDraftState(draftId).status === 'done') this.setLive(draftId, { status: 'idle' });
  }

  /**
   * Idempotent drain trigger — safe to call from every wake-up (app launch,
   * AppState→active, a new enqueue). If a drain is already running it returns
   * immediately; otherwise it drains the queue to empty, one session at a time.
   */
  async ensureRunning(): Promise<void> {
    // Already draining — record that new work arrived so the active loop picks it up before exiting,
    // instead of stranding an upload enqueued in the moment the drain was winding down.
    if (this.running) {
      this.wake = true;
      return;
    }
    this.running = true;
    // Whether the Android foreground service is up. Started once (lazily, only for real work) and
    // stopped once when the whole drain finishes — NOT per do-while iteration, so back-to-back
    // uploads don't stop+restart the service (which Android 12+ can block when backgrounded, and
    // which flashes the notification off/on).
    let keepAliveStarted = false;
    try {
      do {
        this.wake = false;
        await this.hydrateFromDb();
        // Nothing to do — crucially, DON'T start the Android foreground service for an empty queue
        // (that would flash a notification on every foreground and fail Play review).
        if (!this.nextPending()) continue;
        if (!keepAliveStarted) {
          // Hold the process alive while draining (Android foreground service; no-op elsewhere) so a
          // backgrounded run isn't frozen/killed.
          await keepAlive.begin();
          keepAliveStarted = true;
        }
        for (;;) {
          const session = this.nextPending();
          if (!session) break;
          void keepAlive.note(this.notificationText());
          await this.runSession(session);
        }
      } while (this.wake || this.nextPending());
    } finally {
      if (keepAliveStarted) await keepAlive.end();
      this.running = false;
    }
  }

  private notificationText(): string {
    // Failed drafts stay in `sessions` (so `retry` can reuse them) but aren't in flight — exclude
    // them from the count so the notification doesn't read "Uploading 3 pulses…" for one live run.
    const n = this.sessions.size - this.failed.size;
    return n <= 1 ? 'Uploading your pulse…' : `Uploading ${n} pulses…`;
  }

  /**
   * Rebuild sessions for drafts left mid-upload (status still `uploading`) that aren't already in
   * memory — the after-kill/relaunch resume path. Everything a run needs is reconstructed from
   * durable state: destination + resume URL from the drizzle row, token from secure-store, segments
   * from the clip table, and the merged output from the columns persisted at enqueue. A merged run
   * with no persisted output path (older row) or an expired token is skipped rather than restarted.
   */
  private async hydrateFromDb(): Promise<void> {
    const rows = await getResumableDrafts();
    for (const row of rows) {
      if (this.sessions.has(row.id) || this.controllers.has(row.id)) continue;
      const result = await this.reconstructSession(row);
      if (!result.ok) {
        // Can't resume off-screen (expired token / evicted export). Settle it to `failed` so the UI
        // surfaces the reason — and so it stops being re-hydrated on every drain — instead of
        // leaving a perpetual 'uploading' ring that never progresses and can't be cleared.
        this.setLive(row.id, { status: 'error', reason: result.reason, retryable: false });
        await setUploadProgress(row.id, { status: 'failed' });
        continue;
      }
      this.sessions.set(row.id, result.session);
      this.setLive(row.id, { status: 'uploading', progress: 0 });
    }
  }

  /**
   * Rebuild an upload session from a persisted draft row (destination + token + segments + merged
   * output), or a failure `reason` if it can't be resumed off-screen — a missing destination, an
   * expired token, or a merged run whose native export file is gone.
   */
  private async reconstructSession(
    row: Project,
  ): Promise<{ ok: true; session: UploadSession } | { ok: false; reason: string }> {
    if (!row.uploadServer || !row.uploadArtifactId || !row.uploadUnit) {
      return { ok: false, reason: 'Upload destination is missing — re-pair to upload.' };
    }
    const token = await getDraftToken(row.id);
    if (isTokenExpired(token, Date.now())) return { ok: false, reason: EXPIRED_PAIRING_MESSAGE };
    const merged =
      row.uploadUnit === 'merged' && row.uploadMergedPath && row.uploadMergedDurationMs != null
        ? { path: row.uploadMergedPath, durationMs: row.uploadMergedDurationMs }
        : null;
    if (row.uploadUnit === 'merged' && !merged) {
      return {
        ok: false,
        reason:
          'The merged video is no longer available — reopen the draft to re-export, then upload.',
      };
    }
    const segments = await segmentsForDraft(row.id);
    // Re-link the single-use pool destination (that id isn't persisted on the session) so a resumed
    // run still removes it on success — otherwise a spent destination lingers in the pool and gets
    // reused against an already-consumed server-minted artifactId (409).
    const consumedDestinationId = await getDestinationIdByArtifactId(row.uploadArtifactId);
    return {
      ok: true,
      session: {
        draftId: row.id,
        destination: {
          server: row.uploadServer,
          token,
          artifactId: row.uploadArtifactId,
          uploadUnit: row.uploadUnit,
          resourceUrl: row.uploadResourceUrl,
        },
        segments,
        merged,
        consumedDestinationId,
      },
    };
  }

  private nextPending(): UploadSession | null {
    for (const [draftId, session] of this.sessions) {
      if (!this.controllers.has(draftId) && !this.failed.has(draftId)) return session;
    }
    return null;
  }

  // ---- per-session orchestration (moved verbatim in behaviour from the old useUpload hook) ----

  private async runSession(session: UploadSession): Promise<void> {
    const { draftId, destination } = session;
    const controller = new AbortController();
    this.controllers.set(draftId, controller);
    this.setLive(draftId, { status: 'uploading', progress: 0 });
    await setUploadProgress(draftId, { status: 'uploading' });
    try {
      const resourceUrl =
        destination.uploadUnit === 'merged'
          ? await this.uploadMerged(session, controller.signal)
          : await this.uploadSegments(session, controller.signal);
      // Persist completion here (not inside the per-unit methods) so BOTH branches settle the row
      // to 'uploaded'. Without this, a finished SEGMENT upload stayed 'uploading' and the resume
      // path re-drove it on every launch (and the home card showed a perpetual ring).
      await setUploadProgress(draftId, { status: 'uploaded', resourceUrl });
      this.setLive(draftId, { status: 'done', resourceUrl });
      // Tell the user their pulse landed — only surfaces if the app is backgrounded / off-screen.
      void uploadNotify.complete();
      // Single-use: remove the consumed pool destination now the run finished.
      if (session.consumedDestinationId) {
        await deleteDestination(session.consumedDestinationId);
      }
      this.sessions.delete(draftId);
      this.failed.delete(draftId);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // Cancelled via cancel() — that path owns resetting status/live to idle; don't race it by
        // overwriting with an error state or keeping the session around as "failed".
        this.sessions.delete(draftId);
        this.failed.delete(draftId);
      } else {
        const { reason, retryable } = describeError(err);
        this.setLive(draftId, { status: 'error', reason, retryable });
        await setUploadProgress(draftId, { status: 'failed' });
        // Tell the user it failed — only surfaces if the app is backgrounded / off-screen.
        void uploadNotify.failed();
        // Keep the session (in `failed`) so `retry` can re-run it; the drain skips it.
        this.failed.add(draftId);
      }
    } finally {
      this.controllers.delete(draftId);
      this.currentUpload.delete(draftId);
    }
  }

  private async uploadOne(
    draftId: string,
    destination: Destination,
    artifact: ArtifactInput,
    resourceUrl: string | null,
    checksum: string | undefined,
    signal: AbortSignal,
    onProgress?: (progress: UploadProgress) => void,
    // Fired the instant the server assigns a resource URL — the caller persists it so an app kill
    // mid-transfer can resume via HEAD+PATCH. WITHOUT this the resume path has no handle and
    // re-creates the upload, which the server rejects as a duplicate reserve (409).
    persistResourceUrl?: (url: string) => void,
  ): Promise<{ resourceUrl: string }> {
    // Re-checked before every artifact (not just at the start of a run) — a token fine at the
    // start can go stale partway through a session.
    if (isTokenExpired(destination.token, Date.now())) throw new ExpiredPairingError();
    this.currentUpload.set(draftId, { artifactId: artifact.artifactId, resourceUrl });
    const result = await this.transport.run({
      destination,
      artifact: {
        artifactId: artifact.artifactId,
        filename: artifact.filename,
        kind: artifact.kind,
        relatedTo: artifact.relatedTo,
        checksum,
        file: artifact.file,
        resourceUrl,
      },
      signal,
      onProgress,
      onResourceCreated: (url) => {
        this.currentUpload.set(draftId, { artifactId: artifact.artifactId, resourceUrl: url });
        persistResourceUrl?.(url);
      },
    });
    this.currentUpload.set(draftId, { artifactId: artifact.artifactId, resourceUrl: result.resourceUrl });
    return result;
  }

  /** Reserve → upload → persist a session-related artifact (captions / beat manifest / thumbnail). */
  private async uploadRelatedArtifact(
    draftId: string,
    destination: Destination,
    localKey: UploadArtifactKey,
    spec: { filename: string; kind: ArtifactKind; file: File },
    signal: AbortSignal,
  ): Promise<void> {
    const existing = await getUploadArtifact(draftId, localKey);
    const artifactId = existing?.artifactId ?? Crypto.randomUUID();
    if (!existing) await upsertUploadArtifact(draftId, localKey, { artifactId });
    const result = await this.uploadOne(
      draftId,
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
      undefined,
      // Persist this sub-artifact's resource URL at creation so a kill mid-transfer resumes it via
      // HEAD instead of re-creating (409).
      (url) => void upsertUploadArtifact(draftId, localKey, { artifactId, resourceUrl: url }),
    );
    await upsertUploadArtifact(draftId, localKey, { artifactId, resourceUrl: result.resourceUrl });
  }

  /** The draft's cover for a merged upload: the first clip's persisted jpeg, or a frame from the merge. */
  private async resolveThumbnailFile(
    session: UploadSession,
    mergedPath: string,
  ): Promise<File | null> {
    const firstThumb = session.segments[0]?.thumbnail;
    if (firstThumb) {
      const persisted = new File(absolutize(firstThumb));
      if (persisted.exists) return persisted;
    }
    const dir = new Directory(Paths.cache, 'uploads');
    dir.create({ intermediates: true, idempotent: true });
    const out = new File(dir, `${session.draftId}.jpg`);
    if (out.exists) out.delete();
    const ok = await generateThumbnailFile(toFileUri(mergedPath), out.uri);
    return ok && out.exists ? out : null;
  }

  private async uploadMerged(session: UploadSession, signal: AbortSignal): Promise<string> {
    const { draftId, destination, segments, merged } = session;
    if (!merged) throw new Error('Export is not ready yet');
    const file = new File(merged.path);
    // The merged output is a native cache file; if it was evicted (rare, but possible after a long
    // gap or an app kill) there's nothing to upload — surface a clear, actionable reason rather
    // than crashing in `bytes()`. Re-opening the draft re-exports and re-enqueues with a fresh path.
    if (!file.exists) {
      throw new Error('The merged video is no longer available — reopen the draft to re-export, then upload.');
    }
    const checksum = await sha256Checksum(file);

    // Throttle progress to at most one store update / 200ms — the native task ticks fast; the
    // final (EOF) tick always goes through so the bar still reaches 100%.
    let lastTick = 0;
    const result = await this.uploadOne(
      draftId,
      destination,
      { artifactId: destination.artifactId, filename: `${draftId}.mp4`, kind: 'video', file },
      destination.resourceUrl,
      checksum,
      signal,
      ({ bytesSent, totalBytes }) => {
        const done = totalBytes > 0 && bytesSent >= totalBytes;
        const now = Date.now();
        if (!done && now - lastTick < 200) return;
        lastTick = now;
        this.setLive(draftId, {
          status: 'uploading',
          progress: totalBytes ? bytesSent / totalBytes : 0,
        });
      },
      // Persist the video's resource URL the moment it's created (the merged anchor lives on the
      // project row) so an app kill DURING the video transfer resumes via HEAD+PATCH rather than
      // re-creating the upload — which the server rejects as a duplicate reserve (409).
      (url) => void setUploadProgress(draftId, { status: 'uploading', resourceUrl: url }),
    );
    // Re-persist after the video lands (same URL) and hold status 'uploading' until every related
    // artifact below has uploaded too.
    await setUploadProgress(draftId, { status: 'uploading', resourceUrl: result.resourceUrl });

    // Captions: the draft's single MERGED transcript (hand-edit if present, else auto).
    const row = await getDraftTranscriptRow(draftId);
    const lines = parseTranscriptLines(row?.editedLines ?? row?.lines);
    if (lines.length > 0) {
      await setCaptionsUploadStatus(draftId, 'uploading');
      const vttFile = writeTempTextFile(`${draftId}.vtt`, linesToVtt(lines));
      await this.uploadRelatedArtifact(
        draftId,
        destination,
        'captions',
        { filename: `${draftId}.vtt`, kind: 'captions', file: vttFile },
        signal,
      );
      await setCaptionsUploadStatus(draftId, 'uploaded');
    }

    // Beat manifest: per-segment timecodes on the merged timeline (groundwork for HLS).
    const manifestFile = writeTempTextFile(
      `${draftId}-beats.pulse`,
      JSON.stringify(buildBeatManifest(segments, merged.durationMs)),
    );
    await this.uploadRelatedArtifact(
      draftId,
      destination,
      'manifest',
      { filename: `${draftId}-beats.pulse`, kind: 'project', file: manifestFile },
      signal,
    );

    // Thumbnail (poster frame).
    const thumbFile = await this.resolveThumbnailFile(session, merged.path);
    if (thumbFile) {
      await this.uploadRelatedArtifact(
        draftId,
        destination,
        'thumbnail',
        { filename: `${draftId}.jpg`, kind: 'thumbnail', file: thumbFile },
        signal,
      );
    }

    // NOTE: the final 'uploaded' status write lives in `runSession` (shared by both units), not
    // here — see the comment there. This method's job ends once every artifact has landed.
    return result.resourceUrl;
  }

  private async uploadSegments(session: UploadSession, signal: AbortSignal): Promise<string> {
    const { draftId, destination, segments } = session;
    const total = segments.length;
    let completed = 0;
    const reportProgress = () =>
      this.setLive(draftId, { status: 'uploading', progress: total ? completed / total : 0 });

    for (const segment of segments) {
      const file = new File(absolutize(effFile(segment)));
      const checksum = await sha256Checksum(file);

      const videoKey = `${segment.id}:video` as const;
      const existingVideo = await getUploadArtifact(draftId, videoKey);
      const videoArtifactId = existingVideo?.artifactId ?? Crypto.randomUUID();
      if (!existingVideo) await upsertUploadArtifact(draftId, videoKey, { artifactId: videoArtifactId });
      const videoResult = await this.uploadOne(
        draftId,
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
        undefined,
        // Persist each clip's resource URL at creation so a kill mid-clip resumes via HEAD (409 on
        // a re-create otherwise).
        (url) => void upsertUploadArtifact(draftId, videoKey, { artifactId: videoArtifactId, resourceUrl: url }),
      );
      await upsertUploadArtifact(draftId, videoKey, {
        artifactId: videoArtifactId,
        resourceUrl: videoResult.resourceUrl,
      });

      completed += 1;
      reportProgress();
    }

    const segmentArtifactIds = new Map<string, string>();
    for (const segment of segments) {
      const row = await getUploadArtifact(draftId, `${segment.id}:video` as const);
      if (row) segmentArtifactIds.set(segment.id, row.artifactId);
    }
    const manifest: SegmentManifest = {
      version: 1,
      segments: segments.map((s, i) => {
        const artifactId = segmentArtifactIds.get(s.id);
        if (!artifactId) throw new Error(`No uploaded video artifact for segment ${s.id}`);
        return { artifactId, order: i };
      }),
    };
    const manifestFile = writeTempTextFile(`${draftId}-segments.pulse`, JSON.stringify(manifest));
    const result = await this.uploadOne(
      draftId,
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
      undefined,
      // The segment anchor is the ordering manifest; persist its URL on the project row at creation
      // so a kill mid-manifest resumes via HEAD instead of a 409-ing re-create.
      (url) => void setUploadProgress(draftId, { status: 'uploading', resourceUrl: url }),
    );
    return result.resourceUrl;
  }
}

/** The app-wide singleton. Imported by `upload-deep-link-provider` so it registers for the app's lifetime. */
export const uploads = new BackgroundUploadManager();
