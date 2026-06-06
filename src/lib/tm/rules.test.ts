import { describe, it, expect } from 'vitest';
import { matchRule, detectOffDevice, parseTemp } from './rules';
import { applyGuardrails, convertStep, convertRecipe } from './convert';
import { scaleCookTime, scaleIngredients } from './scale';
import { formatSetting, formatStepLine } from './format';
import type { CanonicalRecipe } from './types';

describe('matchRule — known conversions', () => {
  it('chop → speed 5', () => {
    expect(matchRule('Chop the carrots')?.setting.speed).toBe(5);
  });

  it('finely chop / mince → speed 7 (more specific than chop)', () => {
    expect(matchRule('Finely chop the garlic')?.id).toBe('mince');
    expect(matchRule('Finely chop the garlic')?.setting.speed).toBe(7);
  });

  it('sauté → 100°C, speed 1, reverse', () => {
    const s = matchRule('Sauté the onions until soft')?.setting;
    expect(s?.tempC).toBe(100);
    expect(s?.speed).toBe(1);
    expect(s?.reverse).toBe(true);
  });

  it('knead → dough mode', () => {
    const s = matchRule('Knead into a smooth dough')?.setting;
    expect(s?.speed).toBe('dough');
    expect(s?.mode).toBe('dough');
  });

  it('purée → blend mode, high speed', () => {
    const s = matchRule('Purée until smooth')?.setting;
    expect(s?.mode).toBe('blend');
    expect(s?.speed).toBeGreaterThanOrEqual(9);
  });

  it('steam → Varoma', () => {
    expect(matchRule('Steam the fish')?.setting.tempC).toBe('Varoma');
  });

  it('sauté is matched before generic cook', () => {
    expect(matchRule('Sauté the garlic')?.id).toBe('saute');
  });

  it('returns null for an unmappable step', () => {
    expect(matchRule('Contemplate the meaning of soup')).toBeNull();
  });
});

describe('guardrails', () => {
  it('drops temperatures above the TM7 max and warns', () => {
    const { setting, warnings } = applyGuardrails({ tempC: 180, timeSec: 600 });
    expect(setting.tempC).toBeUndefined();
    expect(warnings.length).toBe(1);
  });

  it('bumps above-120°C into browning mode', () => {
    const { setting } = applyGuardrails({ tempC: 150, timeSec: 60 });
    expect(setting.mode).toBe('browning');
  });

  it('caps steaming speed at 5', () => {
    const { setting } = applyGuardrails({ mode: 'steam', speed: 8, tempC: 'Varoma', timeSec: 60 });
    expect(setting.speed).toBe(5);
  });

  it('clamps speed into 0–10', () => {
    expect(applyGuardrails({ speed: 15 }).setting.speed).toBe(10);
  });

  it('adds a default time when a temperature has none (no temp without time)', () => {
    const { setting } = applyGuardrails({ tempC: 90 });
    expect(setting.timeSec).toBeGreaterThan(0);
  });
});

describe('off-device + explicit temperature parsing', () => {
  it('flags oven steps', () => {
    expect(detectOffDevice('Bake in the oven for 30 minutes')).toBe('oven');
  });

  it('flags deep frying', () => {
    expect(detectOffDevice('Deep-fry until golden')).toBe('deep-frying');
  });

  it('parses Celsius', () => {
    expect(parseTemp('Heat to 95°C')).toBe(95);
  });

  it('converts Fahrenheit to Celsius', () => {
    expect(parseTemp('Preheat to 350°F')).toBe(177);
  });

  it('a 180°C step becomes an off-device device warning', () => {
    const { step, warnings } = convertStep('Heat the oil to 180°C');
    expect(step.needsReview).toBe(true);
    expect(step.setting).toBeUndefined();
    expect(warnings.length).toBe(1);
  });

  it('prefers an explicit in-range temperature over the rule default', () => {
    // "simmer" defaults to 95°C, but the step says 85°C.
    const { step } = convertStep('Simmer gently at 85°C');
    expect(step.setting?.tempC).toBe(85);
  });
});

describe('scaling', () => {
  it('scales ingredient quantities linearly', () => {
    const out = scaleIngredients([{ quantity: 100, unit: 'g', item: 'flour' }], 2);
    expect(out[0].quantity).toBe(200);
  });

  it('leaves quantity-less ingredients alone', () => {
    const out = scaleIngredients([{ item: 'salt', note: 'to taste' }], 2);
    expect(out[0].quantity).toBeUndefined();
  });

  it('adds ~20% time when doubling (not 2x)', () => {
    expect(scaleCookTime(600, 2)).toBe(720);
  });

  it('subtracts ~20% time when halving', () => {
    expect(scaleCookTime(600, 0.5)).toBe(540);
  });
});

describe('formatting', () => {
  it('renders a heated step shorthand', () => {
    expect(formatSetting({ timeSec: 480, tempC: 100, speed: 1, reverse: true })).toBe(
      '8 min / 100°C / speed 1 / reverse',
    );
  });

  it('renders a chop shorthand', () => {
    expect(formatSetting({ timeSec: 5, speed: 7 })).toBe('5 sec / speed 7');
  });

  it('renders nothing for prep steps', () => {
    expect(formatSetting({ mode: 'prep' })).toBe('');
  });

  it('formatStepLine appends the setting after an em dash', () => {
    expect(formatStepLine('Chop the onion', { timeSec: 5, speed: 5 })).toBe(
      'Chop the onion — 5 sec / speed 5',
    );
  });
});

describe('convertRecipe — end to end (pure)', () => {
  const recipe: CanonicalRecipe = {
    title: 'Simple Tomato Soup',
    servings: 4,
    ingredients: [
      { quantity: 1, item: 'onion' },
      { quantity: 400, unit: 'g', item: 'chopped tomatoes' },
    ],
    steps: [
      'Finely chop the onion',
      'Sauté the onion until soft',
      'Add the tomatoes and simmer',
      'Purée until smooth',
      'Bake the croutons in the oven',
    ],
  };

  it('produces a TM step per recipe step', () => {
    const out = convertRecipe(recipe);
    expect(out.tmSteps).toHaveLength(5);
  });

  it('collects the oven step as a device warning', () => {
    const out = convertRecipe(recipe);
    expect(out.deviceWarnings.length).toBe(1);
    expect(out.tmSteps[4].needsReview).toBe(true);
  });

  it('rescales ingredients and times to target servings', () => {
    const out = convertRecipe(recipe, { targetServings: 8 });
    expect(out.servings).toBe(8);
    expect(out.ingredients[1].quantity).toBe(800); // 400g doubled
    // simmer time (600s default) gets +20% when doubling
    expect(out.tmSteps[2].setting?.timeSec).toBe(720);
  });
});
