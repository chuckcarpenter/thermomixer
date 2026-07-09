import { describe, it, expect } from 'vitest';
import { toMetric, hasImperial } from './units';

describe('toMetric — peach-cobbler baseline', () => {
  it('cups of a known dry ingredient → grams via density', () => {
    expect(toMetric({ quantity: 1, unit: 'cup', item: 'flour' })).toEqual({
      quantity: 120, unit: 'g', item: 'flour',
    });
    expect(toMetric({ quantity: 0.75, unit: 'cup', item: 'sugar (recommend white)' })).toEqual({
      quantity: 150, unit: 'g', item: 'sugar (recommend white)',
    });
    expect(toMetric({ quantity: 0.5, unit: 'cup', item: 'softened butter' }).quantity).toBe(115);
  });

  it('cups of a liquid or unknown → millilitres', () => {
    expect(toMetric({ quantity: 0.5, unit: 'cup', item: 'milk' })).toEqual({
      quantity: 120, unit: 'ml', item: 'milk',
    });
    expect(toMetric({ quantity: 0.25, unit: 'cup', item: 'boiling water' }).unit).toBe('ml');
    expect(toMetric({ quantity: 1, unit: 'cup', item: 'mystery mixture' })).toEqual({
      quantity: 240, unit: 'ml', item: 'mystery mixture',
    });
  });

  it('oz → g for solids, ml for liquids', () => {
    expect(toMetric({ quantity: 16, unit: 'oz', item: 'frozen peaches' })).toEqual({
      quantity: 455, unit: 'g', item: 'frozen peaches',
    });
    expect(toMetric({ quantity: 8, unit: 'oz', item: 'milk' }).unit).toBe('ml');
  });

  it('lb / pint / quart convert', () => {
    expect(toMetric({ quantity: 1, unit: 'lb', item: 'beef' }).quantity).toBe(455);
    expect(toMetric({ quantity: 1, unit: 'pint', item: 'stock' })).toEqual({
      quantity: 475, unit: 'ml', item: 'stock',
    });
  });

  it('keeps tsp/tbsp/pinch and metric/count units untouched (idempotent)', () => {
    const tsp = { quantity: 0.5, unit: 'tsp', item: 'cinnamon' };
    expect(toMetric(tsp)).toBe(tsp);
    const g = { quantity: 200, unit: 'g', item: 'flour' };
    expect(toMetric(g)).toBe(g);
    const cloves = { quantity: 2, unit: 'cloves', item: 'garlic' };
    expect(toMetric(cloves)).toBe(cloves);
    const pinch = { unit: 'pinch', item: 'salt' } as any;
    expect(toMetric(pinch)).toBe(pinch);
  });

  it('small amounts keep half-unit precision', () => {
    // 0.5 oz solid = 14.175 → 14 (not rounded to nearest 5)
    expect(toMetric({ quantity: 0.5, unit: 'oz', item: 'parmesan' }).quantity).toBe(14);
  });

  it('hasImperial detects convertible lists', () => {
    expect(hasImperial([{ quantity: 1, unit: 'cup', item: 'flour' }])).toBe(true);
    expect(hasImperial([{ quantity: 100, unit: 'g', item: 'flour' }])).toBe(false);
  });
});
