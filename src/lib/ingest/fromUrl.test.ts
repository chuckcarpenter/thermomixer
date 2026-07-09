import { describe, it, expect } from 'vitest';
import { tidyStep, parseIngredientLine, decodeEntities } from './fromUrl';

describe('tidyStep — strip recipe-plugin ingredient bleed', () => {
  it('cuts an ingredient list appended after a sentence (no space)', () => {
    expect(
      tidyStep('These will finish cooking in the oven.2 c. egg noodles'),
    ).toBe('These will finish cooking in the oven.');
  });

  it('cuts a multi-ingredient bleed', () => {
    expect(
      tidyStep('Mix together soup, milk, and drained noodles.10.5 oz. soup, 1/3 c. milk'),
    ).toBe('Mix together soup, milk, and drained noodles.');
  });

  it('cuts a bleed that starts with a fraction', () => {
    expect(tidyStep('Top with potato chips.½ c. potato chips, crushed')).toBe(
      'Top with potato chips.',
    );
  });

  it('leaves a normal step untouched', () => {
    expect(tidyStep('Cook in a 350 degree F oven for 30 minutes.')).toBe(
      'Cook in a 350 degree F oven for 30 minutes.',
    );
  });

  it('does not cut legitimate decimals mid-sentence', () => {
    expect(tidyStep('Reduce until about 1.5 cups remain.')).toBe(
      'Reduce until about 1.5 cups remain.',
    );
  });
});

describe('parseIngredientLine', () => {
  it('parses quantity + unit + item', () => {
    expect(parseIngredientLine('200 g plain flour')).toEqual({
      quantity: 200,
      unit: 'g',
      item: 'plain flour',
      note: undefined,
    });
  });

  it('captures a trailing note after a comma', () => {
    const r = parseIngredientLine('2 cloves garlic, minced');
    expect(r.quantity).toBe(2);
    expect(r.unit).toBe('cloves');
    expect(r.item).toBe('garlic');
    expect(r.note).toBe('minced');
  });

  it('does not split on commas inside parentheses (peach-cobbler baseline)', () => {
    const r = parseIngredientLine('16 oz frozen peaches (sliced - frozen, fresh or canned)');
    expect(r.quantity).toBe(16);
    expect(r.unit).toBe('oz');
    expect(r.item).toBe('frozen peaches (sliced - frozen, fresh or canned)');
    expect(r.note).toBeUndefined();
  });

  it('decodes HTML entities in ingredient lines', () => {
    expect(parseIngredientLine('1 cup M&amp;Ms').item).toBe('M&Ms');
  });
});

describe('decodeEntities', () => {
  it('decodes numeric and named entities (peach-cobbler baseline)', () => {
    expect(decodeEntities('Microwave water for 1 minute so it&#39;s boiling')).toBe(
      "Microwave water for 1 minute so it's boiling",
    );
    expect(decodeEntities('salt &amp; pepper &#8217;')).toBe('salt & pepper ’');
  });

  it('tidyStep decodes entities too', () => {
    expect(tidyStep('so it&#39;s boiling')).toBe("so it's boiling");
  });
});
