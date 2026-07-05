import { describe, expect, it } from '@jest/globals';

import { parseUploadDeepLink } from './deep-link';

const ARTIFACT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('parseUploadDeepLink', () => {
  it('accepts a well-formed https link', () => {
    const result = parseUploadDeepLink(
      `pulsecam://?v=1&artifactId=${ARTIFACT_ID}&server=https%3A%2F%2Fvault.example.org&token=secret`,
    );
    expect(result).toEqual({
      ok: true,
      link: {
        artifactId: ARTIFACT_ID,
        server: 'https://vault.example.org',
        token: 'secret',
        uploadUnit: null,
      },
    });
  });

  it('accepts a link with no token', () => {
    const result = parseUploadDeepLink(
      `pulsecam://?v=1&artifactId=${ARTIFACT_ID}&server=https%3A%2F%2Fvault.example.org`,
    );
    expect(result).toEqual({
      ok: true,
      link: { artifactId: ARTIFACT_ID, server: 'https://vault.example.org', token: null, uploadUnit: null },
    });
  });

  it('rejects a link with the wrong scheme', () => {
    expect(parseUploadDeepLink('https://vault.example.org?v=1')).toEqual({
      ok: false,
      reason: 'invalid-link',
    });
  });

  it('rejects an unrecognized version', () => {
    const result = parseUploadDeepLink(
      `pulsecam://?v=99&artifactId=${ARTIFACT_ID}&server=https%3A%2F%2Fvault.example.org`,
    );
    expect(result).toEqual({ ok: false, reason: 'unsupported-version' });
  });

  it('rejects a missing or malformed artifactId', () => {
    expect(
      parseUploadDeepLink('pulsecam://?v=1&server=https%3A%2F%2Fvault.example.org'),
    ).toEqual({ ok: false, reason: 'invalid-link' });
    expect(
      parseUploadDeepLink('pulsecam://?v=1&artifactId=not-a-uuid&server=https%3A%2F%2Fvault.example.org'),
    ).toEqual({ ok: false, reason: 'invalid-link' });
  });

  it('rejects a plain-http origin that is not localhost or a private IP', () => {
    const result = parseUploadDeepLink(
      `pulsecam://?v=1&artifactId=${ARTIFACT_ID}&server=http%3A%2F%2Fvault.example.org`,
    );
    expect(result).toEqual({ ok: false, reason: 'invalid-link' });
  });

  it('accepts the http localhost/private-IP dev allowance', () => {
    for (const origin of [
      'http://localhost:3030',
      'http://127.0.0.1:3030',
      'http://192.168.1.50:3030',
      'http://10.0.0.5:3030',
      'http://172.20.0.5:3030',
      'http://100.70.33.184:3030', // RFC 6598 carrier-grade-NAT space — some mesh routers/ISPs use this for the LAN
      'http://169.254.1.1:3030',
    ]) {
      const result = parseUploadDeepLink(
        `pulsecam://?v=1&artifactId=${ARTIFACT_ID}&server=${encodeURIComponent(origin)}`,
      );
      expect(result.ok).toBe(true);
    }
  });

  it('preserves the server path prefix (not just the bare origin)', () => {
    const result = parseUploadDeepLink(
      `pulsecam://?v=1&artifactId=${ARTIFACT_ID}&server=${encodeURIComponent('https://vault.example.org/pulsevault/')}`,
    );
    expect(result).toEqual({
      ok: true,
      link: {
        artifactId: ARTIFACT_ID,
        server: 'https://vault.example.org/pulsevault',
        token: null,
        uploadUnit: null,
      },
    });
  });

  it('rejects an unparseable server value', () => {
    const result = parseUploadDeepLink(
      `pulsecam://?v=1&artifactId=${ARTIFACT_ID}&server=not-a-url`,
    );
    expect(result).toEqual({ ok: false, reason: 'invalid-link' });
  });

  it('accepts an explicit uploadUnit override, either value', () => {
    for (const uploadUnit of ['segment', 'merged']) {
      const result = parseUploadDeepLink(
        `pulsecam://?v=1&artifactId=${ARTIFACT_ID}&server=https%3A%2F%2Fvault.example.org&uploadUnit=${uploadUnit}`,
      );
      expect(result).toEqual({
        ok: true,
        link: {
          artifactId: ARTIFACT_ID,
          server: 'https://vault.example.org',
          token: null,
          uploadUnit,
        },
      });
    }
  });

  it('rejects an invalid uploadUnit value', () => {
    const result = parseUploadDeepLink(
      `pulsecam://?v=1&artifactId=${ARTIFACT_ID}&server=https%3A%2F%2Fvault.example.org&uploadUnit=bogus`,
    );
    expect(result).toEqual({ ok: false, reason: 'invalid-link' });
  });
});
