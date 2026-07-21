import { and, asc, count, desc, eq, sql } from 'drizzle-orm';
import * as Crypto from 'expo-crypto';

import {
  absolutize,
  deleteDraftDir,
  deleteSegmentFile,
  editedThumbRelPath,
  thumbRelPath,
} from '@/utils/file-store';
import { generateThumbnailFile } from '@/utils/video';
import { db } from './client';
import type { Project, Segment } from './schema';
import { projects, segments, uploadArtifacts } from './schema';
import { deleteDraftToken, setDraftToken } from './secure-token';

const now = sql`(unixepoch('subsec') * 1000)`;

/** A new clip to append to a draft; `thumbnail` is populated only when the camera/importer
 * already produced one, otherwise it's derived later from the first frame. */
type NewSegment = {
  id: string;
  originalFilename: string;
  durationMs: number;
  thumbnail?: string | null;
};

/** A validated deep-link + `/capabilities` lookup result, ready to pair with a draft. */
type UploadDestination = {
  server: string;
  token: string | null;
  artifactId: string;
  uploadUnit: NonNullable<Project['uploadUnit']>;
};

/** One row per draft with its segment count, trim-aware duration, and cover clip. */
export const draftListQuery = db
  .select({
    id: projects.id,
    name: projects.name,
    lastModified: projects.lastModified,
    // Persisted upload status, so a draft card can show its own upload state on the home screen.
    uploadStatus: projects.uploadStatus,
    segmentCount: count(segments.id),
    // Effective duration = sum of each clip's edited duration (if edited) else its original.
    durationMs: sql<number>`coalesce(sum(coalesce(${segments.editedDurationMs}, ${segments.durationMs})), 0)`,
    // Cover frame: the first clip's persisted thumbnail (+ its effective file as a legacy fallback).
    firstSegmentFilename: sql<
      string | null
    >`(select coalesce(edited_filename, original_filename) from ${segments} where ${segments.projectId} = ${projects.id} order by sort_order limit 1)`,
    firstSegmentThumbnail: sql<
      string | null
    >`(select thumbnail from ${segments} where ${segments.projectId} = ${projects.id} order by sort_order limit 1)`,
  })
  .from(projects)
  .leftJoin(segments, eq(segments.projectId, projects.id))
  .groupBy(projects.id)
  .orderBy(desc(projects.lastModified));

export function segmentsForDraft(projectId: string) {
  return db
    .select()
    .from(segments)
    .where(eq(segments.projectId, projectId))
    .orderBy(asc(segments.order));
}

/** Reactive single-row query for a draft's `projects` row (upload destination/status live here). */
export function projectQuery(draftId: string) {
  return db.select().from(projects).where(eq(projects.id, draftId));
}

/** Every segment in the library — drives the global background transcription engine. */
// Mutations — each is a single-row write that autosaves the draft (§3).

export async function createDraft(): Promise<string> {
  const id = Crypto.randomUUID();
  await db.insert(projects).values({ id, mode: 'camera' });
  return id;
}

export async function addSegment(draftId: string, segment: NewSegment): Promise<void> {
  const [{ value: order }] = await db
    .select({ value: count() })
    .from(segments)
    .where(eq(segments.projectId, draftId));

  await db.insert(segments).values({
    id: segment.id,
    projectId: draftId,
    order,
    originalFilename: segment.originalFilename,
    durationMs: segment.durationMs,
    thumbnail: segment.thumbnail ?? null,
  });
  await db.update(projects).set({ lastModified: now }).where(eq(projects.id, draftId));
}

/** Delete a segment and its clip file, unless a sibling segment still references the file. */
export async function deleteSegment(segmentId: string): Promise<void> {
  const [seg] = await db.select().from(segments).where(eq(segments.id, segmentId));
  if (!seg) return;

  await db.delete(segments).where(eq(segments.id, segmentId));

  const [{ value: stillReferenced }] = await db
    .select({ value: count() })
    .from(segments)
    .where(eq(segments.originalFilename, seg.originalFilename));
  if (stillReferenced === 0) deleteSegmentFile(seg.originalFilename);
  // The edited file and both thumbnails are per-segment (never shared) — delete with the row.
  if (seg.editedFilename) {
    deleteSegmentFile(seg.editedFilename);
    deleteSegmentFile(editedThumbRelPath(seg.editedFilename));
  }
  deleteSegmentFile(thumbRelPath(seg.projectId, segmentId));

  await db.update(projects).set({ lastModified: now }).where(eq(projects.id, seg.projectId));
}

