import { asc, count, desc, eq, sql } from 'drizzle-orm';

import { deleteDraftDir, deleteSegmentFile } from '@/utils/file-store';
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
    // Effective (trimmed) duration; per-edge null fallback MUST match utils/segment-window.ts.
    durationMs: sql<number>`coalesce(sum(coalesce(${segments.trimEndMs}, ${segments.durationMs}) - coalesce(${segments.trimStartMs}, 0)), 0)`,
    // Cover frame is derived at runtime from the first clip's file.
    firstSegmentFilename: sql<
      string | null
    >`(select original_filename from ${segments} where ${segments.projectId} = ${projects.id} order by sort_order limit 1)`,
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

// Mutations — each is a single-row write that autosaves the draft (§3).

export async function createDraft(): Promise<string> {
  const id = String(Date.now());
  await db.insert(projects).values({ id, mode: 'camera' });
  return id;
}

export async function addSegment(
  draftId: string,
  segment: { id: string; originalFilename: string; durationMs: number },
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
