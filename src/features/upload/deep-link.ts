// Bump when the pulsecam:// link shape changes incompatibly — a client that
// doesn't recognize `v` refuses the link outright instead of misparsing it.
const SUPPORTED_LINK_VERSION = '1';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type UploadDeepLink = {
  artifactId: string;
  /**
   * The full base URL to upload to — origin *plus* whatever path prefix the
   * operator mounted `pulsevault` at (e.g. `https://vault.example.org/pulsevault`),
   * not just the bare origin. Every route is `${server}/<path>` (`/capabilities`,
   * `/upload`, `/artifacts/:id`) — there is no separate "prefix" concept on the
   * client side, the server value already includes it.
   */
  server: string;
  token: string | null;
  /**
   * Per-session override of the deployment-wide value from `GET
   * /capabilities` (PROTOCOL.md §3, §8). `null` means the link didn't carry
   * one — fall back to `/capabilities` exactly as before this field existed.
   */
  uploadUnit: 'beat' | 'merged' | null;
};

export type DeepLinkResult =
  | { ok: true; link: UploadDeepLink }
  | { ok: false; reason: 'unsupported-version' | 'invalid-link' };

/**
 * Private/dev origins allowed over plain http — never extended beyond
 * non-globally-routable address space (RFC 1918 private ranges, RFC 6598
 * carrier-grade-NAT shared space used by some mesh routers/ISP setups, and
 * link-local) plus loopback/localhost. Never extended to a public IP or
 * domain just because it "looks internal."
 */
function isPrivateDevOrigin(url: URL): boolean {
  if (url.protocol !== 'http:') return false;
  const host = url.hostname;
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    /^10\.\d+\.\d+\.\d+$/.test(host) ||
    /^192\.168\.\d+\.\d+$/.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(host) ||
    /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+$/.test(host) || // RFC 6598, 100.64.0.0/10
    /^169\.254\.\d+\.\d+$/.test(host) // link-local
  );
}

/**
 * Parse and validate a `pulsecam://` upload pairing link. Rejects anything
 * the app can't safely act on — an unrecognized version, a malformed
 * artifactId, or a server origin that isn't HTTPS (except the explicit
 * localhost/private-IP dev allowance) — rather than guessing.
 */
export function parseUploadDeepLink(url: string): DeepLinkResult {
  if (!url.startsWith('pulsecam://')) return { ok: false, reason: 'invalid-link' };

  // Parsed by hand (not via expo-linking) so this stays a dependency-free pure
  // function — `pulsecam://` is a custom scheme, but everything after `?` is
  // an ordinary query string `URLSearchParams` handles regardless of scheme.
  const queryIndex = url.indexOf('?');
  const params = new URLSearchParams(queryIndex >= 0 ? url.slice(queryIndex + 1) : '');
  const param = (key: string): string | null => params.get(key);

  if (param('v') !== SUPPORTED_LINK_VERSION) {
    return { ok: false, reason: 'unsupported-version' };
  }

  const artifactId = param('artifactId');
  if (!artifactId || !UUID_REGEX.test(artifactId)) {
    return { ok: false, reason: 'invalid-link' };
  }

  const rawServer = param('server');
  if (!rawServer) return { ok: false, reason: 'invalid-link' };
  let parsedServer: URL;
  try {
    parsedServer = new URL(rawServer);
  } catch {
    return { ok: false, reason: 'invalid-link' };
  }
  if (parsedServer.protocol !== 'https:' && !isPrivateDevOrigin(parsedServer)) {
    return { ok: false, reason: 'invalid-link' };
  }
  // Keep the full base URL (origin + path prefix), trailing slash stripped —
  // collapsing to just `.origin` would silently drop the prefix the operator
  // mounted pulsevault at, breaking every subsequent request.
  const server = rawServer.replace(/\/$/, '');

  // Optional — absent on a link from an operator/server predating this field. Present but not
  // one of the two known values means a corrupt/forged link, same treatment as a bad artifactId.
  const rawUploadUnit = param('uploadUnit');
  if (rawUploadUnit !== null && rawUploadUnit !== 'beat' && rawUploadUnit !== 'merged') {
    return { ok: false, reason: 'invalid-link' };
  }

  return { ok: true, link: { artifactId, server, token: param('token'), uploadUnit: rawUploadUnit } };
}
