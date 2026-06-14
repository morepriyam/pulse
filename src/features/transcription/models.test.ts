import { describe, expect, it } from '@jest/globals';

import { getModel, LARGE_MODEL_BYTES, MODELS, modelUrl } from './models';

describe('model catalog', () => {
  it('resolves a known id and rejects unknown / nullish ids', () => {
    expect(getModel('tiny.en')?.id).toBe('tiny.en');
    expect(getModel('nope')).toBeNull();
    expect(getModel(null)).toBeNull();
    expect(getModel(undefined)).toBeNull();
  });

  it('builds the Hugging Face GGML url from the filename', () => {
    const m = getModel('base.en')!;
    expect(modelUrl(m)).toBe(
      'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin',
    );
  });

  it('pins English-only models to "en" and the multilingual model to "auto"', () => {
    // Regression: the multilingual model must NOT be silently forced to English.
    for (const m of MODELS) {
      const expected = m.id.includes('.en') ? 'en' : 'auto';
      expect(m.lang).toBe(expected);
    }
    expect(getModel('large-v3-turbo-q5_0')!.lang).toBe('auto');
  });

  it('only the large model crosses the confirm-before-download threshold', () => {
    const large = MODELS.filter((m) => m.approxBytes >= LARGE_MODEL_BYTES);
    expect(large.map((m) => m.id)).toEqual(['large-v3-turbo-q5_0']);
  });
});
