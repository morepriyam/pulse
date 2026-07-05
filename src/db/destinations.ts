import * as Crypto from 'expo-crypto';
import { desc, eq } from 'drizzle-orm';

import { db } from './client';
import { uploadDestinations } from './schema';
import {
  deleteDestinationToken,
  getDestinationToken,
  setDestinationToken,
} from './secure-token';

/**
 * A server the device has paired with (via a `pulsecam://` deep link) but no draft has
 * consumed yet. Device-wide, not per-draft — unlike `projects.upload*` (drafts.ts), this
 * lives independently of any one draft so the user can pick *which* draft to send, and to
 * *which* destination, at upload time. A destination is single-use: uploading a draft to it
 * (and the upload finishing), or the user deleting it, removes it here.
 */
export type PairedDestination = {
  server: string;
  token: string | null;
  artifactId: string;
  uploadUnit: 'segment' | 'merged';
};

/** The non-secret portion, persisted in the `upload_destinations` table. The token (a live
 * bearer credential) lives in expo-secure-store instead — see `secure-token.ts`. */
export type PairedDestinationMeta = Omit<PairedDestination, 'token'>;

/** Live-queryable pool of paired destinations, newest first. */
export const destinationsQuery = db
  .select({
    id: uploadDestinations.id,
    server: uploadDestinations.server,
    artifactId: uploadDestinations.artifactId,
    uploadUnit: uploadDestinations.uploadUnit,
    createdAt: uploadDestinations.createdAt,
  })
  .from(uploadDestinations)
  .orderBy(desc(uploadDestinations.createdAt));

/**
 * Add a paired destination to the pool. Deduped by `(server, artifactId)` — re-scanning the
 * same link (same server-minted artifact) refreshes that row's token/mode in place instead of
 * piling up duplicates. Returns the row id (existing or freshly minted).
 */
export async function addDestination(dest: PairedDestination): Promise<string> {
  const meta: PairedDestinationMeta = {
    server: dest.server,
    artifactId: dest.artifactId,
    uploadUnit: dest.uploadUnit,
  };
  const existing = await db
    .select({ id: uploadDestinations.id })
    .from(uploadDestinations)
    .where(eq(uploadDestinations.artifactId, dest.artifactId));
  const match = existing.find(() => true); // artifactId is server-unique in practice
  const id = match?.id ?? Crypto.randomUUID();
  if (match) {
    await db
      .update(uploadDestinations)
      .set({ server: meta.server, uploadUnit: meta.uploadUnit })
      .where(eq(uploadDestinations.id, id));
  } else {
    await db.insert(uploadDestinations).values({ id, ...meta });
  }
  await setDestinationToken(id, dest.token);
  return id;
}

/** Fetch one destination (row + secure-stored token); `null` if it's gone. */
export async function getDestination(id: string): Promise<PairedDestination | null> {
  const rows = await db
    .select({
      server: uploadDestinations.server,
      artifactId: uploadDestinations.artifactId,
      uploadUnit: uploadDestinations.uploadUnit,
    })
    .from(uploadDestinations)
    .where(eq(uploadDestinations.id, id));
  const row = rows[0];
  if (!row) return null;
  return { ...row, token: await getDestinationToken(id) };
}

/** Remove a destination from the pool (consumed by a finished upload, or deleted by the user). */
export async function deleteDestination(id: string): Promise<void> {
  await db.delete(uploadDestinations).where(eq(uploadDestinations.id, id));
  await deleteDestinationToken(id);
}
