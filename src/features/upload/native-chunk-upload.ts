import { Directory, File, FileMode, Paths, UploadType } from 'expo-file-system';

import type { UploadChunk } from './tus-client';

function randomId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const TUS_RESUME_DIR_NAME = 'tus-resume';

/**
 * Deletes any leftover files under the cache dir's `tus-resume/` scratch
 * space. `prepareChunkSource`'s temp copy is only cleaned up in a `finally`
 * block, which never runs if the app process is killed outright (not just an
 * aborted upload) mid-resume — leaving a duplicate, unencrypted copy of
 * potentially sensitive video content sitting in app cache indefinitely.
 * Call once at app startup: any file found here by definition belongs to a
 * session that never got a chance to finish uploading, and the next resume
 * attempt always writes a fresh temp file from the current offset anyway, so
 * nothing here is ever needed after the process that wrote it is gone.
 */
export function cleanupStaleUploadTempFiles(): void {
  const dir = new Directory(Paths.cache, TUS_RESUME_DIR_NAME);
  if (!dir.exists) return;
  try {
    dir.delete();
  } catch {
    // Best-effort — a locked/missing file here just means it'll be retried
    // next launch, not a reason to fail app startup.
  }
}

/**
 * Bound on each `FileHandle.readBytes` while staging a resume/chunk temp copy.
 * Staging streams the range through this much memory at a time instead of
 * materializing the whole remainder as one buffer — the pre-existing behavior
 * this replaces read `totalBytes - offset` in ONE call, an allocation bounded
 * only by file size (the OOM half of #92).
 */
const STAGING_READ_BYTES = 8 * 1024 * 1024;

/**
 * Stages the bytes for one PATCH — `[offset, offset + chunkBytes)` — as a
 * file the native upload task can point at. The common case (a fresh upload,
 * offset 0, whole file in one PATCH) uploads `source` directly with no copy
 * at all. A resume (offset > 0) or an explicitly bounded chunk gets a temp
 * copy, streamed via `FileHandle` in `STAGING_READ_BYTES` reads so memory
 * stays bounded no matter how large the staged range is.
 */
function prepareChunkSource(
  source: File,
  offset: number,
  chunkBytes: number,
  totalBytes: number,
): { file: File; cleanup: () => void } {
  if (offset <= 0 && chunkBytes >= totalBytes) return { file: source, cleanup: () => {} };

  const dir = new Directory(Paths.cache, TUS_RESUME_DIR_NAME);
  dir.create({ intermediates: true, idempotent: true });
  const temp = new File(dir, `${randomId()}.bin`);
  if (temp.exists) temp.delete();
  // FileHandle open-for-writing requires an existing file on iOS
  // (FileHandle(forWritingTo:) does not create) — create it empty first.
  temp.create();

  const reader = source.open(FileMode.ReadOnly);
  const writer = temp.open(FileMode.WriteOnly);
  try {
    reader.offset = offset;
    let remaining = chunkBytes;
    while (remaining > 0) {
      const bytes = reader.readBytes(Math.min(STAGING_READ_BYTES, remaining));
      if (bytes.length === 0) break;
      writer.writeBytes(bytes);
      remaining -= bytes.length;
    }
  } finally {
    writer.close();
    reader.close();
  }
  return {
    file: temp,
    cleanup: () => {
      if (temp.exists) temp.delete();
    },
  };
}

/**
 * Real `UploadChunk` implementation for `tus-client.ts`: PATCHes one bounded
 * chunk. Uses `expo-file-system`'s native upload task (`File.upload`,
 * `httpMethod: "PATCH"`, `uploadType: BINARY_CONTENT`), which streams bytes
 * through the platform's own URLSession (iOS) / OkHttp (Android) upload
 * APIs — entirely bypassing React Native's `fetch`/`Blob` bridge, which
 * cannot carry a raw byte body here (confirmed: RN's `Blob` constructor
 * explicitly throws on `ArrayBuffer`/`TypedArray` parts, and
 * `expo-file-system`'s own `File.slice()` happens to construct exactly that
 * internally, so even the "use a Blob from slice()" approach doesn't avoid
 * this on React Native).
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
export const uploadChunkNative: UploadChunk = async ({
  resourceUrl,
  offset,
  chunkBytes,
  totalBytes,
  file,
  headers,
  signal,
  onProgress,
}) => {
  const { file: source, cleanup } = prepareChunkSource(file, offset, chunkBytes, totalBytes);
  try {
    const result = await source.upload(resourceUrl, {
      httpMethod: 'PATCH',
      uploadType: UploadType.BINARY_CONTENT,
      sessionType: 'background', //explicit
      headers,
      signal,
      // Native task ticks (URLSession/OkHttp didSendBodyData) — relative to
      // this PATCH's body, which is exactly the contract of the callback.
      onProgress: onProgress ? ({ bytesSent }) => onProgress(bytesSent) : undefined,
    });
    return { status: result.status, headers: result.headers };
  } finally {
    cleanup();
  }
};
