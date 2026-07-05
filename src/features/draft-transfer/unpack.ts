import { File } from 'expo-file-system';
import { strFromU8, unzipSync } from 'fflate';

import { insertImportedDraft } from '@/db/drafts';
import {
  absolutize,
  deleteDraftDir,
  editedThumbRelPath,
  thumbRelPath,
  writeEditedBytes,
  writeOriginalBytes,
} from '@/utils/file-store';
import { generateThumbnailFile } from '@/utils/video';

import { isPulseManifest, MANIFEST_NAME } from './manifest';

export type ImportResult = { draftIds: string[] };

const BAD_FILE = 'This file isn’t a valid .pulse bundle.';
const TOO_BIG = 'This .pulse bundle is too large to import.';

// Our own exports are STORE-only (see pack.ts), so decompressed ≈ file size; a
// bundle whose entries claim to inflate far beyond the cap is a deflate bomb,
// not a real export. The whole archive is held in memory during import, so the
// cap also keeps legitimate-but-huge files from OOMing the app.
const MAX_BUNDLE_BYTES = 1024 * 1024 * 1024; // 1 GiB

/**
 * Unpack a `.pulse` bundle: validate it, write each clip back to disk under a FRESH draft id
 * (never the source's — so importing can't clobber a local draft and a bundle can be imported
 * repeatedly), regenerate thumbnails, then commit the rows. Each draft is independent: a bad
 * one is rolled back (its files removed) and skipped rather than aborting the whole import.
 */
export async function importPulseFile(fileUri: string): Promise<ImportResult> {
  const file = new File(fileUri);
  if ((file.size ?? 0) > MAX_BUNDLE_BYTES) throw new Error(TOO_BIG);
  const bytes = await file.bytes();

  let archive: Record<string, Uint8Array>;
  try {
    let declaredTotal = 0;
    archive = unzipSync(bytes, {
      filter: (entry) => {
        declaredTotal += entry.originalSize;
        if (declaredTotal > MAX_BUNDLE_BYTES) throw new Error(TOO_BIG);
        return true;
      },
    });
  } catch (e) {
    throw new Error(e instanceof Error && e.message === TOO_BIG ? TOO_BIG : BAD_FILE);
  }

  const manifestEntry = archive[MANIFEST_NAME];
  if (!manifestEntry) throw new Error(BAD_FILE);

  let manifest: unknown;
  try {
    manifest = JSON.parse(strFromU8(manifestEntry));
  } catch {
    throw new Error('This .pulse bundle is corrupted.');
  }
  if (!isPulseManifest(manifest))
    throw new Error('This .pulse bundle is corrupted or unsupported.');

  // One id base for the batch; offsetting by index keeps draft ids unique and stamps
  // lastModified in import order.
  const base = Date.now();
  const draftIds: string[] = [];

  for (let draftIndex = 0; draftIndex < manifest.drafts.length; draftIndex++) {
    const draft = manifest.drafts[draftIndex];
    const draftId = String(base + draftIndex);

    try {
      const segmentRows = [];
      for (let segIndex = 0; segIndex < draft.segments.length; segIndex++) {
        const seg = draft.segments[segIndex];
        const origBytes = archive[seg.original];
        if (!origBytes) continue; // clip referenced by the manifest is missing from the archive

        const segmentId = `${draftId}-${segIndex}`;
        const originalFilename = writeOriginalBytes(draftId, segmentId, origBytes);

        let editedFilename: string | null = null;
        let editedDurationMs: number | null = null;
        const editedBytes = seg.edited ? archive[seg.edited] : undefined;
        if (editedBytes) {
          editedFilename = writeEditedBytes(draftId, segmentId, editedBytes);
          editedDurationMs = seg.editedDurationMs ?? null;
        }

        // Thumbnails aren't shipped (deterministic derivatives) — regenerate the cover from the
        // effective clip, mirroring the original/edited thumb-path split the editor uses.
        const effective = editedFilename ?? originalFilename;
        const coverRel = editedFilename
          ? editedThumbRelPath(draftId, segmentId)
          : thumbRelPath(draftId, segmentId);
        const ok = await generateThumbnailFile(absolutize(effective), absolutize(coverRel));

        segmentRows.push({
          id: segmentId,
          projectId: draftId,
          order: typeof seg.order === 'number' ? seg.order : segIndex,
          originalFilename,
          durationMs: seg.durationMs,
          editedFilename,
          editedDurationMs,
          thumbnail: ok ? coverRel : null,
        });
      }

      if (segmentRows.length === 0) {
        deleteDraftDir(draftId);
        continue;
      }

      await insertImportedDraft(
        {
          id: draftId,
          name: draft.name ?? null,
          mode: draft.mode === 'upload' ? 'upload' : 'camera',
          createdAt: typeof draft.createdAt === 'number' ? draft.createdAt : base,
          lastModified: base + draftIndex, // freshly imported → surface at the top of the list
        },
        segmentRows,
      );
      draftIds.push(draftId);
    } catch (e) {
      deleteDraftDir(draftId); // roll back this draft's files; keep importing the rest
      console.warn('[draft-transfer] failed to import draft', draftIndex, e);
    }
  }

  if (draftIds.length === 0) throw new Error('No drafts could be imported from this file.');
  return { draftIds };
}
