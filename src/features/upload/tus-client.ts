import type { File } from 'expo-file-system';

const MAX_RETRY_ATTEMPTS = 5;
const RETRY_BASE_DELAY_MS = 500;
const TUS_VERSION = '1.0.0';

export type ArtifactKind = 'video' | 'project' | 'captions';

export type TusUploadProgress = { bytesSent: number; totalBytes: number };

/** Result of one PATCH attempt's byte-carrying request — status + response headers (any casing). */
export type RemainderUploadResult = { status: number; headers: Record<string, string> };

/**
 * Performs the byte-carrying PATCH for the remainder of `file` from `offset`
 * to EOF. This is a separate, injected concern (not implemented inline in
 * this module) because the real implementation needs `expo-file-system`'s
 * native upload task — see `./native-chunk-upload.ts` for why and how. This
 * module stays free of any React Native-specific import so it's unit
 * testable under this project's pure-logic jest config.
 */
export type UploadRemainder = (params: {
  resourceUrl: string;
  offset: number;
  totalBytes: number;
  file: File;
  headers: Record<string, string>;
  signal?: AbortSignal;
  onProgress?: (bytesSentThisAttempt: number) => void;
}) => Promise<RemainderUploadResult>;

export type TusUploadOptions = {
  /** Full base URL, including the operator's path prefix — e.g. `https://vault.example.org/pulsevault`. */
  server: string;
  token: string | null;
  artifactId: string;
  filename: string;
  kind: ArtifactKind;
  /** UUID of another artifact this one belongs to (e.g. a video's captions). */
  relatedTo?: string;
  /** `<algorithm>:<hex digest>` of the finished file, verified by the server if it supports checksums. */
  checksum?: string;
  file: File;
  /** A previously-created upload's resource URL, to resume instead of creating a new one. */
  resourceUrl?: string | null;
  /**
   * Called as soon as the resource URL is known — immediately if resuming, or right after
   * the initial `POST` otherwise — so a caller can track "what's actually in flight right
   * now" (e.g. for `cancel()`) without waiting for the whole upload to finish.
   */
  onResourceCreated?: (resourceUrl: string) => void;
  signal?: AbortSignal;
  onProgress?: (progress: TusUploadProgress) => void;
  /** Dependency-injected for testing; defaults to the global `fetch`. Only used for the headers-only requests (create/HEAD/DELETE) — never for the byte-carrying PATCH, see `uploadRemainder`. */
  fetchImpl?: typeof fetch;
  /** Performs the actual byte-carrying PATCH. Required — pass `uploadRemainderNative` from `./native-chunk-upload` at the real call site; tests inject a fake. */
  uploadRemainder: UploadRemainder;
  /**
   * Called before each network attempt; should resolve once it's safe to
   * proceed. Defaults to always-proceed-immediately — this module has no
   * `react-native` import of its own (keeps it testable under this
   * project's pure-logic jest config), so pass `waitUntilAppForeground`
   * from `./app-state-gate` at the call site for real background-pause
   * behavior.
   */
  waitUntilForeground?: (signal?: AbortSignal) => Promise<void>;
};

export type TusUploadResult = { resourceUrl: string };

/**
 * Thrown by `uploadViaTus`. `retryable` distinguishes a transient failure
 * (network drop, 5xx — safe to retry) from a terminal one (403/422 — retrying
 * without changing anything won't help), so callers can show the right UI.
 */
export class TusUploadError extends Error {
  readonly retryable: boolean;
  readonly statusCode?: number;
  constructor(message: string, opts: { retryable: boolean; statusCode?: number }) {
    super(message);
    this.name = 'TusUploadError';
    this.retryable = opts.retryable;
    this.statusCode = opts.statusCode;
  }
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}

function base64Encode(value: string): string {
  // btoa is available in Hermes for ASCII-safe strings (UUIDs, filenames, our
  // own fixed kind enum) — no need for a Buffer/Unicode-safe encoder here.
  return btoa(value);
}

