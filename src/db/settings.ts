import { eq } from 'drizzle-orm';

import { db } from './client';
import { settings } from './schema';

const SELECTED_MODEL_KEY = 'transcription.model';

/** Live-queryable: the selected transcription model id (a single settings row). */
export const selectedModelQuery = db
  .select({ value: settings.value })
  .from(settings)
  .where(eq(settings.key, SELECTED_MODEL_KEY));

/** Set (or clear, with `null`) the selected transcription model id. */
export async function setSelectedModel(id: string | null): Promise<void> {
  if (id === null) {
    await db.delete(settings).where(eq(settings.key, SELECTED_MODEL_KEY));
    return;
  }
  await db
    .insert(settings)
    .values({ key: SELECTED_MODEL_KEY, value: id })
    .onConflictDoUpdate({ target: settings.key, set: { value: id } });
}
