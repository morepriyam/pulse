// Catalog of on-device Whisper models the user can choose between. All are hosted on the
// whisper.cpp GGML repo. `approxBytes` is only for an initial progress estimate / a completeness
// floor — the real content length comes from the download task. English-only models (`.en`) are
// smaller/faster; large-v3-turbo is multilingual.
const BASE_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/';

export type WhisperModel = {
  id: string;
  label: string;
  /**
   * The underlying Whisper checkpoint name (e.g. `tiny.en`, `large-v3-turbo`), shown muted in the
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
    id: 'tiny.en',
    label: 'Tiny (English)',
    name: 'tiny.en · q5_1',
    filename: 'ggml-tiny.en-q5_1.bin',
    approxBytes: 31 * 1024 * 1024,
    note: 'Fastest · English only',
    lang: 'en',
  },
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
    note: 'Any language · best quality',
    lang: 'auto',
  },
];

/** Models at/above this on-disk size prompt for confirmation before downloading (cellular/data). */
export const LARGE_MODEL_BYTES = 300 * 1024 * 1024;

export const getModel = (id: string | null | undefined): WhisperModel | null =>
  MODELS.find((m) => m.id === id) ?? null;

export const modelUrl = (m: WhisperModel): string => BASE_URL + m.filename;
