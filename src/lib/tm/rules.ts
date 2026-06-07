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
      'spray',
      'grease',
      'line the',
      'cover',
      'chill',
      'refrigerate',
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

// Appliances the TM7 genuinely cannot replace. (A stovetop pan / skillet is NOT
// here — the TM7 sautés and browns, so those steps convert fine.)
const OFF_DEVICE = [
  { re: /\b(deep[-\s]?fry|deep[-\s]?frying)\b/i, what: 'deep-frying' },
  { re: /\b(barbecue|bbq|char-?grill|grill the|on the grill)\b/i, what: 'grilling' },
  { re: /\b(microwave)\b/i, what: 'a microwave' },
];

// The oven, as the cooking vessel for THIS step (bake/roast/broil, or "in the
// oven", "into a 350° oven", "oven for 30 min", "preheat").
const OVEN_PRIMARY = /\b(bake|roast|broil|pre\s*heat)\b|\b(in|into)\s+(a\s+|the\s+)?(\d{2,3}\s*(°|degrees?)\s*[a-z]*\s+)?oven\b|\boven\s+for\b/i;

// Cues that the oven is a *future / secondary* action, not this step's job
// (e.g. "these will finish cooking in the oven"). Then the step's real action
// (boil, mix, …) is what we convert.
const OVEN_SECONDARY = /\b(will|finish|finishes|finishing|later|then\b.*\boven|after)\b/i;

/** If a step fundamentally needs an appliance the TM7 can't be, return a short
 * label describing what's needed; otherwise null. */
export function detectOffDevice(stepText: string): string | null {
  const hit = OFF_DEVICE.find((o) => o.re.test(stepText));
  if (hit) return hit.what;
  if (OVEN_PRIMARY.test(stepText) && !OVEN_SECONDARY.test(stepText)) return 'oven';
  return null;
}

/** Extract an explicit cooking temperature (°C) mentioned in the text, if any.
 * Handles "180°C", "180 C", "350°F", "350 degrees F", "350 degrees".
 * Fahrenheit is converted; a bare "degrees" (US usage) is treated as °F. */
export function parseTemp(stepText: string): number | null {
  // Fahrenheit: number, optional ° / "degree(s)", then F / Fahrenheit.
  const f = stepText.match(/(\d{2,3})\s*(?:°|degrees?)?\s*(?:f|fahrenheit)\b/i);
  if (f) return Math.round(((parseInt(f[1], 10) - 32) * 5) / 9);
  // Celsius: number, optional ° / "degree(s)", optional C / Celsius.
  const c = stepText.match(/(\d{2,3})\s*°\s*(?:c|celsius)?\b/i) ?? stepText.match(/(\d{2,3})\s*degrees?\s*(?:c|celsius)\b/i);
  if (c) return parseInt(c[1], 10);
  // Bare "degrees" with no scale → assume Fahrenheit (US recipes).
  const bare = stepText.match(/(\d{2,3})\s*degrees?\b/i);
  if (bare) return Math.round(((parseInt(bare[1], 10) - 32) * 5) / 9);
  return null;
}

/** Extract an explicit duration in seconds from a step ("for about 6 minutes",
 * "5-10 mins", "1 hour"), if any. Used to override the rule's default time. */
export function parseDuration(stepText: string): number | null {
  const m = stepText.match(/(\d+)\s*(?:to\s*\d+\s*|-\s*\d+\s*)?(hour|hr|minute|min|second|sec)/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  const unit = m[2].toLowerCase();
  if (unit.startsWith('h')) return n * 3600;
  if (unit.startsWith('m')) return n * 60;
  return n;
}