function buildUploadMetadata(opts: {
  artifactId: string;
  filename: string;
  kind: ArtifactKind;
  relatedTo?: string;
  checksum?: string;
}): string {
  const parts = [
    `artifactId ${base64Encode(opts.artifactId)}`,
    `filename ${base64Encode(opts.filename)}`,
    `kind ${base64Encode(opts.kind)}`,
  ];
  if (opts.relatedTo) parts.push(`relatedTo ${base64Encode(opts.relatedTo)}`);
  if (opts.checksum) parts.push(`checksum ${base64Encode(opts.checksum)}`);
  return parts.join(',');
}

function authHeaders(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort);
  });
}

/** Retries `fn` with exponential backoff + jitter, but only for transient failures — a terminal `TusUploadError` is rethrown immediately. */
async function withRetry<T>(
  fn: () => Promise<T>,
  signal: AbortSignal | undefined,
  waitUntilForeground: (signal?: AbortSignal) => Promise<void>,
): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      await waitUntilForeground(signal);
      return await fn();
    } catch (err) {
      if (isAbortError(err)) throw err;
      if (err instanceof TusUploadError && !err.retryable) throw err;
      attempt += 1;
      if (attempt >= MAX_RETRY_ATTEMPTS) throw err;
      const backoff = RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
      const jitter = Math.random() * backoff * 0.5;
      await sleep(backoff + jitter, signal);
    }
  }
}

async function statusError(res: Response, fallbackMessage: string): Promise<TusUploadError> {
  let message = fallbackMessage;
  try {
    const body = (await res.json()) as { error?: string };
    if (body?.error) message = body.error;
  } catch {
    // Non-JSON error body — keep the fallback message.
  }
  // 4xx (except a transient 429) is the server telling us this exact request
  // is wrong — retrying unchanged won't help. Everything else (5xx, network)
  // is worth retrying.
  const retryable = res.status >= 500 || res.status === 429;
  return new TusUploadError(message, { retryable, statusCode: res.status });
}

function statusErrorFromRemainder(result: RemainderUploadResult, fallbackMessage: string): TusUploadError {
  const retryable = result.status >= 500 || result.status === 429;
  return new TusUploadError(fallbackMessage, { retryable, statusCode: result.status });
}

/**
 * Resolves the server's `Location` response header against the paired
 * server's base URL, then requires the result to stay on that same origin.
 * Without this check, a malicious or compromised paired server could return
 * an absolute `Location` pointing at a different host, and every subsequent
 * `HEAD`/`PATCH`/`DELETE` — each carrying `Authorization: Bearer <token>` —
 * would leak the capability token to that host instead of the paired server.
 */
function resolveLocation(location: string, base: string): string {
  const resolved = new URL(location, base);
  const baseOrigin = new URL(base).origin;
  if (resolved.origin !== baseOrigin) {
    throw new TusUploadError('Server returned an upload location on an unexpected origin', {
      retryable: false,
    });
  }
  return resolved.toString();
}

async function createUpload(
  opts: TusUploadOptions,
  fetchImpl: typeof fetch,
): Promise<string> {
  const res = await fetchImpl(`${opts.server}/upload`, {
    method: 'POST',
    signal: opts.signal,
    headers: {
      'Tus-Resumable': TUS_VERSION,
      'Upload-Length': String(opts.file.size ?? 0),
      'Upload-Metadata': buildUploadMetadata(opts),
      ...authHeaders(opts.token),
    },
  });
  if (res.status !== 201) throw await statusError(res, `Could not start the upload (${res.status})`);
  const location = res.headers.get('location');
  if (!location) throw new TusUploadError('Server did not return an upload location', { retryable: false });
  return resolveLocation(location, opts.server);
}

