import { Directory, File, Paths } from 'expo-file-system';

// Clips live under the document directory (safe from system eviction). The DB stores
// relative paths only; we absolutize at runtime so the sandbox container can change
// between launches without invalidating references (§2.2).
//   drafts/{draftId}/segments/{segmentId}.mp4         — pristine original
//   drafts/{draftId}/segments/{segmentId}.edited.mp4  — re-encoded editor output

/**
 * Normalize a bare filesystem path to a `file://` URI. `merge()` / `getFrameAt` / the camera hand
 * back bare paths, but expo's `File`, expo-video, whisper, sharing, etc. all want a URI. A value
 * that already has a scheme is returned unchanged.
 */
export const toFileUri = (path: string): string =>
  path.startsWith('/') ? `file://${path}` : path;

export function segmentRelPath(draftId: string, segmentId: string): string {
  return `drafts/${draftId}/segments/${segmentId}.mp4`;
}

/** The edited (RNVT output) file's relative path — coexists with the pristine original. */
export function editedSegmentRelPath(draftId: string, segmentId: string): string {
  return `drafts/${draftId}/segments/${segmentId}.edited.mp4`;
}

/** The pristine clip's persisted jpeg thumbnail (relative path). */
export function thumbRelPath(draftId: string, segmentId: string): string {
  return `drafts/${draftId}/segments/${segmentId}.thumb.jpg`;
}

/**
 * The edited clip's persisted jpeg thumbnail (relative path). A *distinct* path from the
 * original's so the rendered URI changes when the cover changes — otherwise expo-image would
 * serve the stale pre-edit frame from its cache for an identical URI.
 */
export function editedThumbRelPath(draftId: string, segmentId: string): string {
  return `drafts/${draftId}/segments/${segmentId}.edited.thumb.jpg`;
}

export function absolutize(relPath: string): string {
  return new File(Paths.document, ...relPath.split('/')).uri;
}

/** The draft's segments dir, creating it (and any missing parents) if needed. */
function segmentsDir(draftId: string): Directory {
  const dir = new Directory(Paths.document, 'drafts', draftId, 'segments');
  dir.create({ intermediates: true, idempotent: true });
  return dir;
}

/** The on-disk pristine segment file for a draft, creating the segments dir if needed. */
function segmentDest(draftId: string, segmentId: string): File {
  return new File(segmentsDir(draftId), `${segmentId}.mp4`);
}

/** The on-disk edited segment file for a draft, creating the segments dir if needed. */
function editedSegmentDest(draftId: string, segmentId: string): File {
  return new File(segmentsDir(draftId), `${segmentId}.edited.mp4`);
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

/**
 * Move an RNVT editor output (in app cache/files) into the draft's segments dir as the
 * segment's `.edited.mp4`, replacing any prior edit; returns its relative path (§ destructive trim).
 */
export async function importTrimmedFile(
  srcUri: string,
  draftId: string,
  segmentId: string,
): Promise<string> {
  const dest = editedSegmentDest(draftId, segmentId);
  if (dest.exists) dest.delete();
  await new File(srcUri).move(dest);
  return editedSegmentRelPath(draftId, segmentId);
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

// Draft transfer (.pulse export/import) ----------------------------------------------------

/** Read a relative clip path's raw bytes, or null if the file is missing on disk. */
export async function readRelBytes(relPath: string): Promise<Uint8Array | null> {
  const file = new File(absolutize(relPath));
  if (!file.exists) return null;
  return file.bytes();
}

/** Write an imported clip's bytes as the draft's pristine original; returns its relative path. */
export function writeOriginalBytes(draftId: string, segmentId: string, bytes: Uint8Array): string {
  segmentDest(draftId, segmentId).write(bytes);
  return segmentRelPath(draftId, segmentId);
}

/** Write an imported clip's edited (re-encoded) bytes alongside its original; returns its rel path. */
export function writeEditedBytes(draftId: string, segmentId: string, bytes: Uint8Array): string {
  editedSegmentDest(draftId, segmentId).write(bytes);
  return editedSegmentRelPath(draftId, segmentId);
}
