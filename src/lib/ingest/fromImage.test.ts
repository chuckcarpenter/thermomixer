import { describe, it, expect } from 'vitest';
import { normalizeImageInputs, ImageInputError } from './fromImage';

const img = (mimeType = 'image/jpeg', base64 = 'AAAA') => ({ base64, mimeType });

describe('normalizeImageInputs — the /api/ingest wire contract', () => {
  it('accepts the images array and preserves page order', () => {
    const images = normalizeImageInputs({
      images: [img('image/png', 'one'), img('image/jpeg', 'two'), img('image/webp', 'three')],
    });
    expect(images.map((i) => i.base64)).toEqual(['one', 'two', 'three']);
  });

  it('still accepts the original single-image shape', () => {
    expect(normalizeImageInputs({ imageBase64: 'solo', mimeType: 'image/png' })).toEqual([
      { base64: 'solo', mimeType: 'image/png' },
    ]);
  });

  it('defaults a missing mimeType to jpeg, as the single-image path always did', () => {
    expect(normalizeImageInputs({ imageBase64: 'solo' })).toEqual([
      { base64: 'solo', mimeType: 'image/jpeg' },
    ]);
  });

  it('normalizes the image/jpg alias to image/jpeg', () => {
    expect(normalizeImageInputs({ images: [img('image/jpg')] })[0]!.mimeType).toBe('image/jpeg');
  });

  it('is case-insensitive about the mime type', () => {
    expect(normalizeImageInputs({ images: [img('Image/PNG')] })[0]!.mimeType).toBe('image/png');
  });

  it('names the 1-based position of an unsupported type', () => {
    expect(() =>
      normalizeImageInputs({ images: [img(), img(), img('image/heic')] }),
    ).toThrow(/Photo 3/);
  });

  it('names the 1-based position of an entry with no data', () => {
    expect(() => normalizeImageInputs({ images: [img(), { mimeType: 'image/png' }] })).toThrow(
      /Photo 2/,
    );
  });

  it('rejects more than eight photos, reporting the count', () => {
    expect(() => normalizeImageInputs({ images: Array(9).fill(img()) })).toThrow(/got 9/);
  });

  it('accepts exactly eight photos', () => {
    expect(normalizeImageInputs({ images: Array(8).fill(img()) })).toHaveLength(8);
  });

  it('rejects a batch over the total payload budget', () => {
    const huge = img('image/jpeg', 'x'.repeat(3_000_000));
    expect(() => normalizeImageInputs({ images: [huge, huge] })).toThrow(/too large/i);
  });

  it('rejects an empty payload with ImageInputError', () => {
    expect(() => normalizeImageInputs({})).toThrow(ImageInputError);
    expect(() => normalizeImageInputs({ images: [] })).toThrow(ImageInputError);
  });
});
