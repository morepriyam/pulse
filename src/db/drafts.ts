import { count, desc, eq, sql } from 'drizzle-orm';

import { db } from './client';
import { projects, segments } from './schema';

/** One row per draft with its segment count and effective (trim-aware) duration. */
export const draftListQuery = db
  .select({
    id: projects.id,
    name: projects.name,
    thumbnail: projects.thumbnail,
    lastModified: projects.lastModified,
    segmentCount: count(segments.id),
    durationMs: sql<number>`coalesce(sum(coalesce(${segments.trimEndMs} - ${segments.trimStartMs}, ${segments.durationMs})), 0)`,
  })
  .from(projects)
  .leftJoin(segments, eq(segments.projectId, projects.id))
  .groupBy(projects.id)
  .orderBy(desc(projects.lastModified));

// --- Dev-only helpers: exercise the reactive list before the recorder exists. ---

let seedCounter = 0;

export async function devSeedDraft() {
  const id = `dev-${Date.now()}-${seedCounter++}`;
  await db.insert(projects).values({ id, name: `Sample ${seedCounter}` });
  await db.insert(segments).values([
    { id: `${id}-a`, projectId: id, order: 0, originalFilename: 'dev/a.mp4', durationMs: 8200 },
    {
      id: `${id}-b`,
      projectId: id,
      order: 1,
      originalFilename: 'dev/b.mp4',
      durationMs: 6000,
      trimStartMs: 1000,
      trimEndMs: 4000,
    },
  ]);
}

export async function devClearDrafts() {
  await db.delete(projects);
}
