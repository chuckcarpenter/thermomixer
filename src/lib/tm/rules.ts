/**
 * The rules engine: deterministic mapping from a recipe step's wording to a
 * Thermomix TM7 setting. This is the heart of the app and is intentionally
 * pure (no I/O) so it can be unit-tested exhaustively.
 *
 * Settings use sensible midpoints drawn from standard Thermomix conversion
 * heuristics. They are starting points the user can tweak in the editor — the
 * goal is "a working recipe you adjust", not a guaranteed-perfect bake.
 */
import type { TMSetting } from './types';

export interface Rule {
  id: string;
  /** Human label shown as the step note, e.g. "sauté". */
  label: string;
  /** Returns true if this rule applies to the (lowercased) step text. */
  test: (text: string) => boolean;
  setting: TMSetting;
  note?: string;
}

/** Build a matcher for any of the given words/phrases, on word boundaries. */
function kw(...words: string[]): (text: string) => boolean {
  const res = words.map((w) => new RegExp(`\\b${w.replace(/\s+/g, '\\s+')}\\b`, 'i'));
  return (text: string) => res.some((re) => re.test(text));
}

const MIN = 60;

/**
 * Ordered most-specific → most-general. The first matching rule wins, so
 * "finely chop" must be tested before "chop", "sauté" before "cook", etc.
 */
export const RULES: Rule[] = [
  // --- Dough -------------------------------------------------------------
  {
    id: 'knead',
    label: 'knead dough',
    test: kw('knead', 'dough mode', 'work the dough'),
    setting: { timeSec: 2 * MIN, speed: 'dough', mode: 'dough' },
    note: 'Dough mode (kneading), 2–3 min',
  },
  {
    id: 'prove',
    label: 'prove / proof',
    test: kw('prove', 'proof', 'let it rise', 'allow to rise', 'leave to rise'),
    setting: { tempC: 37, timeSec: 30 * MIN, speed: 0, mode: 'warmup' },
    note: 'Warm proving at 37 °C (or rest outside the bowl)',
  },

  // --- Aeration (butterfly whisk) ---------------------------------------
  {
    id: 'whip',
    label: 'whip / beat / cream',
    test: kw(
      'whip',
      'whisk',
      'beat until',
      'cream the butter',
      'cream together',
      'soft peaks',
      'stiff peaks',
    ),
    setting: { timeSec: MIN, speed: 4 },
    note: 'Insert the butterfly whisk',
  },
  {
    id: 'emulsify',
    label: 'emulsify',
    test: kw('emulsify', 'mayonnaise', 'aioli', 'vinaigrette'),
    setting: { timeSec: MIN, speed: 4 },
    note: 'Butterfly whisk; drizzle oil slowly onto the lid',
  },

  // --- Size reduction ----------------------------------------------------
  {
    id: 'puree',
    label: 'purée / blend smooth',
    test: kw('puree', 'blend', 'blitz', 'smooth', 'process until'),
    setting: { timeSec: MIN, speed: 9, mode: 'blend' },
    note: 'Increase gradually to speed 10 for a smooth result',
  },
  {
    id: 'grind',
    label: 'grind / mill',
    test: kw('grind', 'mill', 'pulverize', 'pulverise', 'powder'),
    setting: { timeSec: MIN, speed: 10 },
  },
  {
    id: 'grate',
    label: 'grate',
    test: kw('grate', 'shred'),
    setting: { timeSec: 8, speed: 8 },
  },
  {
    id: 'crush-ice',
    label: 'crush ice',
    test: kw('crush ice', 'crushed ice'),
    setting: { timeSec: 8, speed: 8 },
    note: 'Pulse in short bursts',
  },
  {
    id: 'mince',
    label: 'finely chop / mince',
    test: kw('mince', 'finely chop', 'finely chopped', 'finely dice', 'grind to a paste'),
    setting: { timeSec: 5, speed: 7 },
  },
  {
    id: 'chop',
    label: 'chop',
    test: kw('chop', 'chopped', 'dice', 'roughly chop'),
    setting: { timeSec: 5, speed: 5 },
  },

  // --- Heat with motion --------------------------------------------------
  {
    id: 'brown',
    label: 'brown / sear / caramelize',
    test: kw('brown', 'sear', 'caramelize', 'caramelise', 'maillard'),
    setting: { tempC: 160, timeSec: 5 * MIN, speed: 1, reverse: true, mode: 'browning' },
    note: 'Browning mode (no measuring cup, so moisture escapes)',
  },
  {
    id: 'saute',
    label: 'sauté / sweat',
    test: kw('saute', 'sweat', 'soften the onion', 'fry the onion', 'fry off'),
    setting: { tempC: 100, timeSec: 3 * MIN, speed: 1, reverse: true, mode: 'cook' },
  },
  {
    id: 'toast',
    label: 'toast spices',
    test: kw('toast'),
    setting: { tempC: 120, timeSec: 5 * MIN, speed: 1, reverse: true, mode: 'cook' },
  },
  {
    id: 'simmer',
    label: 'simmer / reduce',
    test: kw('simmer', 'reduce', 'thicken'),
    setting: { tempC: 95, timeSec: 10 * MIN, speed: 1, reverse: true, mode: 'cook' },
  },
  {
    id: 'boil',
    label: 'boil',
    test: kw('boil', 'bring to the boil', 'bring to a boil'),
    setting: { tempC: 100, timeSec: 10 * MIN, speed: 1, mode: 'cook' },
  },
  {
    id: 'steam',
    label: 'steam (Varoma)',
    test: kw('steam', 'varoma'),
    setting: { tempC: 'Varoma', timeSec: 15 * MIN, speed: 1, mode: 'steam' },
    note: 'Use the Varoma dish/tray on top',
  },

  // --- Gentle heat -------------------------------------------------------
  {
    id: 'melt',
    label: 'melt',
    test: kw('melt'),
    setting: { tempC: 50, timeSec: 3 * MIN, speed: 2, mode: 'warmup' },
  },
  {
    id: 'warm',
    label: 'warm / reheat',
    test: kw('warm', 'reheat', 'gently heat'),
    setting: { tempC: 60, timeSec: 5 * MIN, speed: 2, mode: 'warmup' },
  },
  {
    id: 'cook',
    label: 'cook',
    test: kw('cook', 'heat', 'poach', 'stew'),
    setting: { tempC: 100, timeSec: 10 * MIN, speed: 1, reverse: true, mode: 'cook' },
  },

  // --- Combine (no heat) -------------------------------------------------
  {
    id: 'fold',
    label: 'fold gently',
    test: kw('fold'),
    setting: { timeSec: 10, speed: 3, reverse: true },
    note: 'Reverse + slow speed protects delicate mixtures',
  },
  {
    id: 'mix-dry',
    label: 'mix dry ingredients',
    test: kw('mix dry', 'combine the dry', 'sift', 'whisk together the dry'),
    setting: { timeSec: 5, speed: 4 },
  },
  {
    id: 'mix',
    label: 'mix / stir / combine',
    test: kw('mix', 'stir', 'combine', 'incorporate'),
    setting: { timeSec: 10, speed: 3 },
  },

  // --- Pure prep (no machine action) ------------------------------------
  {
    id: 'prep',
    label: 'prep / add',
    test: kw(
      'add',
      'place',
      'weigh',
      'pour',
      'transfer',
      'set aside',
      'rest',
      'season',
      'garnish',
      'serve',
      'sprinkle',
      'drain',
      'set the butterfly',
    ),
    setting: { mode: 'prep' },
    note: 'No machine action — add ingredients / prep',
  },
];

