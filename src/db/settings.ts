import { eq } from 'drizzle-orm';
import type { CameraType } from 'expo-camera';

// Type-only import — erased at runtime, so this does NOT create a circular dependency
// with use-recorder.ts (which imports the value helpers below).
import type { StabilizationMode } from '@/features/recorder/use-recorder';

import { db } from './client';
import { settings } from './schema';

const SELECTED_MODEL_KEY = 'transcription.model';

/** Persisted recorder preferences (camera-wide, not per-draft). */
export const CAMERA_FACING_KEY = 'camera.facing';
export const CAMERA_STABILIZATION_KEY = 'camera.stabilization';
export const CAMERA_MUTED_KEY = 'camera.muted';

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

/** One-shot read of a single settings value (`null` if unset). */
export async function getSetting(key: string): Promise<string | null> {
  const rows = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, key));
  return rows[0]?.value ?? null;
}

/** Upsert a single settings value. */
export async function setSetting(key: string, value: string): Promise<void> {
  await db
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } });
}

export type RecorderPrefs = {
  facing: CameraType;
  stabilization: StabilizationMode;
  muted: boolean;
};

// Local validation list (kept in sync with STABILIZATION_MODES in use-recorder.ts) so we can
// reject corrupt/legacy stored values without a runtime import from the recorder module.
const STABILIZATION_VALUES: readonly StabilizationMode[] = ['off', 'standard', 'cinematic', 'auto'];

/** Read the persisted recorder preferences, falling back to defaults for missing/unexpected values. */
export async function getRecorderPrefs(): Promise<RecorderPrefs> {
  const [facing, stabilization, muted] = await Promise.all([
    getSetting(CAMERA_FACING_KEY),
    getSetting(CAMERA_STABILIZATION_KEY),
    getSetting(CAMERA_MUTED_KEY),
  ]);
  return {
    facing: facing === 'front' ? 'front' : 'back',
    stabilization: STABILIZATION_VALUES.includes(stabilization as StabilizationMode)
      ? (stabilization as StabilizationMode)
      : 'off',
    muted: muted === 'true',
  };
}
