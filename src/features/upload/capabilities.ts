// This app's own wire-protocol version — checked against the server's
// advertised [minSupportedVersion, maxSupportedVersion] range from
// /capabilities before pairing proceeds. Bump alongside any breaking change
// to how this app talks to a pulsevault-compatible server.
const APP_PROTOCOL_VERSION = 1;
const CAPABILITIES_TIMEOUT_MS = 8000;

export type Capabilities = {
  protocolVersion: number;
  minSupportedVersion: number;
  maxSupportedVersion: number;
  uploadUnit: 'segment' | 'merged';
};

type CapabilitiesRejectionReason = 'unreachable' | 'version-too-old' | 'version-too-new';

export type CapabilitiesResult =
  | { ok: true; capabilities: Capabilities }
  | { ok: false; reason: CapabilitiesRejectionReason };

async function fetchCapabilities(server: string): Promise<Capabilities> {
  const res = await fetch(`${server}/capabilities`, {
    signal: AbortSignal.timeout(CAPABILITIES_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Server responded with ${res.status}`);
  const body = (await res.json()) as Partial<Capabilities>;
  if (
    typeof body.minSupportedVersion !== 'number' ||
    typeof body.maxSupportedVersion !== 'number' ||
    (body.uploadUnit !== 'segment' && body.uploadUnit !== 'merged')
  ) {
    throw new Error('Server returned an unexpected /capabilities response');
  }
  return {
    protocolVersion: body.protocolVersion ?? body.minSupportedVersion,
    minSupportedVersion: body.minSupportedVersion,
    maxSupportedVersion: body.maxSupportedVersion,
    uploadUnit: body.uploadUnit,
  };
}

/** Fetches `/capabilities` and checks this app's protocol version against the server's supported range in one step. */
export async function checkCapabilities(server: string): Promise<CapabilitiesResult> {
  let capabilities: Capabilities;
  try {
    capabilities = await fetchCapabilities(server);
  } catch {
    return { ok: false, reason: 'unreachable' };
  }
  if (APP_PROTOCOL_VERSION < capabilities.minSupportedVersion) {
    return { ok: false, reason: 'version-too-old' };
  }
  if (APP_PROTOCOL_VERSION > capabilities.maxSupportedVersion) {
    return { ok: false, reason: 'version-too-new' };
  }
  return { ok: true, capabilities };
}

export const CAPABILITIES_REJECTION_MESSAGE: Record<CapabilitiesRejectionReason, string> = {
  unreachable: "Couldn't reach that server. Check the connection and try again.",
  'version-too-old': 'This server needs a newer version of Pulse. Update the app and try again.',
  'version-too-new': "This server hasn't been updated to work with this version of Pulse yet.",
};
