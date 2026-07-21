import { Directory, File, Paths } from 'expo-file-system';

// Clips live under the document directory (safe from system eviction). The DB stores
// relative paths only; we absolutize at runtime so the sandbox container can change
// between launches without invalidating references (§2.2).
//   drafts/{draftId}/segments/{segmentId}.mp4               — pristine original
//   drafts/{draftId}/segments/{segmentId}.edited.{rev}.mp4  — re-encoded editor output

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

/**
 * The edited (RNVT output) file's relative path — coexists with the pristine original. Each
 * edit gets a fresh revision stamp so the path (and thus every path-derived cache key: the
 * segment signature, the expo-video source URI, the expo-image cover URI) changes whenever the
 * content changes. Reusing one fixed path would leave those caches serving the previous edit.
 */
export function editedSegmentRelPath(draftId: string, segmentId: string, rev: number): string {
  return `drafts/${draftId}/segments/${segmentId}.edited.${rev}.mp4`;
}

/** The pristine clip's persisted jpeg thumbnail (relative path). */
export function thumbRelPath(draftId: string, segmentId: string): string {
  return `drafts/${draftId}/segments/${segmentId}.thumb.jpg`;
}

/**
 * The edited clip's persisted jpeg thumbnail (relative path), derived from the edited file's
 * own path (`….mp4` → `….thumb.jpg`). Pairing the thumb to the exact edited revision keeps the
 * rendered URI distinct across edits — otherwise expo-image would serve a stale frame from its
 * cache for an identical URI. Deriving (instead of rebuilding from ids) also resolves the thumb
 * for rows created before revision stamps existed.
 */
export function editedThumbRelPath(editedRelPath: string): string {
  return editedRelPath.replace(/\.mp4$/, '.thumb.jpg');
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
function editedSegmentDest(draftId: string, segmentId: string, rev: number): File {
  return new File(segmentsDir(draftId), `${segmentId}.edited.${rev}.mp4`);
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
 * Move an RNVT editor output (in app cache/files) into the draft's segments dir as a fresh
 * `.edited.{rev}.mp4` revision; returns its relative path (§ destructive trim). The prior
 * edit (if any) stays on disk untouched — `setEdited` deletes it only after the segment row
 * points at the new file, so a failed move never strands the row on a deleted file.
 */
export async function importTrimmedFile(
  srcUri: string,
  draftId: string,
  segmentId: string,
): Promise<string> {
  const rev = Date.now();
  await new File(srcUri).move(editedSegmentDest(draftId, segmentId, rev));
  return editedSegmentRelPath(draftId, segmentId, rev);
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
  const rev = Date.now();
  editedSegmentDest(draftId, segmentId, rev).write(bytes);
  return editedSegmentRelPath(draftId, segmentId, rev);
}
