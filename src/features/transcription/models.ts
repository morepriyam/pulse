// Catalog of on-device Whisper models the user can choose between. All are hosted on the
// whisper.cpp GGML repo. `approxBytes` is only for an initial progress estimate / a completeness
// floor — the real content length comes from the download task. English-only models (`.en`) are
// smaller/faster; large-v3-turbo is multilingual.
const BASE_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/';

export type WhisperModel = {
  id: string;
  label: string;
  /**
   * The underlying Whisper checkpoint name (e.g. `base.en`, `large-v3-turbo`), shown muted in the
   * picker so it's transparent which actual model — and quantization — the friendly label maps to.
   */
  name: string;
  filename: string;
  /** Approximate on-disk size, for the size label and a download-completeness floor. */
  approxBytes: number;
  /** Short tradeoff note shown in the picker. */
  note: string;
  /**
   * Decode language passed to Whisper. The `.en` models are English-only, so we pin `'en'`;
   * the multilingual model uses `'auto'` so it actually detects the spoken language instead of
   * being silently forced to English.
   */
  lang: 'en' | 'auto';
};

export const MODELS: WhisperModel[] = [
  {
    id: 'base.en',
    label: 'Base (English)',
    name: 'base.en · q5_1',
    filename: 'ggml-base.en-q5_1.bin',
    approxBytes: 57 * 1024 * 1024,
    note: 'Balanced · English only',
    lang: 'en',
  },
  {
    id: 'small.en-q5_1',
    label: 'Small (English)',
    name: 'small.en · q5_1',
    filename: 'ggml-small.en-q5_1.bin',
    approxBytes: 190 * 1024 * 1024,
    note: 'Most accurate · English only',
    lang: 'en',
  },
  {
    id: 'small-q5_1',
    label: 'Small (Multilingual)',
    name: 'small · q5_1',
    filename: 'ggml-small-q5_1.bin',
    approxBytes: 181 * 1024 * 1024,
    note: 'Any language · balanced',
    lang: 'auto',
  },
  {
    id: 'large-v3-turbo-q5_0',
    label: 'Large Turbo',
    name: 'large-v3-turbo · q5_0',
    filename: 'ggml-large-v3-turbo-q5_0.bin',
    approxBytes: 574 * 1024 * 1024,
    // Platform/device caveats are NOT baked in here — the picker appends `modelCaveat(...)`
    // (pure, fed by the expo-device profile at the UI layer) so this module stays free of
    // react-native imports for the pure-Node jest suite.
    note: 'Any language · best quality',
    lang: 'auto',
  },
];

/** Models at/above this on-disk size prompt for confirmation before downloading (cellular/data). */
export const LARGE_MODEL_BYTES = 300 * 1024 * 1024;

/**
 * Device RAM floor for the large model. Its q5_0 weights are ~574 MB and whisper.cpp's runtime
 * working set is a multiple of that — on phones under this floor (budget Androids, older
 * iPhones) inference is memory-starved: heavy swapping at best, an OOM kill at worst.
 */
export const LARGE_MODEL_MIN_MEMORY_BYTES = 4 * 1024 * 1024 * 1024;

/**
 * The device signals the caveat logic needs. Kept as a plain data shape (not read from
 * expo-device here) so this module stays pure-Node loadable for jest; the UI layer feeds it
 * from `currentDeviceProfile()` (device-profile.ts).
 */
export type DeviceProfile = {
  /** `Platform.OS` — 'ios' | 'android' (other values behave like iOS: no Android caveat). */
  os: string;
  /** `Device.totalMemory` — physical RAM in bytes, or null when unknown (e.g. web/tests). */
  totalMemoryBytes: number | null;
};

/**
 * Device-specific warning for a model, appended to its base `note` in the picker — or null when
 * the model runs well on this device. Two independent signals, worst first:
 *  - low RAM (`LARGE_MODEL_MIN_MEMORY_BYTES`): the large model's working set doesn't fit —
 *    warn regardless of platform.
 *  - Android: whisper.rn has no GPU backend there (CPU-only inference, no Metal), so the
 *    large model is markedly slower than on iOS even with plenty of RAM.
 */
export function modelCaveat(model: WhisperModel, profile: DeviceProfile): string | null {
  if (model.approxBytes < LARGE_MODEL_BYTES) return null;
  if (profile.totalMemoryBytes != null && profile.totalMemoryBytes < LARGE_MODEL_MIN_MEMORY_BYTES) {
    return 'may be unstable on this device';
  }
  if (profile.os === 'android') return 'slow on Android';
  return null;
}

export const getModel = (id: string | null | undefined): WhisperModel | null =>
  MODELS.find((m) => m.id === id) ?? null;

/**
 * Ids of models retired from the catalog, mapped to the id users should migrate to (`null` to just
 * clear the selection). Add an entry here whenever a model is removed from MODELS. A stored retired
 * selection is resolved to its replacement wherever the persisted selection is read
 * (`resolveSelectedModel`); the replacement's weights are then downloaded lazily at export time.
 */
export const RETIRED_MODELS: Record<string, string | null> = {
  'tiny.en': 'base.en',
};

/**
 * Where a stored id that no longer resolves should migrate: a retired id's designated replacement,
 * or `null` (clear the selection) for anything unknown/corrupt.
 */
export const migrateStaleModelId = (id: string): WhisperModel | null =>
  getModel(RETIRED_MODELS[id]);

/**
 * Resolve a persisted (possibly retired) selected-model id to a live model. Use this — not bare
 * `getModel` — everywhere the *stored* selection is read, so a user whose selected model was
 * renamed/retired keeps a working selection instead of silently falling back to "no model".
 */
export const resolveSelectedModel = (id: string | null | undefined): WhisperModel | null =>
  getModel(id) ?? (id ? migrateStaleModelId(id) : null);

export const modelUrl = (m: WhisperModel): string => BASE_URL + m.filename;
