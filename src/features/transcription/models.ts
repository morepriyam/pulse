// Catalog of on-device Whisper models the user can choose between. All are hosted on the
// whisper.cpp GGML repo. `approxBytes` is only for an initial progress estimate / a completeness
// floor — the real content length comes from the download task. English-only models (`.en`) are
// smaller/faster; large-v3-turbo is multilingual.
const BASE_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/';

export type WhisperModel = {
  id: string;
  label: string;
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
    id: 'tiny.en',
    label: 'Tiny (English)',
    filename: 'ggml-tiny.en.bin',
    approxBytes: 78 * 1024 * 1024,
    note: 'Fastest · lowest accuracy',
    lang: 'en',
  },
  {
    id: 'base.en',
    label: 'Base (English)',
    filename: 'ggml-base.en.bin',
    approxBytes: 148 * 1024 * 1024,
    note: 'Balanced',
    lang: 'en',
  },
  {
    id: 'small.en-q5_1',
    label: 'Small (English)',
    filename: 'ggml-small.en-q5_1.bin',
    approxBytes: 190 * 1024 * 1024,
    note: 'Better accuracy · a bit slower',
    lang: 'en',
  },
  {
    id: 'large-v3-turbo-q5_0',
    label: 'Large Turbo',
    filename: 'ggml-large-v3-turbo-q5_0.bin',
    approxBytes: 574 * 1024 * 1024,
    note: 'Best · multilingual · large download',
    lang: 'auto',
  },
];

/** Models at/above this on-disk size prompt for confirmation before downloading (cellular/data). */
export const LARGE_MODEL_BYTES = 300 * 1024 * 1024;

export const getModel = (id: string | null | undefined): WhisperModel | null =>
  MODELS.find((m) => m.id === id) ?? null;

export const modelUrl = (m: WhisperModel): string => BASE_URL + m.filename;
