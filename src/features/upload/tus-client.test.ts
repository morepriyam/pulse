import { describe, expect, it, jest } from '@jest/globals';

import { cancelTusUpload, TusUploadError, type UploadRemainder, uploadViaTus } from './tus-client';

const SERVER = 'https://vault.example.test/pulsevault';
const ARTIFACT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

/** Minimal stand-in for an expo-file-system `File` — only `.size` is read by tus-client (the actual bytes never flow through this module; see `uploadRemainder`). */
function fakeFile(size: number) {
  return { size };
}

type FetchCall = { url: string; init?: RequestInit };

/** Hand-rolled fetch stub: records calls, returns the next programmed response for each method. Only used for the headers-only requests (create/HEAD/DELETE) — the byte-carrying PATCH goes through `uploadRemainder` instead. */
function createFetchStub(responses: Partial<Record<string, Response[]>>) {
  const calls: FetchCall[] = [];
  const queues = new Map(Object.entries(responses).map(([k, v]) => [k, [...(v ?? [])]]));
  const fetchImpl = jest.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const method = init?.method ?? 'GET';
    const queue = queues.get(method);
    const next = queue?.shift();
    if (!next) throw new Error(`No stubbed response for ${method} ${url}`);
    return next;
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, calls };
}

type RemainderCall = { offset: number; totalBytes: number; headers: Record<string, string> };

/** Hand-rolled stand-in for the native upload task: records calls, returns the next programmed result. */
function createRemainderStub(results: { status: number; headers?: Record<string, string> }[]) {
  const calls: RemainderCall[] = [];
  const queue = [...results];
  const uploadRemainder: UploadRemainder = async ({ offset, totalBytes, headers }) => {
    calls.push({ offset, totalBytes, headers });
    const next = queue.shift();
    if (!next) throw new Error('No stubbed remainder result');
    return { status: next.status, headers: next.headers ?? {} };
  };
  return { uploadRemainder, calls };
}

const JSON_HEADERS: Record<string, string> = { 'content-type': 'application/json' };

