import { uploadChunkNative } from '../native-chunk-upload';
import { cancelTusUpload, uploadViaTus } from '../tus-client';
import type { UploadTransport } from '../types';

/**
 * The local-backend transport: uploads one artifact to a pulsevault-compatible
 * server over TUS. A thin adapter over the existing `uploadViaTus` (protocol,
 * always-chunked) + `uploadChunkNative` (the native byte-carrying PATCH) — no
 * protocol logic lives here, and neither of those files is touched.
 *
 * Historical note: the old export-screen hook passed `uploadViaTus` an AppState
 * gate (`waitUntilForeground`) that paused the retry loop whenever the app
 * backgrounded. The background manager governs background execution now (a
 * foreground service on Android; the native URLSession carrying the in-flight
 * PATCH on iOS), and the JS loop simply pauses when the runtime is suspended and
 * resumes on the AppState-active trigger — so the gate was removed entirely.
 */
export const tusServerTransport: UploadTransport = {
  run: ({ destination, artifact, signal, onProgress, onResourceCreated }) =>
    uploadViaTus({
      server: destination.server,
      token: destination.token,
      artifactId: artifact.artifactId,
      filename: artifact.filename,
      kind: artifact.kind,
      relatedTo: artifact.relatedTo,
      checksum: artifact.checksum,
      file: artifact.file,
      resourceUrl: artifact.resourceUrl,
      onResourceCreated,
      signal,
      uploadChunk: uploadChunkNative,
      onProgress,
    }),

  cancel: (resourceUrl, token) => cancelTusUpload(resourceUrl, token),
};
