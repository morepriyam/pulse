import type { File } from 'expo-file-system';

import type { Segment } from '@/db/schema';

import type { ArtifactKind } from './tus-client';

/**
 * A paired upload destination resolved for a draft. The bearer `token` lives in
 * expo-secure-store (not the drizzle row); it's carried on the session so the
 * manager can upload without a re-fetch.
 */
export type Destination = {
  server: string;
  token: string | null;
  artifactId: string;
  uploadUnit: 'segment' | 'merged';
  resourceUrl: string | null;
};

/** The merged export output a merged-unit session uploads (from `useExport`). */
export type MergedOutput = { path: string; durationMs: number };

/**
 * One queued upload run for a draft. Captured at enqueue time — while the export
 * screen is foreground and the merge is done — and held in-memory by the manager
 * so the run survives navigation/backgrounding without the screen. Durable state
 * (destination, resume identity, status) lives in SQLite; this holds the one
 * thing SQLite doesn't yet: the merged output path/duration.
 */
export type UploadSession = {
  draftId: string;
  destination: Destination;
  segments: Segment[];
  /** Present for merged-unit runs; `null` for segment-unit. */
  merged: MergedOutput | null;
  /**
   * The pool destination id to remove once this run finishes (single-use), or
   * `null` for a draft whose destination came from an already-consumed session.
   */
  consumedDestinationId: string | null;
};

export type UploadProgress = { bytesSent: number; totalBytes: number };

/**
 * What an in-flight upload is actually doing. A run spends real time before (and
 * between) byte transfers — preparing the export and building/uploading the small
 * related artifacts — and each of those used to render as an indistinguishable
 * `Uploading… 0%`. Only `video` (merged unit) and `clip` (segment unit) carry
 * meaningful byte/unit progress; the rest are label-only.
 */
export type UploadPhase = 'preparing' | 'captions' | 'manifest' | 'thumbnail' | 'video' | 'clip';

/**
 * Live, per-draft upload state the UI subscribes to via `useSyncExternalStore`.
 * Held in-memory (progress ticks are high-frequency and never persisted); status
 * transitions are separately written to SQLite for resume/history.
 */
export type LiveUploadState =
  | { status: 'idle' }
  | {
      status: 'uploading';
      phase: UploadPhase;
      progress: number;
      /** 1-based position of the clip in flight — present only for `phase: 'clip'`. */
      current?: number;
      /** Total clips in the run — present only for `phase: 'clip'`. */
      total?: number;
    }
  | { status: 'done'; resourceUrl: string }
  | { status: 'error'; reason: string; retryable: boolean };

/** One artifact to hand a transport — a session anchor (video/manifest) or a related sub-artifact. */
export type UploadArtifactSpec = {
  artifactId: string;
  filename: string;
  kind: ArtifactKind;
  relatedTo?: string;
  checksum?: string;
  file: File;
  /** A previously-created resource URL to resume, or `null` to create fresh. */
  resourceUrl: string | null;
};

/**
 * Uploads a single artifact to its destination. The framework-agnostic seam the
 * background manager drives — `TusServerTransport` today (local backend), an
 * `S3MultipartTransport` later (direct-to-S3). Resumable + idempotent.
 */
export type UploadTransport = {
  run(params: {
    destination: Destination;
    artifact: UploadArtifactSpec;
    signal: AbortSignal;
    onProgress?: (progress: UploadProgress) => void;
    /** Fired as soon as the resource URL is known, so the caller can track what's in flight. */
    onResourceCreated?: (resourceUrl: string) => void;
  }): Promise<{ resourceUrl: string }>;
  /** Server-side cancel (TUS DELETE) of an in-flight resource. */
  cancel(resourceUrl: string, token: string | null): Promise<void>;
};