/** Strip diacritics so accented words ("sauté", "purée") match ASCII rules. */
function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Find the first rule that matches the step text, or null. */
export function matchRule(stepText: string): Rule | null {
  const text = normalize(stepText);
  return RULES.find((r) => r.test(text)) ?? null;
}

const OFF_DEVICE = [
  { re: /\b(pre\s*heat|bake|roast|broil|grill the oven|in the oven)\b/i, what: 'oven' },
  { re: /\b(deep[-\s]?fry|deep frying)\b/i, what: 'deep-frying' },
  { re: /\b(barbecue|bbq|grill the|chargrill)\b/i, what: 'grilling' },
  { re: /\b(frying pan|skillet|griddle|wok)\b/i, what: 'a stovetop pan' },
];

/** If a step is fundamentally off-device (oven, deep fryer, grill), return a
 * short label describing what's needed; otherwise null. */
export function detectOffDevice(stepText: string): string | null {
  const hit = OFF_DEVICE.find((o) => o.re.test(stepText));
  return hit ? hit.what : null;
}

/** Extract an explicit cooking temperature (°C) mentioned in the text, if any.
 * Handles "180°C", "180 C", "350°F", "350 degrees". Fahrenheit is converted. */
export function parseTemp(stepText: string): number | null {
  const m = stepText.match(/(\d{2,3})\s*°?\s*(c|f|celsius|fahrenheit|degrees?)/i);
  if (!m) return null;
  const value = parseInt(m[1], 10);
  const unit = m[2].toLowerCase();
  if (unit.startsWith('f')) return Math.round(((value - 32) * 5) / 9);
  return value;
}
