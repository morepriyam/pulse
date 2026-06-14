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

/**
 * Unpack a `.pulse` bundle: validate it, write each clip back to disk under a FRESH draft id
 * (never the source's — so importing can't clobber a local draft and a bundle can be imported
 * repeatedly), regenerate thumbnails, then commit the rows. Each draft is independent: a bad
 * one is rolled back (its files removed) and skipped rather than aborting the whole import.
 */
export async function importPulseFile(fileUri: string): Promise<ImportResult> {
  const bytes = await new File(fileUri).bytes();

  let archive: Record<string, Uint8Array>;
  try {
    archive = unzipSync(bytes);
  } catch {
    throw new Error(BAD_FILE);
  }

  const manifestEntry = archive[MANIFEST_NAME];
  if (!manifestEntry) throw new Error(BAD_FILE);

  let manifest: unknown;
  try {
    manifest = JSON.parse(strFromU8(manifestEntry));
  } catch {
    throw new Error('This .pulse bundle is corrupted.');
  }
  if (!isPulseManifest(manifest)) throw new Error('This .pulse bundle is corrupted or unsupported.');

  // One id base for the batch; `+ d` keeps draft ids unique and stamps lastModified in import order.
  const base = Date.now();
  const draftIds: string[] = [];

  for (let d = 0; d < manifest.drafts.length; d++) {
    const draft = manifest.drafts[d];
    const draftId = String(base + d);

    try {
      const segmentRows = [];
      for (let s = 0; s < draft.segments.length; s++) {
        const seg = draft.segments[s];
        const origBytes = archive[seg.original];
        if (!origBytes) continue; // clip referenced by the manifest is missing from the archive

        const segmentId = `${draftId}-${s}`;
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
          order: typeof seg.order === 'number' ? seg.order : s,
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
          lastModified: base + d, // freshly imported → surface at the top of the list
        },
        segmentRows,
      );
      draftIds.push(draftId);
    } catch (e) {
      deleteDraftDir(draftId); // roll back this draft's files; keep importing the rest
      console.warn('[draft-transfer] failed to import draft', d, e);
    }
  }

  if (draftIds.length === 0) throw new Error('No drafts could be imported from this file.');
  return { draftIds };
}
