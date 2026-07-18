import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';

import { absolutize, thumbRelPath, toFileUri } from '@/utils/file-store';
import { generateThumbnailFile, getDurationMs } from '@/utils/video';
import { db } from './client';
import type { DataMigration } from './data-migrations';
import { projects, segments } from './schema';

/**
 * One-shot migration of drafts created by the ORIGINAL Pulse app (mieweb/pulse, ≤ 1.2.x,
 * bundle id com.mieweb.pulse — which this app replaces in-place as an update).
 *
 * Old storage model:
 *   - Metadata: AsyncStorage key `recording_drafts` — a JSON array of
 *     `{ id, mode, name?, segments[{ id, recordedDurationSeconds|duration, uri,
 *        trimStartTimeMs?, trimEndTimeMs? }], maxDurationLimitSeconds, createdAt,
 *        lastModified, thumbnail? }` (segment `uri` is Documents-relative,
 *        e.g. `pulse/drafts/{draftId}/segments/{segId}.mov`).
 *   - Per-draft upload config: AsyncStorage `upload_config_{draftId}` = `{ server, token? }`.
 *   - Files: `Documents/pulse/drafts/{draftId}/segments/*` + `thumbs/`.
 *
 * Mapping into this app's model:
 *   - Each old draft → a `projects` row (id / name / mode / timestamps preserved).
 *   - Each old segment → a `segments` row + its clip file MOVED from `Documents/pulse/…`
 *     into `Documents/drafts/{draftId}/segments/{segmentId}.{ext}` (real extension kept —
 *     old iOS recordings are .mov). A fresh thumbnail is generated.
 *   - Old NON-DESTRUCTIVE trim points are intentionally dropped: the full pristine clip is
 *     imported and the user re-trims in the new (destructive) editor.
 *   - Old per-draft upload configs are NOT migrated — the new pairing model needs an
 *     artifactId/uploadUnit that the legacy `{server, token}` config never had; re-pair instead.
 *
 * Idempotent + crash-safe: inserts are `onConflictDoNothing` (ids preserved), file moves skip
 * already-moved clips, and completion is tracked by the data-migration runner — a crash mid-way
 * just re-runs the remainder on next launch. Legacy files/keys are deleted only at the very end.
 */

/** Legacy AsyncStorage keys (see mieweb/pulse `utils/draftStorage.ts` / `uploadConfig.ts`). */
const LEGACY_DRAFTS_KEY = 'recording_drafts';
const LEGACY_UPLOAD_CONFIG_PREFIX = 'upload_config_';
const LEGACY_REDO_STACK_KEY = 'redo_stack';

/** Legacy Documents-relative root all old media lived under. */
const LEGACY_BASE_DIR = 'pulse';

type LegacySegment = {
  id?: string;
  uri?: string;
  recordedDurationSeconds?: number;
  /** Pre-rename field some very old drafts still carry. */
  duration?: number;
};

type LegacyDraft = {
  id?: string;
  mode?: string;
  name?: string;
  segments?: LegacySegment[];
  createdAt?: string | number;
  lastModified?: string | number;
};