/** Apply a destructive edit: point the segment at its new re-encoded file + duration. */
export async function setEdited(
  segmentId: string,
  editedFilename: string,
  editedDurationMs: number,
): Promise<void> {
  const [seg] = await db.select().from(segments).where(eq(segments.id, segmentId));
  if (!seg) return;
  // Cover the edited file's first frame at its revision-paired thumb path (the pristine thumb
  // stays on disk untouched, ready for a reset).
  const thumbRel = editedThumbRelPath(editedFilename);
  const ok = await generateThumbnailFile(absolutize(editedFilename), absolutize(thumbRel));
  await db
    .update(segments)
    .set({ editedFilename, editedDurationMs, thumbnail: ok ? thumbRel : seg.thumbnail })
    .where(eq(segments.id, segmentId));
  // Replacing a prior edit — drop its files only now that the row points at the new revision,
  // so a failure above never leaves the segment referencing deleted files. Keep the old thumb
  // as the cover fallback if the new one failed to generate.
  if (seg.editedFilename && seg.editedFilename !== editedFilename) {
    deleteSegmentFile(seg.editedFilename);
    if (ok) deleteSegmentFile(editedThumbRelPath(seg.editedFilename));
  }
  await db.update(projects).set({ lastModified: now }).where(eq(projects.id, seg.projectId));
}

/** Reset a segment back to its pristine original — delete the edited file, clear the columns. */
export async function resetEdit(segmentId: string): Promise<void> {
  const [seg] = await db.select().from(segments).where(eq(segments.id, segmentId));
  if (!seg) return;
  // Revert the cover to the pristine original's thumbnail.
  const thumbRel = thumbRelPath(seg.projectId, segmentId);
  const ok = await generateThumbnailFile(absolutize(seg.originalFilename), absolutize(thumbRel));
  await db
    .update(segments)
    .set({ editedFilename: null, editedDurationMs: null, thumbnail: ok ? thumbRel : null })
    .where(eq(segments.id, segmentId));
  // Drop the now-orphaned edited file and thumb only after the row no longer references them.
  if (seg.editedFilename) {
    deleteSegmentFile(seg.editedFilename);
    deleteSegmentFile(editedThumbRelPath(seg.editedFilename));
  }
  await db.update(projects).set({ lastModified: now }).where(eq(projects.id, seg.projectId));
}

/** Persist a new clip ordering (ids in target order) for a single draft. */
export async function reorderSegments(orderedIds: string[]): Promise<void> {
  if (orderedIds.length === 0) return;
  await db.transaction(async (tx) => {
    for (let i = 0; i < orderedIds.length; i++) {
      await tx.update(segments).set({ order: i }).where(eq(segments.id, orderedIds[i]));
    }
    const [first] = await tx.select().from(segments).where(eq(segments.id, orderedIds[0]));
    if (first) {
      await tx.update(projects).set({ lastModified: now }).where(eq(projects.id, first.projectId));
    }
  });
}

export async function renameDraft(draftId: string, name: string | null): Promise<void> {
  await db.update(projects).set({ name, lastModified: now }).where(eq(projects.id, draftId));
}

/** Delete a draft (segments cascade) and remove its on-disk clip directory. */
export async function deleteDraft(draftId: string): Promise<void> {
  await db.delete(projects).where(eq(projects.id, draftId));
  deleteDraftDir(draftId);
  await deleteDraftToken(draftId);
}

// Upload destination (deep-link pairing) -----------------------------------------------------

/**
 * Pair a draft with an upload destination (from a validated deep link +
 * `/capabilities` lookup) and flip its mode to `'upload'`. Resets any prior
 * upload progress (`uploadResourceUrl`/`uploadStatus`/`captionsUploadStatus`)
 * since a new destination invalidates an in-flight upload to the old one.
 * The bearer token is written to expo-secure-store, not this row (§ token security).
 */
export async function setUploadDestination(
  draftId: string,
  destination: UploadDestination,
): Promise<void> {
  await db
    .update(projects)
    .set({
      mode: 'upload',
      uploadServer: destination.server,
      uploadArtifactId: destination.artifactId,
      uploadUnit: destination.uploadUnit,
      uploadResourceUrl: null,
      uploadStatus: 'idle',
      captionsUploadStatus: null,
      lastModified: now,
    })
    .where(eq(projects.id, draftId));
  await setDraftToken(draftId, destination.token);
  // A new destination invalidates any sub-artifacts (segment videos, merged captions/
  // manifest/thumbnail) uploaded to the old one — they'd resume against the wrong server otherwise.
  await db.delete(uploadArtifacts).where(eq(uploadArtifacts.projectId, draftId));
}

