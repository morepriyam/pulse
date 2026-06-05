import { eq } from 'drizzle-orm';
import { Asset } from 'expo-asset';

import { db } from '@/db/client';
import { addSegment } from '@/db/drafts';
import { projects } from '@/db/schema';
import { absolutize, copyIntoSegments, deleteDraftDir } from '@/utils/file-store';
import { getDurationMs } from '@/utils/video';

// Dev-only helpers (§1.0b): seed one curated draft of bundled sample clips so the timeline
// editor is exercisable on a simulator with no camera. Gate every caller behind `__DEV__`.

const SEED_DRAFT_ID = 'dev-seed';

/**
 * Bundled sample clips, laid into the seed draft in array order. Pick clips with
 * **deliberately mismatched** resolution / fps / codec / orientation so they also stress the
 * export normalization path (§1.0b). Drop the files in `assets/dev/` and list them here.
 *
 * `require()` of a bundled `.mp4` returns an asset module id (resolved by metro at build time),
 * so paths must be static string literals — no variables, no globbing.
 */
const FIXTURES: { module: number; label: string }[] = [
  // { module: require('../../assets/dev/portrait-1080p-h264.mp4'), label: 'portrait 1080p h264' },
  // { module: require('../../assets/dev/landscape-4k-60fps-hevc.mp4'), label: 'landscape 4k60 hevc' },
  // { module: require('../../assets/dev/square-720p.mp4'), label: 'square 720p' },
];

/**
 * Add the curated sample draft, once. Idempotent: a fixed draft id means pressing the seed
 * button repeatedly never litters duplicates — if it already exists this is a no-op.
 * Returns the seed draft id (or undefined when no fixtures are wired up yet).
 */
export async function seedDraft(): Promise<string | undefined> {
  if (FIXTURES.length === 0) {
    console.warn(
      '[seed] no fixtures yet — drop clips in assets/dev/ and list them in src/dev/seed.ts',
    );
    return;
  }

  const existing = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.id, SEED_DRAFT_ID));
  if (existing.length > 0) return SEED_DRAFT_ID;

  await db.insert(projects).values({ id: SEED_DRAFT_ID, name: 'Dev sample' });

  for (let i = 0; i < FIXTURES.length; i++) {
    const asset = Asset.fromModule(FIXTURES[i].module);
    await asset.downloadAsync(); // copies the bundled clip into the cache, populating localUri
    if (!asset.localUri) continue;

    const segmentId = `${SEED_DRAFT_ID}-${i}`;
    const originalFilename = await copyIntoSegments(asset.localUri, SEED_DRAFT_ID, segmentId);
    const durationMs = await getDurationMs(absolutize(originalFilename));
    await addSegment(SEED_DRAFT_ID, { id: segmentId, originalFilename, durationMs });
  }

  return SEED_DRAFT_ID;
}

/** Wipe all drafts (metadata) and the seed draft's clip dir, so a re-seed starts clean. */
export async function clearDrafts(): Promise<void> {
  await db.delete(projects);
  deleteDraftDir(SEED_DRAFT_ID);
}