function parseTimestamp(value: string | number | undefined, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

/** Resolve a legacy segment uri (Documents-relative, or absolute from very old builds) to a File. */
function legacyFile(uri: string): File {
  if (uri.startsWith('file://')) return new File(uri);
  if (uri.startsWith('/')) return new File(toFileUri(uri));
  return new File(Paths.document, ...uri.split('/'));
}

function extensionOf(uri: string): string {
  const name = uri.split('?')[0].split('/').pop() ?? '';
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
  return /^[a-z0-9]+$/.test(ext) && ext.length > 0 ? ext : 'mp4';
}

/** Import one legacy draft; returns true if it produced a usable project. */
async function migrateDraft(draft: LegacyDraft): Promise<boolean> {
  const draftId = draft.id;
  if (!draftId) return false;

  // Move each clip into the new layout first; only drafts with ≥1 surviving clip get a row.
  const imported: { id: string; relPath: string; durationMs: number }[] = [];
  for (const seg of draft.segments ?? []) {
    if (!seg.id || !seg.uri) continue;
    const relPath = `drafts/${draftId}/segments/${seg.id}.${extensionOf(seg.uri)}`;
    const dest = new File(Paths.document, ...relPath.split('/'));

    if (!dest.exists) {
      const src = legacyFile(seg.uri);
      if (!src.exists) {
        console.warn(`[legacy-migration] clip missing, skipping segment ${seg.id} of ${draftId}`);
        continue;
      }
      new Directory(Paths.document, 'drafts', draftId, 'segments').create({
        intermediates: true,
        idempotent: true,
      });
      await src.move(dest);
    }

    const declaredSec = seg.recordedDurationSeconds ?? seg.duration;
    let durationMs =
      typeof declaredSec === 'number' && Number.isFinite(declaredSec) && declaredSec > 0
        ? Math.round(declaredSec * 1000)
        : 0;
    if (durationMs <= 0) durationMs = await getDurationMs(dest.uri);
    if (durationMs <= 0) {
      console.warn(`[legacy-migration] unreadable clip, skipping segment ${seg.id} of ${draftId}`);
      continue;
    }
    imported.push({ id: seg.id, relPath, durationMs });
  }

  if (imported.length === 0) return false;

  const nowMs = Date.now();
  const createdAt = parseTimestamp(draft.createdAt, nowMs);
  await db
    .insert(projects)
    .values({
      id: draftId,
      name: draft.name?.trim() || null,
      mode: draft.mode === 'upload' ? 'upload' : 'camera',
      createdAt,
      lastModified: parseTimestamp(draft.lastModified, createdAt),
    })
    .onConflictDoNothing();

  for (let i = 0; i < imported.length; i++) {
    const clip = imported[i];
    const thumbRel = thumbRelPath(draftId, clip.id);
    const hasThumb = await generateThumbnailFile(absolutize(clip.relPath), absolutize(thumbRel));
    await db
      .insert(segments)
      .values({
        id: clip.id,
        projectId: draftId,
        order: i,
        originalFilename: clip.relPath,
        durationMs: clip.durationMs,
        thumbnail: hasThumb ? thumbRel : null,
      })
      .onConflictDoNothing();
  }
  return true;
}

/** Delete the legacy media tree and every legacy AsyncStorage key. Best-effort. */
async function cleanupLegacyStorage(): Promise<void> {
  try {
    const legacyRoot = new Directory(Paths.document, LEGACY_BASE_DIR);
    if (legacyRoot.exists) legacyRoot.delete();
  } catch (e) {
    console.warn('[legacy-migration] could not delete legacy media dir', e);
  }
  try {
    const keys = await AsyncStorage.getAllKeys();
    const stale = keys.filter(
      (k) =>
        k === LEGACY_DRAFTS_KEY ||
        k === LEGACY_REDO_STACK_KEY ||
        k.startsWith(LEGACY_UPLOAD_CONFIG_PREFIX),
    );
    if (stale.length > 0) await AsyncStorage.multiRemove(stale);
  } catch (e) {
    console.warn('[legacy-migration] could not clear legacy AsyncStorage keys', e);
  }
}

/** The legacy import as a one-shot data-migration task (see `data-migrations.ts`). */
export const legacyDraftsImport: DataMigration = {
  id: 'legacy-drafts-import',
  async run() {
    const raw = await AsyncStorage.getItem(LEGACY_DRAFTS_KEY);
    if (raw) {
      const drafts: LegacyDraft[] = JSON.parse(raw);
      let migrated = 0;
      for (const draft of Array.isArray(drafts) ? drafts : []) {
        if (await migrateDraft(draft)) migrated++;
      }
      console.log(`[legacy-migration] imported ${migrated} legacy draft(s)`);
    }
    await cleanupLegacyStorage();
  },
};
