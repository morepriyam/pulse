import { Directory, File, Paths } from 'expo-file-system';

// Clips live under the document directory (safe from system eviction). The DB stores
// relative paths only; we absolutize at runtime so the sandbox container can change
// between launches without invalidating references (§2.2).
//   drafts/{draftId}/segments/{segmentId}.mp4

export function segmentRelPath(draftId: string, segmentId: string): string {
  return `drafts/${draftId}/segments/${segmentId}.mp4`;
}

export function absolutize(relPath: string): string {
  return new File(Paths.document, ...relPath.split('/')).uri;
}

/** The on-disk segment file for a draft, creating the segments dir if needed. */
function segmentDest(draftId: string, segmentId: string): File {
  const dir = new Directory(Paths.document, 'drafts', draftId, 'segments');
  dir.create({ intermediates: true, idempotent: true });
  return new File(dir, `${segmentId}.mp4`);
}

/** Move a recorded clip out of the cache into the draft's segments dir; returns its relative path. */
export async function persistRecording(
  cacheUri: string,
  draftId: string,
  segmentId: string,
): Promise<string> {
  await new File(cacheUri).move(segmentDest(draftId, segmentId));
  return segmentRelPath(draftId, segmentId);
}

/**
 * Copy an external file (e.g. a bundled `expo-asset` clip) into the draft's segments dir,
 * leaving the source untouched; returns its relative path. Used by the dev seed (§1.0b).
 */
export async function copyIntoSegments(
  srcUri: string,
  draftId: string,
  segmentId: string,
): Promise<string> {
  const dest = segmentDest(draftId, segmentId);
  if (dest.exists) dest.delete();
  await new File(srcUri).copy(dest);
  return segmentRelPath(draftId, segmentId);
}

/** Delete a clip file. Caller must ensure no other segment references it (splits can share a file). */
export function deleteSegmentFile(relPath: string): void {
  const file = new File(absolutize(relPath));
  if (file.exists) file.delete();
}

export function deleteDraftDir(draftId: string): void {
  const dir = new Directory(Paths.document, 'drafts', draftId);
  if (dir.exists) dir.delete();
}
