import { describe, expect, it } from '@jest/globals';

import {
  getModel,
  LARGE_MODEL_BYTES,
  LARGE_MODEL_MIN_MEMORY_BYTES,
  migrateStaleModelId,
  modelCaveat,
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

describe('modelCaveat', () => {
  const large = getModel('large-v3-turbo-q5_0')!;
  const small = getModel('base.en')!;
  const GB = 1024 * 1024 * 1024;

  it('never flags small models, on any device', () => {
    expect(modelCaveat(small, { os: 'android', totalMemoryBytes: 1 * GB })).toBeNull();
    expect(modelCaveat(small, { os: 'ios', totalMemoryBytes: null })).toBeNull();
  });

  it('flags the large model as slow on Android (CPU-only inference)', () => {
    expect(modelCaveat(large, { os: 'android', totalMemoryBytes: 8 * GB })).toBe(
      'slow on Android',
    );
    expect(modelCaveat(large, { os: 'ios', totalMemoryBytes: 8 * GB })).toBeNull();
  });

  it('low RAM outranks the platform note and applies on both platforms', () => {
    const low = LARGE_MODEL_MIN_MEMORY_BYTES - 1;
    expect(modelCaveat(large, { os: 'android', totalMemoryBytes: low })).toBe(
      'may be unstable on this device',
    );
    expect(modelCaveat(large, { os: 'ios', totalMemoryBytes: low })).toBe(
      'may be unstable on this device',
    );
  });

  it('unknown memory (null) falls back to the platform-only signal', () => {
    expect(modelCaveat(large, { os: 'android', totalMemoryBytes: null })).toBe('slow on Android');
    expect(modelCaveat(large, { os: 'ios', totalMemoryBytes: null })).toBeNull();
  });
});
