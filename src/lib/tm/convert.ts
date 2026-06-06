/**
 * Conversion orchestration: CanonicalRecipe -> TMRecipe.
 *
 * Pure and synchronous. The rules engine proposes a setting per step; the
 * guardrails validate it against the TM7's real limits; off-device steps
 * (oven, deep fryer) become device warnings rather than bogus dial settings.
 *
 * Steps the rules can't map are flagged `needsReview` with no setting — the
 * API layer may optionally ask the LLM to propose a setting, which is then
 * re-validated through the very same `applyGuardrails` here.
 */
import type { CanonicalRecipe, TMRecipe, TMSetting, TMStep } from './types';
import { TM7 } from './types';
import { matchRule, detectOffDevice, parseTemp } from './rules';
import { scaleCookTime, scaleIngredients, servingsFactor } from './scale';

export interface ConvertOptions {
  targetServings?: number;
}

/** Validate/repair a setting against TM7 limits. Returns the safe setting plus
 * any warnings raised. Exported so the LLM-fallback path reuses it. */
export function applyGuardrails(setting: TMSetting): {
  setting: TMSetting;
  warnings: string[];
} {
  const out: TMSetting = { ...setting };
  const warnings: string[] = [];

  // Temperature ceiling: above browning max is impossible on the TM7.
  if (typeof out.tempC === 'number') {
    if (out.tempC > TM7.TEMP_MAX) {
      warnings.push(
        `needs ${out.tempC} °C — above the TM7 max of ${TM7.TEMP_MAX} °C; use the oven/stovetop`,
      );
      delete out.tempC;
      delete out.timeSec;
    } else if (out.tempC < TM7.TEMP_MIN && out.tempC > 0) {
      out.tempC = TM7.TEMP_MIN; // clamp up to the lowest selectable temp
    } else if (out.tempC > TM7.TEMP_COOK_MAX && out.mode !== 'browning') {
      out.mode = 'browning'; // above 120 °C requires browning mode
    }
  }

  // Steaming must not exceed speed 5.
  if (out.mode === 'steam' && typeof out.speed === 'number' && out.speed > TM7.STEAM_SPEED_MAX) {
    out.speed = TM7.STEAM_SPEED_MAX;
  }

  // Speed bounds.
  if (typeof out.speed === 'number') {
    out.speed = Math.max(TM7.SPEED_MIN, Math.min(TM7.SPEED_MAX, out.speed));
  }

  // Heat requires a time on the dial — the TM7 won't apply temperature
  // without one. Default to 5 min so the output is a valid setting.
  if (out.tempC != null && out.timeSec == null) {
    out.timeSec = 5 * 60;
  }

  return { setting: out, warnings };
}

/** Convert a single step's text into a TMStep, collecting any device warnings. */
export function convertStep(text: string): { step: TMStep; warnings: string[] } {
  const offDevice = detectOffDevice(text);
  const explicitTemp = parseTemp(text);

  // Fundamentally off-device, or asks for a temperature the TM7 can't reach.
  if (offDevice || (explicitTemp != null && explicitTemp > TM7.TEMP_MAX)) {
    const needs = offDevice ?? `${explicitTemp} °C`;
    return {
      step: { text, needsReview: true, note: `Off-device step — needs ${needs}` },
      warnings: [`"${truncate(text)}" needs ${needs}; the TM7 can't do this step`],
    };
  }

  const rule = matchRule(text);
  if (!rule) {
    return {
      step: { text, needsReview: true, note: 'No rule matched — review or use AI suggestion' },
      warnings: [],
    };
  }

  // Prefer an explicit in-range temperature stated in the recipe.
  let base: TMSetting = { ...rule.setting };
  if (explicitTemp != null && explicitTemp <= TM7.TEMP_MAX && typeof base.tempC === 'number') {
    base.tempC = explicitTemp;
  }

  const { setting, warnings } = applyGuardrails(base);
  return {
    step: { text, setting, note: rule.note ?? rule.label },
    warnings,
  };
}

/** Full recipe conversion, including optional servings rescale. */
export function convertRecipe(recipe: CanonicalRecipe, opts: ConvertOptions = {}): TMRecipe {
  const factor = servingsFactor(recipe, opts.targetServings);

  const tmSteps: TMStep[] = [];
  const deviceWarnings: string[] = [];

  for (const text of recipe.steps) {
    const { step, warnings } = convertStep(text);
    // Rescale cook times for the new batch size.
    if (factor !== 1 && step.setting?.timeSec != null) {
      step.setting = { ...step.setting, timeSec: scaleCookTime(step.setting.timeSec, factor) };
    }
    tmSteps.push(step);
    deviceWarnings.push(...warnings);
  }

  return {
    ...recipe,
    servings: opts.targetServings ?? recipe.servings,
    ingredients: scaleIngredients(recipe.ingredients, factor),
    tmSteps,
    deviceWarnings,
  };
}

function truncate(s: string, n = 60): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
