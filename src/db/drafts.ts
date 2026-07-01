import { asc, count, desc, eq, sql } from 'drizzle-orm';

import {
  absolutize,
  deleteDraftDir,
  deleteSegmentFile,
  editedThumbRelPath,
  thumbRelPath,
} from '@/utils/file-store';
import { generateThumbnailFile } from '@/utils/video';
import { db } from './client';
import { projects, segments } from './schema';

const now = sql`(unixepoch('subsec') * 1000)`;

/** One row per draft with its segment count, trim-aware duration, and cover clip. */
export const draftListQuery = db
  .select({
    id: projects.id,
    name: projects.name,
    lastModified: projects.lastModified,
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
export const allSegmentsQuery = db.select().from(segments);

/** Load one segment row by id (e.g. for the subtitle editor's video preview). */
export async function getSegment(segmentId: string) {
  const [seg] = await db.select().from(segments).where(eq(segments.id, segmentId));
  return seg ?? null;
}

// Mutations — each is a single-row write that autosaves the draft (§3).

export async function createDraft(): Promise<string> {
  const id = String(Date.now());
  await db.insert(projects).values({ id, mode: 'camera' });
  return id;
}

export async function addSegment(
  draftId: string,
  segment: { id: string; originalFilename: string; durationMs: number; thumbnail?: string | null },
): Promise<void> {
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
  if (seg.editedFilename) deleteSegmentFile(seg.editedFilename);
  deleteSegmentFile(thumbRelPath(seg.projectId, segmentId));
  deleteSegmentFile(editedThumbRelPath(seg.projectId, segmentId));

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
  // Replacing a prior edit — drop the old file first (importTrimmedFile writes a fresh one).
  if (seg.editedFilename && seg.editedFilename !== editedFilename) {
    deleteSegmentFile(seg.editedFilename);
  }
  // Cover the edited file's first frame at the distinct edited-thumb path (the pristine thumb
  // stays on disk untouched, ready for a reset).
  const thumbRel = editedThumbRelPath(seg.projectId, segmentId);
  const ok = await generateThumbnailFile(absolutize(editedFilename), absolutize(thumbRel));
  await db
    .update(segments)
    .set({ editedFilename, editedDurationMs, thumbnail: ok ? thumbRel : seg.thumbnail })
    .where(eq(segments.id, segmentId));
  await db.update(projects).set({ lastModified: now }).where(eq(projects.id, seg.projectId));
}

/** Reset a segment back to its pristine original — delete the edited file, clear the columns. */
export async function resetEdit(segmentId: string): Promise<void> {
  const [seg] = await db.select().from(segments).where(eq(segments.id, segmentId));
  if (!seg) return;
  if (seg.editedFilename) deleteSegmentFile(seg.editedFilename);
  // Revert the cover to the pristine original's thumbnail; drop the now-orphaned edited thumb.
  deleteSegmentFile(editedThumbRelPath(seg.projectId, segmentId));
  const thumbRel = thumbRelPath(seg.projectId, segmentId);
  const ok = await generateThumbnailFile(absolutize(seg.originalFilename), absolutize(thumbRel));
  await db
    .update(segments)
    .set({ editedFilename: null, editedDurationMs: null, thumbnail: ok ? thumbRel : null })
    .where(eq(segments.id, segmentId));
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
}

// Upload destination (deep-link pairing) -----------------------------------------------------

/** A draft's currently-set upload destination, or null fields if it has none. */
export async function getUploadDestination(draftId: string): Promise<{
  uploadServer: string | null;
  uploadToken: string | null;
  uploadArtifactId: string | null;
  uploadUnit: 'beat' | 'merged' | null;
} | null> {
  const [project] = await db.select().from(projects).where(eq(projects.id, draftId));
  if (!project) return null;
  return {
    uploadServer: project.uploadServer,
    uploadToken: project.uploadToken,
    uploadArtifactId: project.uploadArtifactId,
    uploadUnit: project.uploadUnit,
  };
}

/**
 * Pair a draft with an upload destination (from a validated deep link +
 * `/capabilities` lookup) and flip its mode to `'upload'`. Resets any prior
 * upload progress (`uploadResourceUrl`/`uploadStatus`/`captionsUploadStatus`)
 * since a new destination invalidates an in-flight upload to the old one.
 */
export async function setUploadDestination(
  draftId: string,
  destination: { server: string; token: string | null; artifactId: string; uploadUnit: 'beat' | 'merged' },
): Promise<void> {
  await db
    .update(projects)
    .set({
      mode: 'upload',
      uploadServer: destination.server,
      uploadToken: destination.token,
      uploadArtifactId: destination.artifactId,
      uploadUnit: destination.uploadUnit,
      uploadResourceUrl: null,
      uploadStatus: 'idle',
      captionsUploadStatus: null,
      lastModified: now,
    })
    .where(eq(projects.id, draftId));
}

/** Persist upload progress so a killed app can resume via `HEAD` on `resourceUrl` rather than restarting. */
export async function setUploadProgress(
  draftId: string,
  progress: { status: 'idle' | 'uploading' | 'uploaded' | 'failed'; resourceUrl?: string | null },
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

/** Persist captions-upload progress independently of the video upload (so a captions-only retry doesn't redo the video). */
export async function setCaptionsUploadStatus(
  draftId: string,
  status: 'idle' | 'uploading' | 'uploaded' | 'failed',
): Promise<void> {
  await db
    .update(projects)
    .set({ captionsUploadStatus: status, lastModified: now })
    .where(eq(projects.id, draftId));
}

// Draft transfer (.pulse export/import) ----------------------------------------------------

/** Load a draft's project row + ordered segments for packing into a `.pulse` bundle. */
export async function getDraftForExport(
  draftId: string,
): Promise<{ project: typeof projects.$inferSelect; segments: (typeof segments.$inferSelect)[] } | null> {
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
