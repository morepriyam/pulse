import { eq } from 'drizzle-orm';

import { db } from './client';
import { settings } from './schema';
import {
  deletePendingPairingToken,
  getPendingPairingToken,
  setPendingPairingToken,
} from './secure-token';

/**
 * A server pairing the device has connected to but no draft has claimed yet
 * (§ deep-link pairing). Global, not per-draft — unlike `projects.upload*`
 * (drafts.ts), this lives independently of any one draft so the user can
 * pick *which* draft to send (a new recording or any existing one) after
 * connecting, instead of being forced to choose during pairing. Single-use:
 * claiming it (`setUploadDestination` on a draft) clears it here too.
 */
const PENDING_PAIRING_KEY = 'upload.pendingPairing';

export type PendingPairing = {
  server: string;
  token: string | null;
  artifactId: string;
  uploadUnit: 'beat' | 'merged';
};

/** The non-secret portion of a `PendingPairing`, persisted as JSON in `settings`. The token
 * (a live bearer credential) lives in expo-secure-store instead — see `secure-token.ts`. */
export type PendingPairingMeta = Omit<PendingPairing, 'token'>;

/** Live-queryable row holding the pending pairing's JSON, if any. */
export const pendingPairingQuery = db
  .select({ value: settings.value })
  .from(settings)
  .where(eq(settings.key, PENDING_PAIRING_KEY));

/** Parses a `pendingPairingQuery` row's raw value; `null` for missing/corrupt data. */
export function parsePendingPairing(raw: string | null | undefined): PendingPairingMeta | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PendingPairingMeta>;
    if (
      typeof parsed.server !== 'string' ||
      typeof parsed.artifactId !== 'string' ||
      (parsed.uploadUnit !== 'beat' && parsed.uploadUnit !== 'merged')
    ) {
      return null;
    }
    return {
      server: parsed.server,
      artifactId: parsed.artifactId,
      uploadUnit: parsed.uploadUnit,
    };
  } catch {
    return null;
  }
}

export async function getPendingPairing(): Promise<PendingPairing | null> {
  const rows = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, PENDING_PAIRING_KEY));
  const meta = parsePendingPairing(rows[0]?.value);
  if (!meta) return null;
  return { ...meta, token: await getPendingPairingToken() };
}

export async function setPendingPairing(pairing: PendingPairing): Promise<void> {
  const meta: PendingPairingMeta = {
    server: pairing.server,
    artifactId: pairing.artifactId,
    uploadUnit: pairing.uploadUnit,
  };
  await db
    .insert(settings)
    .values({ key: PENDING_PAIRING_KEY, value: JSON.stringify(meta) })
    .onConflictDoUpdate({ target: settings.key, set: { value: JSON.stringify(meta) } });
  await setPendingPairingToken(pairing.token);
}

export async function clearPendingPairing(): Promise<void> {
  await db.delete(settings).where(eq(settings.key, PENDING_PAIRING_KEY));
  await deletePendingPairingToken();
}
