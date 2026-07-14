/**
 * Canonical recipe model + Thermomix TM7 setting model.
 *
 * The ingest layer normalizes any source (URL, photo, pasted text) into a
 * `CanonicalRecipe`. The conversion layer turns that into a `TMRecipe`, where
 * every step carries a `TMSetting` describing what to dial into the machine.
 */

export interface Ingredient {
  quantity?: number;
  unit?: string;
  item: string;
  note?: string;
}

/** A speed on the TM7 dial: 0–10, plus the special dough/knead mode. */
export type Speed = number | 'dough';

/** A temperature: 37–160 °C, or the Varoma steam mode. */
export type Temp = number | 'Varoma';

/** How the TM7 should be set for a single step. All fields optional — a step
 * may be pure prep ("season to taste") with no machine action. */
export interface TMSetting {
  timeSec?: number;
  tempC?: Temp;
  speed?: Speed;
  /** Reverse blade direction (gentle stirring without chopping). */
  reverse?: boolean;
  mode?:
    | 'cook'
    | 'steam'
    | 'dough'
    | 'browning'
    | 'sousvide'
    | 'blend'
    | 'warmup'
    | 'prep'
    // Accessory modes (all TM7 accessories assumed available):
    | 'slicer' // Cutter+ slicing disc
    | 'grater' // Cutter+ grating disc
    | 'spiralizer' // Cutter+ spiral disc
    | 'peeler'; // Blade Cover & Peeler
}

/** Accessory modes don't use the time/temp/speed dial — they run their own
 * preset program — so they're rendered by name. */
export const ACCESSORY_LABELS: Record<string, string> = {
  slicer: 'Cutter+ (slicing)',
  grater: 'Cutter+ (grating)',
  spiralizer: 'Cutter+ (spiralizer)',
  peeler: 'Blade Cover & Peeler',
};

export interface TMStep {
  text: string;
  setting?: TMSetting;
  /** Human note, e.g. "insert butterfly whisk" or "matched: sauté". */
  note?: string;
  /** True when the rules engine could not confidently map this step. */
  needsReview?: boolean;
}

export interface CanonicalRecipe {
  title: string;
  servings?: number;
  prepTimeMin?: number;
  cookTimeMin?: number;
  ingredients: Ingredient[];
  steps: string[];
  image?: string;
  sourceUrl?: string;
}

export interface TMRecipe extends CanonicalRecipe {
  tmSteps: TMStep[];
  /** Things the TM7 can't do for this recipe, e.g. oven at 200 °C. */
  deviceWarnings: string[];
}

/** One step's verdict from the LLM whole-recipe review pass. */
export interface StepReview {
  index: number;
  action: 'machine' | 'prep' | 'offDevice';
  /** Present when action === 'machine'; re-validated by applyGuardrails. */
  setting?: TMSetting;
  /** Present when action === 'offDevice', e.g. "oven bake at 200 °C". */
  reason?: string;
}

/** Hard limits of the TM7, used by the guardrails. */
export const TM7 = {
  TEMP_MIN: 37,
  TEMP_MAX: 160, // browning mode ceiling
  TEMP_COOK_MAX: 120, // standard cook ceiling (above this needs browning)
  SPEED_MIN: 0,
  SPEED_MAX: 10,
  STEAM_SPEED_MAX: 5, // Varoma steaming should not exceed speed 5
} as const;