describe('uploadViaTus', () => {
  it('creates, HEADs, uploads the remainder in one attempt, then confirms via a final HEAD', async () => {
    const file = fakeFile(20);
    const { fetchImpl, calls } = createFetchStub({
      POST: [new Response(null, { status: 201, headers: { location: '/pulsevault/upload/abc' } })],
      HEAD: [
        new Response(null, { status: 200, headers: { 'upload-offset': '0' } }),
        new Response(null, { status: 200, headers: { 'upload-offset': '20' } }),
      ],
    });
    const { uploadRemainder, calls: remainderCalls } = createRemainderStub([{ status: 204 }]);

    const progress: number[] = [];
    const result = await uploadViaTus({
      server: SERVER,
      token: 'tok',
      artifactId: ARTIFACT_ID,
      filename: 'clip.mp4',
      kind: 'video',
      file: file as never,
      fetchImpl,
      uploadRemainder,
      onProgress: ({ bytesSent }) => progress.push(bytesSent),
    });

    expect(result.resourceUrl).toBe('https://vault.example.test/pulsevault/upload/abc');
    expect(progress).toEqual([0, 20]);

    const createCall = calls.find((c) => c.init?.method === 'POST');
    const headers = createCall?.init?.headers as Record<string, string>;
    expect(headers['Tus-Resumable']).toBe('1.0.0');
    expect(headers['Upload-Length']).toBe('20');
    expect(headers.Authorization).toBe('Bearer tok');
    expect(headers['Upload-Metadata']).toContain(`artifactId ${btoa(ARTIFACT_ID)}`);
    expect(headers['Upload-Metadata']).toContain(`kind ${btoa('video')}`);

    expect(remainderCalls).toHaveLength(1);
    expect(remainderCalls[0].offset).toBe(0);
    expect(remainderCalls[0].totalBytes).toBe(20);
    expect(remainderCalls[0].headers['Upload-Offset']).toBe('0');
    expect(remainderCalls[0].headers.Authorization).toBe('Bearer tok');
  });

  it('resumes from a provided resourceUrl without creating a new upload, uploading only the remainder', async () => {
    const file = fakeFile(10);
    const { fetchImpl, calls } = createFetchStub({
      HEAD: [
        new Response(null, { status: 200, headers: { 'upload-offset': '5' } }),
        new Response(null, { status: 200, headers: { 'upload-offset': '10' } }),
      ],
    });
    const { uploadRemainder, calls: remainderCalls } = createRemainderStub([{ status: 204 }]);

    const result = await uploadViaTus({
      server: SERVER,
      token: null,
      artifactId: ARTIFACT_ID,
      filename: 'clip.mp4',
      kind: 'video',
      file: file as never,
      resourceUrl: `${SERVER}/upload/abc`,
      fetchImpl,
      uploadRemainder,
    });

    expect(result.resourceUrl).toBe(`${SERVER}/upload/abc`);
    expect(calls.some((c) => c.init?.method === 'POST')).toBe(false);
    expect(remainderCalls).toHaveLength(1);
    expect(remainderCalls[0].offset).toBe(5);
    expect(remainderCalls[0].headers['Upload-Offset']).toBe('5');
  });

  it('retries a transient (5xx) failure by re-HEADing and re-attempting from the fresh offset', async () => {
    const file = fakeFile(5);
    const { fetchImpl } = createFetchStub({
      POST: [new Response(null, { status: 201, headers: { location: '/pulsevault/upload/abc' } })],
      HEAD: [
        new Response(null, { status: 200, headers: { 'upload-offset': '0' } }),
        new Response(null, { status: 200, headers: { 'upload-offset': '0' } }),
        new Response(null, { status: 200, headers: { 'upload-offset': '5' } }),
      ],
    });
    const { uploadRemainder, calls: remainderCalls } = createRemainderStub([
      { status: 503, headers: JSON_HEADERS },
      { status: 204 },
    ]);

    const result = await uploadViaTus({
      server: SERVER,
      token: null,
      artifactId: ARTIFACT_ID,
      filename: 'clip.mp4',
      kind: 'video',
      file: file as never,
      fetchImpl,
      uploadRemainder,
    });
    expect(result.resourceUrl).toBe('https://vault.example.test/pulsevault/upload/abc');
    expect(remainderCalls).toHaveLength(2);
  });

  it('does not retry a terminal (4xx) failure', async () => {
    const file = fakeFile(5);
    const { fetchImpl } = createFetchStub({
      POST: [new Response(null, { status: 201, headers: { location: '/pulsevault/upload/abc' } })],
      HEAD: [new Response(null, { status: 200, headers: { 'upload-offset': '0' } })],
    });
    const { uploadRemainder } = createRemainderStub([{ status: 422 }]);

    await expect(
      uploadViaTus({
        server: SERVER,
        token: null,
        artifactId: ARTIFACT_ID,
        filename: 'clip.mp4',
        kind: 'video',
        file: file as never,
        fetchImpl,
        uploadRemainder,
      }),
    ).rejects.toMatchObject({ retryable: false, statusCode: 422 });
  });

  it('includes relatedTo and checksum in Upload-Metadata when provided', async () => {
    const file = fakeFile(1);
    const { fetchImpl, calls } = createFetchStub({
      POST: [new Response(null, { status: 201, headers: { location: '/pulsevault/upload/abc' } })],
      HEAD: [new Response(null, { status: 200, headers: { 'upload-offset': '1' } })],
    });
    const { uploadRemainder } = createRemainderStub([]);

    await uploadViaTus({
      server: SERVER,
      token: null,
      artifactId: ARTIFACT_ID,
      filename: 'clip.srt',
      kind: 'captions',
      relatedTo: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      checksum: 'sha256:deadbeef',
      file: file as never,
      fetchImpl,
      uploadRemainder,
    });

    const createCall = calls.find((c) => c.init?.method === 'POST');
    const metadata = (createCall?.init?.headers as Record<string, string>)['Upload-Metadata'];
    expect(metadata).toContain(`relatedTo ${btoa('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')}`);
    expect(metadata).toContain(`checksum ${btoa('sha256:deadbeef')}`);
  });

  it('rejects a Location header that redirects to a different origin than the paired server', async () => {
    // A malicious or compromised paired server could otherwise redirect every
    // subsequent HEAD/PATCH/DELETE (each carrying the bearer capability
    // token) to an attacker-controlled host by returning an absolute
    // Location on a different origin.
    const file = fakeFile(5);
    const { fetchImpl } = createFetchStub({
      POST: [new Response(null, { status: 201, headers: { location: 'https://evil.example/collect' } })],
    });
    const { uploadRemainder } = createRemainderStub([]);

    await expect(
      uploadViaTus({
        server: SERVER,
        token: 'tok',
        artifactId: ARTIFACT_ID,
        filename: 'clip.mp4',
        kind: 'video',
        file: file as never,
        fetchImpl,
        uploadRemainder,
      }),
    ).rejects.toBeInstanceOf(TusUploadError);
  });

  it('accepts a Location header that is same-origin but on a different path prefix', async () => {
    const file = fakeFile(5);
    const { fetchImpl } = createFetchStub({
      POST: [new Response(null, { status: 201, headers: { location: '/other-prefix/upload/abc' } })],
      HEAD: [new Response(null, { status: 200, headers: { 'upload-offset': '5' } })],
    });
    const { uploadRemainder } = createRemainderStub([]);

    const result = await uploadViaTus({
      server: SERVER,
      token: 'tok',
      artifactId: ARTIFACT_ID,
      filename: 'clip.mp4',
      kind: 'video',
      file: file as never,
      fetchImpl,
      uploadRemainder,
    });
    expect(result.resourceUrl).toBe('https://vault.example.test/other-prefix/upload/abc');
  });
});

describe('cancelTusUpload', () => {
  it('sends a DELETE with the bearer token', async () => {
    const { fetchImpl, calls } = createFetchStub({ DELETE: [new Response(null, { status: 204 })] });
    await cancelTusUpload(`${SERVER}/upload/abc`, 'tok', fetchImpl);
    expect(calls).toHaveLength(1);
    expect(calls[0].init?.method).toBe('DELETE');
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });
});
