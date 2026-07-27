import { describe, it, expect } from 'vitest';
import {
  IMAGE_LIMITS,
  planDownscale,
  shouldPassThrough,
  checkPayloadBudget,
} from './prepare';

describe('planDownscale — clamp the long edge, never upscale', () => {
  it('shrinks a landscape phone photo to the max edge', () => {
    expect(planDownscale(4032, 3024)).toEqual({ width: 1568, height: 1176, scaled: true });
  });

  it('clamps the LONG edge on a portrait screenshot, not the width', () => {
    expect(planDownscale(1170, 2532)).toEqual({ width: 725, height: 1568, scaled: true });
  });

  it('leaves an already-small image alone', () => {
    expect(planDownscale(800, 600)).toEqual({ width: 800, height: 600, scaled: false });
  });

  it('does not upscale an image exactly at the limit', () => {
    expect(planDownscale(1568, 900).scaled).toBe(false);
  });

  it('survives a zero-size decode without NaN', () => {
    expect(planDownscale(0, 0)).toEqual({ width: 0, height: 0, scaled: false });
  });

  it('never rounds a sliver down to zero', () => {
    expect(planDownscale(10000, 3).height).toBe(1);
  });
});

describe('shouldPassThrough — skip re-encoding small, already-supported images', () => {
  it('passes a modest PNG screenshot through untouched', () => {
    expect(shouldPassThrough('image/png', 400_000, 1200)).toBe(true);
  });

  it('re-encodes a PNG that is over the resolution limit', () => {
    expect(shouldPassThrough('image/png', 400_000, 2000)).toBe(false);
  });

  it('re-encodes a huge screenshot even at low resolution', () => {
    expect(shouldPassThrough('image/png', 4_000_000, 1000)).toBe(false);
  });

  // Load-bearing: HEIC must always be re-encoded or the server allowlist rejects it.
  it('never passes HEIC through', () => {
    expect(shouldPassThrough('image/heic', 100_000, 800)).toBe(false);
  });

  it('is case-insensitive about the mime type', () => {
    expect(shouldPassThrough('IMAGE/JPEG', 100_000, 800)).toBe(true);
  });
});

describe('checkPayloadBudget — keep the request body under the platform cap', () => {
  it('rejects an empty batch', () => {
    const result = checkPayloadBudget([]);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/at least one/i);
  });

  it('rejects one photo over the count cap, naming the limit', () => {
    const result = checkPayloadBudget(Array(IMAGE_LIMITS.MAX_COUNT + 1).fill(100_000));
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain(String(IMAGE_LIMITS.MAX_COUNT));
  });

  it('accepts exactly the count cap', () => {
    expect(checkPayloadBudget(Array(IMAGE_LIMITS.MAX_COUNT).fill(100_000)).ok).toBe(true);
  });

  it('rejects a batch over the wire budget and quotes both sizes', () => {
    const result = checkPayloadBudget([3_000_000, 3_000_000]);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/6\.0 MB.*4\.0 MB/);
  });

  it('accepts a realistic batch and reports the total', () => {
    expect(checkPayloadBudget([300_000, 300_000])).toEqual({ ok: true, totalBytes: 600_000 });
  });
});
