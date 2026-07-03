import { describe, expect, it } from '@jest/globals';

import {
  decodeCapabilityClaims,
  EXPIRY_BUFFER_MS,
  formatExpiry,
  isClaimsExpired,
  isTokenExpired,
} from './capability-token';

// Mirrors `issueCapabilityToken` in pulsevault-mieweb/src/lib/capability-token.ts without
// pulling in the submodule (no signature needed — decode never verifies it).
function fakeToken(claims: Record<string, unknown>): string {
  const payload = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url');
  return `${payload}.fake-signature`;
}

const VALID_CLAIMS = {
  artifactId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  iat: 1_700_000_000,
  exp: 1_700_001_800,
  kid: '2026-06',
  issuer: 'https://vault.example.org',
};

describe('decodeCapabilityClaims', () => {
  it('decodes a well-formed token', () => {
    expect(decodeCapabilityClaims(fakeToken(VALID_CLAIMS))).toEqual(VALID_CLAIMS);
  });

  it('returns null for a token with no dot separator', () => {
    expect(decodeCapabilityClaims('not-a-token')).toBeNull();
  });

  it('returns null for a payload that is not valid base64url', () => {
    expect(decodeCapabilityClaims('!!!.sig')).toBeNull();
  });

  it('returns null for a payload that is not valid JSON', () => {
    const payload = Buffer.from('not json', 'utf8').toString('base64url');
    expect(decodeCapabilityClaims(`${payload}.sig`)).toBeNull();
  });

  it('returns null when required claims are missing', () => {
    expect(decodeCapabilityClaims(fakeToken({ artifactId: VALID_CLAIMS.artifactId }))).toBeNull();
  });

  it('returns null for an opaque token from a different server implementation', () => {
    expect(decodeCapabilityClaims('sk_live_abcdef1234567890')).toBeNull();
  });
});

describe('isClaimsExpired', () => {
  it('is false well before expiry', () => {
    expect(isClaimsExpired(VALID_CLAIMS, 10_000, VALID_CLAIMS.exp * 1000 - 60_000)).toBe(false);
  });

  it('is true once past expiry', () => {
    expect(isClaimsExpired(VALID_CLAIMS, 10_000, VALID_CLAIMS.exp * 1000 + 1)).toBe(true);
  });

  it('is true inside the safety buffer even though exp has not technically passed', () => {
    expect(isClaimsExpired(VALID_CLAIMS, 10_000, VALID_CLAIMS.exp * 1000 - 5_000)).toBe(true);
  });
});

describe('isTokenExpired', () => {
  const expMs = VALID_CLAIMS.exp * 1000;

  it('treats a null token as not-expired (validity unknown)', () => {
    expect(isTokenExpired(null, expMs + 60_000)).toBe(false);
  });

  it('treats an opaque, undecodable token as not-expired', () => {
    expect(isTokenExpired('sk_live_abcdef1234567890', expMs + 60_000)).toBe(false);
  });

  it('is false well before expiry and true past it (with buffer)', () => {
    const token = fakeToken(VALID_CLAIMS);
    expect(isTokenExpired(token, expMs - 60_000)).toBe(false);
    expect(isTokenExpired(token, expMs - EXPIRY_BUFFER_MS + 1)).toBe(true);
  });
});

describe('formatExpiry', () => {
  const expMs = VALID_CLAIMS.exp * 1000;

  it('is "No expiry" for a tokenless or opaque destination', () => {
    expect(formatExpiry(null, expMs)).toBe('No expiry');
    expect(formatExpiry('sk_live_opaque', expMs)).toBe('No expiry');
  });

  it('is "Expired" once past exp (accounting for the buffer)', () => {
    expect(formatExpiry(fakeToken(VALID_CLAIMS), expMs)).toBe('Expired');
  });

  it('counts down in minutes then seconds', () => {
    const token = fakeToken(VALID_CLAIMS);
    // 5 min out, minus the 10s buffer → "Expires in 4m".
    expect(formatExpiry(token, expMs - 5 * 60_000)).toBe('Expires in 4m');
    // 20s out, minus the 10s buffer → "Expires in 10s".
    expect(formatExpiry(token, expMs - 20_000)).toBe('Expires in 10s');
  });
});