/** Always re-`HEAD`s rather than trusting a cached offset — the server may have restarted, or the upload may not have completed as far as last assumed. */
async function fetchOffset(
  resourceUrl: string,
  token: string | null,
  signal: AbortSignal | undefined,
  fetchImpl: typeof fetch,
): Promise<number> {
  const res = await fetchImpl(resourceUrl, {
    method: 'HEAD',
    signal,
    headers: { 'Tus-Resumable': TUS_VERSION, ...authHeaders(token) },
  });
  if (!res.ok) throw await statusError(res, `Could not resume the upload (${res.status})`);
  const offset = Number(res.headers.get('upload-offset'));
  if (!Number.isFinite(offset)) {
    throw new TusUploadError('Server did not return a valid Upload-Offset', { retryable: false });
  }
  return offset;
}

/**
 * Upload a file to a pulsevault-compatible server over TUS. The byte-carrying
 * PATCH is delegated to `opts.uploadRemainder` rather than sent via `fetch`
 * with a JS-constructed body: React Native's `fetch` silently base64-encodes
 * any `Uint8Array`/`ArrayBuffer` body, and even a `Blob` from
 * `expo-file-system`'s `File.slice()` doesn't avoid this — `slice()` itself
 * constructs that Blob from a `Uint8Array`, which React Native's `Blob`
 * implementation explicitly refuses ("Creating blobs from 'ArrayBuffer' and
 * 'ArrayBufferView' are not supported"). The real implementation
 * (`uploadRemainderNative`) instead uses `expo-file-system`'s own native
 * upload task, which streams bytes via the platform's URLSession/OkHttp APIs
 * and never goes through that bridge at all.
 *
 * One PATCH attempt per resume cycle (the remainder from the current offset
 * to EOF, not fixed-size chunks) — TUS clients generally recommend against
 * small fixed chunking unless forced to; resumability already comes from
 * `Upload-Offset`, not from how many requests one successful run takes. On
 * failure, the next attempt always re-`HEAD`s for the authoritative offset
 * before retrying, never trusting what the previous attempt assumed.
 */
export async function uploadViaTus(opts: TusUploadOptions): Promise<TusUploadResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const totalBytes = opts.file.size ?? 0;
  const waitUntilForeground = opts.waitUntilForeground ?? (() => Promise.resolve());

  const resourceUrl =
    opts.resourceUrl ??
    (await withRetry(() => createUpload(opts, fetchImpl), opts.signal, waitUntilForeground));
  opts.onResourceCreated?.(resourceUrl);

  // HEAD-then-upload-remainder is retried as ONE unit, not as two separately
  // retried steps — a retry after a transient failure MUST re-HEAD first to
  // learn the real offset (the previous attempt may have landed some bytes
  // before it failed); retrying with a stale offset would resend bytes the
  // server already has, which most TUS servers reject as a conflict.
  await withRetry(
    async () => {
      for (;;) {
        const offset = await fetchOffset(resourceUrl, opts.token, opts.signal, fetchImpl);
        opts.onProgress?.({ bytesSent: offset, totalBytes });
        if (offset >= totalBytes) return;

        const headers = {
          'Tus-Resumable': TUS_VERSION,
          'Upload-Offset': String(offset),
          'Content-Type': 'application/offset+octet-stream',
          ...authHeaders(opts.token),
        };
        const result = await opts.uploadRemainder({
          resourceUrl,
          offset,
          totalBytes,
          file: opts.file,
          headers,
          signal: opts.signal,
          onProgress: (sentThisAttempt) =>
            opts.onProgress?.({ bytesSent: offset + sentThisAttempt, totalBytes }),
        });
        if (result.status !== 204) {
          throw statusErrorFromRemainder(result, `Upload failed (${result.status})`);
        }
        // Loop back to HEAD again rather than trusting the PATCH response's
        // offset as "done" — keeps exactly one source of truth for progress.
      }
    },
    opts.signal,
    waitUntilForeground,
  );

  return { resourceUrl };
}

/** Cancels an in-flight upload server-side (TUS `DELETE`), freeing its reserved bytes. Distinct from aborting the local request — call this when the user explicitly gives up, not on a transient network drop. */
export async function cancelTusUpload(
  resourceUrl: string,
  token: string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  await fetchImpl(resourceUrl, {
    method: 'DELETE',
    headers: { 'Tus-Resumable': TUS_VERSION, ...authHeaders(token) },
  });
}
