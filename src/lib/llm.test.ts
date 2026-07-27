import { describe, it, expect } from 'vitest';
import { buildImagePrompt, maxTokensForImages } from './llm';

describe('buildImagePrompt', () => {
  // Pins the pre-multi-photo wording so the path that already worked can't regress.
  it('is unchanged for a single image', () => {
    const prompt = buildImagePrompt(1);
    expect(prompt.startsWith('Extract the recipe from this image. ')).toBe(true);
    expect(prompt).toContain('Return ONLY a JSON object');
  });

  it('treats a zero-length batch as the single-image case', () => {
    expect(buildImagePrompt(0)).toBe(buildImagePrompt(1));
  });

  it('tells the model how many images to expect', () => {
    expect(buildImagePrompt(4)).toContain('These 4 images');
  });

  it('carries the merge, dedup, and ignore-chrome rules', () => {
    const prompt = buildImagePrompt(3);
    expect(prompt).toContain('ONE single recipe');
    expect(prompt).toContain('MAY OVERLAP');
    expect(prompt).toContain('Emit it ONCE');
    expect(prompt).toContain('comments');
  });

  // Regression: production testing with two overlapping screenshots that each
  // showed "1 tbsp olive oil" produced 2 tbsp — the model summed the mentions
  // instead of treating them as one ingredient. Saying "never repeat" wasn't
  // enough; it has to be told not to total them.
  it('forbids summing quantities across overlapping images', () => {
    const prompt = buildImagePrompt(2);
    expect(prompt).toContain('NEVER ADD QUANTITIES TOGETHER');
    expect(prompt).toContain('NOT 2 tbsp');
  });

  it('still ends with the shared response shape', () => {
    expect(buildImagePrompt(3)).toContain('Return ONLY a JSON object');
  });
});

describe('maxTokensForImages', () => {
  it('leaves the single-image budget exactly as it was', () => {
    expect(maxTokensForImages(1)).toBe(2048);
  });

  it('scales with page count', () => {
    expect(maxTokensForImages(2)).toBe(3072);
    expect(maxTokensForImages(4)).toBe(5120);
  });

  it('caps at 8192 so the non-streaming request cannot time out', () => {
    expect(maxTokensForImages(8)).toBe(8192);
    expect(maxTokensForImages(50)).toBe(8192);
  });

  it('never goes below the floor', () => {
    expect(maxTokensForImages(0)).toBe(2048);
  });
});
