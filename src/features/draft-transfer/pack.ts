import { Directory, File, Paths } from 'expo-file-system';
import { strToU8, zipSync } from 'fflate';

import { getDraftForExport } from '@/db/drafts';
import { readRelBytes } from '@/utils/file-store';

import {
  type BundleDraft,
  type BundleSegment,
  MANIFEST_NAME,
  MEDIA_DIR,
  PULSE_FORMAT,
  PULSE_VERSION,
  type PulseManifest,
} from './manifest';

/** Cache subdir for built bundles. Wiped on each export — these are transient share artifacts. */
const EXPORT_DIRNAME = 'pulse-exports';

/** Reduce a draft name to a filesystem-safe slug for the single-draft filename. */
function safeName(name: string | null): string {
  const slug = (name ?? '')
    .replace(/[^a-z0-9-_ ]+/gi, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 40);
  return slug || 'untitled';
}

/**
 * Pack the given drafts into a single `.pulse` ZIP (manifest + raw clips) in the cache and
 * return its `file://` uri for sharing. Segments whose clip is missing on disk are skipped;
 * a draft that ends up empty is dropped. Throws if nothing exportable remains.
 *
 * `now` is supplied by the caller (the bundle timestamp + filename) so this stays pure of clocks.
 */
export async function exportDrafts(draftIds: string[], now: number): Promise<string> {
  if (draftIds.length === 0) throw new Error('No drafts selected.');

  const files: Record<string, Uint8Array> = {};
  const bundleDrafts: BundleDraft[] = [];
  let singleExportName: string | null = null;

  for (let draftIndex = 0; draftIndex < draftIds.length; draftIndex++) {
    const loaded = await getDraftForExport(draftIds[draftIndex]);
    if (!loaded) continue;
    const { project, segments } = loaded;
    const bundleSegments: BundleSegment[] = [];

    for (let segIndex = 0; segIndex < segments.length; segIndex++) {
      const seg = segments[segIndex];
      const origBytes = await readRelBytes(seg.originalFilename);
      if (!origBytes) continue; // clip file vanished — skip this segment
      const original = `${MEDIA_DIR}/d${draftIndex}-s${segIndex}.mp4`;
      files[original] = origBytes;

      // Preserve full fidelity: ship the edited cut alongside the pristine original so the
      // recipient gets an identical draft and can still reset the edit.
      let edited: string | null = null;
      if (seg.editedFilename) {
        const editedBytes = await readRelBytes(seg.editedFilename);
        if (editedBytes) {
          edited = `${MEDIA_DIR}/d${draftIndex}-s${segIndex}.edited.mp4`;
          files[edited] = editedBytes;
        }
      }

      bundleSegments.push({
        order: seg.order,
        durationMs: seg.durationMs,
        original,
        edited,
        editedDurationMs: edited ? seg.editedDurationMs : null,
      });
    }

    if (bundleSegments.length === 0) continue; // nothing to carry for this draft
    if (bundleDrafts.length === 0) singleExportName = project.name;
    bundleDrafts.push({
      name: project.name,
      mode: project.mode,
      createdAt: project.createdAt,
      segments: bundleSegments,
    });
  }

  if (bundleDrafts.length === 0) throw new Error('The selected drafts have no clips to export.');

  const manifest: PulseManifest = {
    format: PULSE_FORMAT,
    version: PULSE_VERSION,
    exportedAt: now,
    drafts: bundleDrafts,
  };
  files[MANIFEST_NAME] = strToU8(JSON.stringify(manifest));

  // STORE (level 0): the clips are already H.264 — recompressing would burn CPU for nothing.
  const zipped = zipSync(files, { level: 0 });

  const fileName =
    bundleDrafts.length === 1
      ? `pulse-draft-${safeName(singleExportName)}-${now}.pulse`
      : `pulse-backup-${now}.pulse`;

  const dir = new Directory(Paths.cache, EXPORT_DIRNAME);
  if (dir.exists) dir.delete(); // clear stale exports so the cache doesn't grow unbounded
  dir.create({ intermediates: true });
  const out = new File(dir, fileName);
  out.write(zipped);
  return out.uri;
}
