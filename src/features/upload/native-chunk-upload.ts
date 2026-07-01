import { Directory, File, FileMode, Paths, UploadType } from 'expo-file-system';

import type { UploadRemainder } from './tus-client';

function randomId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * When resuming a partial upload (`offset > 0`), streams just the remainder
 * (from `offset` to EOF) into a temp file via `FileHandle` (seek + bounded
 * read, never re-reading the bytes already uploaded) so the native upload
 * task has a file to point at. When starting from byte 0 — the common case —
 * uploads `source` directly with no copy at all.
 */
function prepareUploadSource(
  source: File,
  offset: number,
  totalBytes: number,
): { file: File; cleanup: () => void } {
  if (offset <= 0) return { file: source, cleanup: () => {} };

  const dir = new Directory(Paths.cache, 'tus-resume');
  dir.create({ intermediates: true, idempotent: true });
  const temp = new File(dir, `${randomId()}.bin`);
  if (temp.exists) temp.delete();

  const reader = source.open(FileMode.ReadOnly);
  try {
    reader.offset = offset;
    const remainder = reader.readBytes(totalBytes - offset);
    temp.write(remainder);
  } finally {
    reader.close();
  }
  return { file: temp, cleanup: () => { if (temp.exists) temp.delete(); } };
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
  const { file: source, cleanup } = prepareUploadSource(file, offset, totalBytes);
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
