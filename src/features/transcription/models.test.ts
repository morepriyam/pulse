import { describe, expect, it } from '@jest/globals';

import {
  getModel,
  LARGE_MODEL_BYTES,
  migrateStaleModelId,
  MODELS,
  modelUrl,
  RETIRED_MODELS,
} from './models';

describe('model catalog', () => {
  it('resolves a known id and rejects unknown / nullish ids', () => {
    expect(getModel('base.en')?.id).toBe('base.en');
    expect(getModel('nope')).toBeNull();
    expect(getModel(null)).toBeNull();
    expect(getModel(undefined)).toBeNull();
  });

  it('builds the Hugging Face GGML url from the filename', () => {
    const m = getModel('base.en')!;
    expect(modelUrl(m)).toBe(
      'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en-q5_1.bin',
    );
  });

  it('pins English-only models to "en" and the multilingual model to "auto"', () => {
    // Regression: the multilingual model must NOT be silently forced to English.
    for (const m of MODELS) {
      const expected = m.id.includes('.en') ? 'en' : 'auto';
      expect(m.lang).toBe(expected);
    }
    expect(getModel('large-v3-turbo-q5_0')!.lang).toBe('auto');
    // The small multilingual model is the affordable non-English option — it must detect language.
    expect(getModel('small-q5_1')!.lang).toBe('auto');
  });

  it('only the large model crosses the confirm-before-download threshold', () => {
    const large = MODELS.filter((m) => m.approxBytes >= LARGE_MODEL_BYTES);
    expect(large.map((m) => m.id)).toEqual(['large-v3-turbo-q5_0']);
  });

  it('every retired id is actually gone and maps to a model still in the catalog', () => {
    // Guards future retirements: a retired id must not linger in MODELS, and its replacement must
    // resolve (never another retired id, so migration can't dead-end).
    for (const [id, replacement] of Object.entries(RETIRED_MODELS)) {
      expect(getModel(id)).toBeNull();
      if (replacement !== null) expect(getModel(replacement)).not.toBeNull();
    }
  });

  it('migrates a retired id to its replacement and clears unknown ids', () => {
    expect(migrateStaleModelId('tiny.en')?.id).toBe('base.en');
    expect(migrateStaleModelId('some-corrupt-value')).toBeNull();
  });
});