/** Persist upload progress so a killed app can resume via `HEAD` on `resourceUrl` rather than restarting. */
export async function setUploadProgress(
  draftId: string,
  progress: { status: NonNullable<Project['uploadStatus']>; resourceUrl?: string | null },
): Promise<void> {
  await db
    .update(projects)
    .set({
      uploadStatus: progress.status,
      ...(progress.resourceUrl !== undefined ? { uploadResourceUrl: progress.resourceUrl } : {}),
      lastModified: now,
    })
    .where(eq(projects.id, draftId));
}

/**
 * Persist the merged export output (path + duration) the background upload manager uploads, so an
 * upload interrupted by an app kill can be re-driven from launch without the export screen.
 */
export async function setUploadMerged(
  draftId: string,
  merged: { path: string; durationMs: number },
): Promise<void> {
  await db
    .update(projects)
    .set({
      uploadMergedPath: merged.path,
      uploadMergedDurationMs: merged.durationMs,
      lastModified: now,
    })
    .where(eq(projects.id, draftId));
}

/**
 * Drafts left mid-upload — status still `'uploading'` from before an interruption (nav away, app
 * kill). The background manager re-drives exactly these on launch/foreground. Explicitly `'failed'`
 * runs are excluded: they wait for a deliberate retry rather than auto-retrying every launch.
 */
export async function getResumableDrafts(): Promise<Project[]> {
  return db
    .select()
    .from(projects)
    .where(and(eq(projects.mode, 'upload'), eq(projects.uploadStatus, 'uploading')));
}

/** Persist captions-upload progress independently of the video upload (so a captions-only retry doesn't redo the video). */
export async function setCaptionsUploadStatus(
  draftId: string,
  status: NonNullable<Project['captionsUploadStatus']>,
): Promise<void> {
  await db
    .update(projects)
    .set({ captionsUploadStatus: status, lastModified: now })
    .where(eq(projects.id, draftId));
}

// Upload sub-artifacts (segment/captions/manifest/thumbnail resume identity) ----------------

/**
 * Stable local key for an upload session's sub-artifacts (§ `upload_artifacts`). A closed union so
 * a typo can't silently reserve a distinct row that never matches on resume. Merged mode:
 * `"captions"` | `"manifest"` (beat manifest) | `"thumbnail"`. Segmented mode: one `:video` per clip.
 */
export type UploadArtifactKey = 'captions' | 'manifest' | 'thumbnail' | `${string}:video`;

/** A sub-artifact's identity/progress, or `null` if this `localKey` hasn't been reserved yet. */
export async function getUploadArtifact(
  draftId: string,
  localKey: UploadArtifactKey,
): Promise<{ artifactId: string; resourceUrl: string | null } | null> {
  const [row] = await db
    .select({ artifactId: uploadArtifacts.artifactId, resourceUrl: uploadArtifacts.resourceUrl })
    .from(uploadArtifacts)
    .where(eq(uploadArtifacts.id, `${draftId}:${localKey}`));
  return row ?? null;
}

/** Reserve (or update the progress of) a sub-artifact, so a retry resumes it instead of
 * minting a fresh artifactId and re-uploading from scratch. */
export async function upsertUploadArtifact(
  draftId: string,
  localKey: UploadArtifactKey,
  data: { artifactId: string; resourceUrl?: string | null },
): Promise<void> {
  const id = `${draftId}:${localKey}`;
  await db
    .insert(uploadArtifacts)
    .values({
      id,
      projectId: draftId,
      localKey,
      artifactId: data.artifactId,
      resourceUrl: data.resourceUrl ?? null,
    })
    .onConflictDoUpdate({
      target: uploadArtifacts.id,
      set: {
        artifactId: data.artifactId,
        ...(data.resourceUrl !== undefined ? { resourceUrl: data.resourceUrl } : {}),
      },
    });
}

// Draft transfer (.pulse export/import) ----------------------------------------------------

/** Load a draft's project row + ordered segments for packing into a `.pulse` bundle. */
export async function getDraftForExport(
  draftId: string,
): Promise<{ project: Project; segments: Segment[] } | null> {
  const [project] = await db.select().from(projects).where(eq(projects.id, draftId));
  if (!project) return null;
  const rows = await segmentsForDraft(draftId);
  return { project, segments: rows };
}

/**
 * Insert an imported draft and its segments in one transaction. Caller mints fresh ids and
 * writes the clip files first; this only commits the rows once the media is on disk.
 */
export async function insertImportedDraft(
  project: typeof projects.$inferInsert,
  segmentRows: (typeof segments.$inferInsert)[],
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.insert(projects).values(project);
    if (segmentRows.length > 0) await tx.insert(segments).values(segmentRows);
  });
}
