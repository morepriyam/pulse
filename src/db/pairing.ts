import { eq } from 'drizzle-orm';

import { db } from './client';
import { settings } from './schema';

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

/** Live-queryable row holding the pending pairing's JSON, if any. */
export const pendingPairingQuery = db
  .select({ value: settings.value })
  .from(settings)
  .where(eq(settings.key, PENDING_PAIRING_KEY));

/** Parses a `pendingPairingQuery` row's raw value; `null` for missing/corrupt data. */
export function parsePendingPairing(raw: string | null | undefined): PendingPairing | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PendingPairing>;
    if (
      typeof parsed.server !== 'string' ||
      typeof parsed.artifactId !== 'string' ||
      (parsed.uploadUnit !== 'beat' && parsed.uploadUnit !== 'merged')
    ) {
      return null;
    }
    return {
      server: parsed.server,
      token: parsed.token ?? null,
      artifactId: parsed.artifactId,
      uploadUnit: parsed.uploadUnit,
    };
  } catch {
    return null;
  }
}

export async function getPendingPairing(): Promise<PendingPairing | null> {
  const rows = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, PENDING_PAIRING_KEY));
  return parsePendingPairing(rows[0]?.value);
}

export async function setPendingPairing(pairing: PendingPairing): Promise<void> {
  await db
    .insert(settings)
    .values({ key: PENDING_PAIRING_KEY, value: JSON.stringify(pairing) })
    .onConflictDoUpdate({ target: settings.key, set: { value: JSON.stringify(pairing) } });
}

export async function clearPendingPairing(): Promise<void> {
  await db.delete(settings).where(eq(settings.key, PENDING_PAIRING_KEY));
}
