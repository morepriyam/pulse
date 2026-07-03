// Best-effort, client-side read of a pulsevault capability token's claims —
// for UX only (showing "expires in 4m", hiding a dead upload button before
// the user taps into a guaranteed-403). The server is the only authority on
// validity; this never verifies the HMAC signature, just decodes the
// unencrypted payload segment, exactly like reading a JWT's claims without
// verifying it. A token that doesn't match `issueCapabilityToken`'s
// `<base64url-json>.<signature>` shape (any other Pulse-compatible server is
// free to use its own opaque scheme per the protocol) decodes to `null` —
// callers must treat that as "validity unknown", not "expired".

export type CapabilityClaims = {
  artifactId: string;
  iat: number;
  exp: number;
  kid: string;
  issuer: string;
};

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Decodes base64url to a byte string. Claims are JSON of UUIDs/URLs/numbers
 * (ASCII-only by construction in `issueCapabilityToken`), so a byte-for-byte
 * `String.fromCharCode` reconstruction is sufficient — no UTF-8 multibyte
 * handling needed for this specific payload shape.
 */
function base64UrlDecode(input: string): string | null {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  let buffer = 0;
  let bits = 0;
  let output = '';
  for (const char of normalized) {
    const value = BASE64_CHARS.indexOf(char);
    if (value === -1) return null;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }
  return output;
}

/** Returns `null` for an opaque/non-conforming token rather than throwing — see module doc. */
export function decodeCapabilityClaims(token: string): CapabilityClaims | null {
  const dot = token.indexOf('.');
  if (dot < 0) return null;
  const payload = base64UrlDecode(token.slice(0, dot));
  if (!payload) return null;
  let claims: Partial<CapabilityClaims>;
  try {
    claims = JSON.parse(payload);
  } catch {
    return null;
  }
  if (
    typeof claims.artifactId !== 'string' ||
    typeof claims.iat !== 'number' ||
    typeof claims.exp !== 'number' ||
    typeof claims.kid !== 'string' ||
    typeof claims.issuer !== 'string'
  ) {
    return null;
  }
  return claims as CapabilityClaims;
}

/**
 * Whether `claims.exp` has passed, with `bufferMs` of safety margin so we
 * stop offering an upload that would race the server's clock to a 403
 * rather than actually have time to send anything.
 */
export function isClaimsExpired(
  claims: CapabilityClaims,
  bufferMs: number,
  nowMs: number,
): boolean {
  return nowMs >= claims.exp * 1000 - bufferMs;
}

// Safety margin before a token's real `exp` so we never start a request that would land at the
// server just past expiry. Also the cadence a caller should re-check expiry on its own, so a
// button that's still valid disappears within this long of going stale.
export const EXPIRY_BUFFER_MS = 10_000;
export const EXPIRY_CHECK_INTERVAL_MS = 15_000;

/**
 * Best-effort expiry check for a bearer token. A `null` token or an opaquely-shaped one (a
 * non-pulsevault server whose scheme we can't read) means "validity unknown" — treated as
 * NOT expired, never blocking on what we can't decode. Only a token we *can* decode and that
 * has actually lapsed (with `EXPIRY_BUFFER_MS` margin) returns true.
 */
export function isTokenExpired(token: string | null, nowMs: number): boolean {
  if (!token) return false;
  const claims = decodeCapabilityClaims(token);
  if (!claims) return false;
  return isClaimsExpired(claims, EXPIRY_BUFFER_MS, nowMs);
}

/** Millisecond `exp` for a decodable token, else `null` (tokenless / opaque = no known expiry). */
export function expiresAtMs(token: string | null): number | null {
  if (!token) return null;
  const claims = decodeCapabilityClaims(token);
  return claims ? claims.exp * 1000 : null;
}

/**
 * Human label for a token's remaining validity, for the destination UI:
 * `"No expiry"` (tokenless / opaque), `"Expired"`, or `"Expires in Nm"` / `"Expires in Ns"`.
 */
export function formatExpiry(token: string | null, nowMs: number): string {
  const exp = expiresAtMs(token);
  if (exp === null) return 'No expiry';
  const remainingMs = exp - EXPIRY_BUFFER_MS - nowMs;
  if (remainingMs <= 0) return 'Expired';
  const minutes = Math.floor(remainingMs / 60_000);
  if (minutes >= 1) return `Expires in ${minutes}m`;
  return `Expires in ${Math.max(1, Math.ceil(remainingMs / 1000))}s`;
}
