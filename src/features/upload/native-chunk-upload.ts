import { Directory, File, FileMode, Paths, UploadType } from 'expo-file-system';

import type { UploadRemainder } from './tus-client';

function randomId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// Cache-relative scratch dirs the upload flow writes to. Both hold only
// per-session throwaway files: `tus-resume/` gets `prepareUploadSource`'s
// resume-remainder copies, `uploads/` gets `writeTempTextFile`'s VTT/beat-manifest
// artifacts. Both are regenerated from scratch on the next upload attempt.
const UPLOAD_SCRATCH_DIR_NAMES = ['tus-resume', 'uploads'] as const;

/**
 * Deletes any leftover files under the upload scratch dirs. Their temp files are
 * only cleaned up in `finally` blocks, which never run if the app process is
 * killed outright (not just an aborted upload) mid-upload — leaving duplicate,
 * unencrypted copies of potentially sensitive content (and, in `uploads/`, a
 * VTT/manifest per draft ever uploaded) sitting in app cache indefinitely.
 * Call once at app startup: anything found here by definition belongs to a
 * session that never got a chance to finish, and the next attempt always writes
 * fresh temp files anyway, so nothing here is needed after the process that
 * wrote it is gone.
 */
export function cleanupStaleUploadTempFiles(): void {
  for (const name of UPLOAD_SCRATCH_DIR_NAMES) {
    const dir = new Directory(Paths.cache, name);
    if (!dir.exists) continue;
    try {
      dir.delete();
    } catch {
      // Best-effort — a locked/missing file here just means it'll be retried
      // next launch, not a reason to fail app startup.
    }
  }
}

// Copy the resume remainder in fixed-size chunks so peak memory is bounded to
// one chunk, not the whole remainder. A resume near byte 0 of a multi-hundred-MB
// capture would otherwise buffer almost the entire file in JS at once.
const RESUME_COPY_CHUNK_BYTES = 8 * 1024 * 1024; // 8 MiB

/**
 * When resuming a partial upload (`offset > 0`), streams just the remainder
 * (from `offset` to EOF) into a temp file via `FileHandle` — seeking to
 * `offset` and copying forward in `RESUME_COPY_CHUNK_BYTES` chunks, never
 * re-reading the bytes already uploaded nor holding the whole remainder in
 * memory — so the native upload task has a file to point at. Yields to the
 * event loop between chunks (the reads/writes themselves are synchronous) so
 * copying a large remainder never freezes the UI for its whole duration. When
 * starting from byte 0 — the common case — uploads `source` directly with no
 * copy at all.
 */
async function prepareUploadSource(
  source: File,
  offset: number,
  totalBytes: number,
): Promise<{ file: File; cleanup: () => void }> {
  if (offset <= 0) return { file: source, cleanup: () => {} };

  const dir = new Directory(Paths.cache, 'tus-resume');
  dir.create({ intermediates: true, idempotent: true });
  const temp = new File(dir, `${randomId()}.bin`);
  temp.create();

  const reader = source.open(FileMode.ReadOnly);
  const writer = temp.open(FileMode.WriteOnly);
  try {
    reader.offset = offset;
    let remaining = totalBytes - offset;
    while (remaining > 0) {
      const chunk = reader.readBytes(Math.min(RESUME_COPY_CHUNK_BYTES, remaining));
      if (chunk.length === 0) break; // hit EOF earlier than expected — stop rather than spin
      writer.writeBytes(chunk);
      remaining -= chunk.length;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  } finally {
    reader.close();
    writer.close();
  }
  return {
    file: temp,
    cleanup: () => {
      if (temp.exists) temp.delete();
    },
  };
}

/**
 * Real `UploadRemainder` implementation for `tus-client.ts`. Uses
 * `expo-file-system`'s native upload task (`File.upload`, `httpMethod:
 * "PATCH"`, `uploadType: BINARY_CONTENT`), which streams bytes through the
 * platform's own URLSession (iOS) / OkHttp (Android) upload APIs — entirely
 * bypassing React Native's `fetch`/`Blob` bridge, which cannot carry a raw
 * byte body here (confirmed: RN's `Blob` constructor explicitly throws on
 * `ArrayBuffer`/`TypedArray` parts, and `expo-file-system`'s own
 * `File.slice()` happens to construct exactly that internally, so even the
 * "use a Blob from slice()" approach doesn't avoid this on React Native).
 *
 * KNOWN LIMITATION: unlike the `fetch`-based POST/HEAD/DELETE in
 * `tus-client.ts`, this PATCH has no `redirect: 'manual'` equivalent —
 * `expo-file-system`'s `UploadOptions` doesn't expose one, and neither
 * `FileSystemUploadTask.swift` nor its Android counterpart intercepts
 * redirects, so a 3xx here falls through to the platform default
 * (`URLSession`/`OkHttp` both follow automatically; Android's OkHttp also
 * resends `Authorization` unchanged to the redirect target). Closing this
 * would require patching `expo-file-system`'s native upload task, not just
 * this module. Accepted as a residual risk: it requires a compromised or
 * MITM'd paired server to trigger, matching the fetch layer before this fix.
 */
export const uploadRemainderNative: UploadRemainder = async ({
  resourceUrl,
  offset,
  totalBytes,
  file,
  headers,
  signal,
  onProgress,
}) => {
  const { file: source, cleanup } = await prepareUploadSource(file, offset, totalBytes);
  try {
    const result = await source.upload(resourceUrl, {
      httpMethod: 'PATCH',
      uploadType: UploadType.BINARY_CONTENT,
      headers,
      signal,
      onProgress: onProgress ? ({ bytesSent }) => onProgress(bytesSent) : undefined,
    });
    return { status: result.status, headers: result.headers };
  } finally {
    cleanup();
  }
};
