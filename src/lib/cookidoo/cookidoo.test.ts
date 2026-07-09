import { describe, it, expect } from 'vitest';
import { buildPayload } from './create';
import { CookieJar } from './http';
import { jarFromCookie } from './auth';
import { getMarket } from './markets';
import type { TMRecipe } from '../tm/types';

const recipe: TMRecipe = {
  title: 'Tomato Soup',
  servings: 4,
  prepTimeMin: 10,
  cookTimeMin: 20,
  ingredients: [
    { quantity: 1, item: 'onion' },
    { quantity: 400, unit: 'g', item: 'chopped tomatoes' },
  ],
  steps: ['Finely chop the onion', 'Simmer for 20 minutes'],
  tmSteps: [
    { text: 'Finely chop the onion', setting: { timeSec: 5, speed: 7 } },
    { text: 'Simmer for 20 minutes', setting: { timeSec: 1200, tempC: 95, speed: 1, reverse: true } },
  ],
  deviceWarnings: [],
};

describe('buildPayload — TMRecipe → Cookidoo', () => {
  const p = buildPayload(recipe);

  it('uses the title as recipeName and name', () => {
    expect(p.recipeName).toBe('Tomato Soup');
    expect(p.patch.name).toBe('Tomato Soup');
  });

  it('maps ingredients to typed items', () => {
    expect(p.patch.ingredients[0]).toEqual({ type: 'INGREDIENT', text: '1 onion' });
    expect(p.patch.ingredients[1]).toEqual({ type: 'INGREDIENT', text: '400 g chopped tomatoes' });
  });

  it('maps steps to typed items with TTS in the text', () => {
    expect(p.patch.instructions[0]).toEqual({ type: 'STEP', text: 'Finely chop the onion — 5 sec / speed 7' });
    expect(p.patch.instructions[1].text).toBe('Simmer for 20 minutes — 20 min / 95°C / speed 1 / reverse');
  });

  it('sets yield, tools, and times', () => {
    expect(p.patch.yield).toEqual({ value: 4, unitText: 'portion' });
    expect(p.patch.tools).toEqual(['TM7']);
    expect(p.patch.prepTime).toBe(600);
    expect(p.patch.totalTime).toBe(1800);
  });

  it('omits times when absent', () => {
    const bare = buildPayload({ ...recipe, prepTimeMin: undefined, cookTimeMin: undefined });
    expect(bare.patch.prepTime).toBeUndefined();
    expect(bare.patch.totalTime).toBeUndefined();
  });
});

describe('CookieJar', () => {
  it('absorbs set-cookie and emits a Cookie header for matching hosts', () => {
    const jar = new CookieJar();
    jar.absorb(new URL('https://cookidoo.thermomix.com/cb'), [
      '_oauth2_proxy=abc123; Path=/; HttpOnly; Domain=cookidoo.thermomix.com',
      'v-authenticated=true; Path=/',
    ]);
    const header = jar.header(new URL('https://cookidoo.thermomix.com/created-recipes/en-US'));
    expect(header).toContain('_oauth2_proxy=abc123');
    expect(header).toContain('v-authenticated=true');
  });

  it('does not send cookies to unrelated domains', () => {
    const jar = new CookieJar();
    jar.absorb(new URL('https://ciam.prod.cookidoo.vorwerk-digital.com/x'), ['sid=zzz; Path=/']);
    expect(jar.header(new URL('https://cookidoo.thermomix.com/y'))).toBe('');
  });

  it('honors cookie deletion', () => {
    const jar = new CookieJar();
    jar.absorb(new URL('https://cookidoo.de/x'), ['t=1; Path=/']);
    jar.absorb(new URL('https://cookidoo.de/x'), ['t=; Path=/']);
    expect(jar.get('t')).toBeUndefined();
  });
});

describe('jarFromCookie — token mode', () => {
  const it_market = getMarket('it')!;

  it('accepts a raw _oauth2_proxy value', () => {
    const jar = jarFromCookie(it_market, 'eyJhbGciOi.jwt.value');
    expect(jar.get('_oauth2_proxy')).toBe('eyJhbGciOi.jwt.value');
    expect(jar.header(new URL('https://cookidoo.it/created-recipes/it-IT'))).toContain('_oauth2_proxy=');
  });

  it('extracts _oauth2_proxy from a full Cookie header string', () => {
    const jar = jarFromCookie(it_market, 'foo=bar; _oauth2_proxy=THETOKEN; v-authenticated=true');
    expect(jar.get('_oauth2_proxy')).toBe('THETOKEN');
  });
});
