/**
 * Render TM settings and whole recipes into human/Cookidoo-friendly text.
 * Pure; shared by the UI, the Cookidoo copy panel, and the Markdown export.
 */
import type { Ingredient, TMRecipe, TMSetting } from './types';
import { ACCESSORY_LABELS } from './types';

/** Format seconds as "45 sec" or "8 min" or "1 min 30 sec". */
export function formatTime(sec: number): string {
  if (sec < 60) return `${sec} sec`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s ? `${m} min ${s} sec` : `${m} min`;
}

/** Cookidoo-style shorthand for a setting, e.g. "8 min / 100°C / speed 1 / reverse".
 * Returns "" for pure-prep steps (no machine action). */
export function formatSetting(setting?: TMSetting): string {
  if (!setting || setting.mode === 'prep') return '';
  // Accessory modes run a preset program — render by name (+ time if given).
  if (setting.mode && ACCESSORY_LABELS[setting.mode]) {
    const acc = [ACCESSORY_LABELS[setting.mode]];
    if (setting.timeSec != null) acc.push(formatTime(setting.timeSec));
    return acc.join(' / ');
  }
  const parts: string[] = [];
  if (setting.timeSec != null) parts.push(formatTime(setting.timeSec));
  if (setting.tempC != null) parts.push(setting.tempC === 'Varoma' ? 'Varoma' : `${setting.tempC}°C`);
  if (setting.speed != null) parts.push(setting.speed === 'dough' ? 'dough mode' : `speed ${setting.speed}`);
  if (setting.reverse) parts.push('reverse');
  return parts.join(' / ');
}

export function formatIngredient(ing: Ingredient): string {
  const qty = ing.quantity != null ? formatNumber(ing.quantity) : '';
  return [qty, ing.unit, ing.item, ing.note ? `(${ing.note})` : '']
    .filter(Boolean)
    .join(' ')
    .trim();
}

/** One step line with its setting appended, as pasted into Cookidoo steps. */
export function formatStepLine(text: string, setting?: TMSetting): string {
  const s = formatSetting(setting);
  return s ? `${text.trim().replace(/\s*$/, '')} — ${s}` : text.trim();
}

/** Full Markdown export of a converted recipe. */
export function toMarkdown(recipe: TMRecipe): string {
  const lines: string[] = [`# ${recipe.title}`, ''];
  if (recipe.servings) lines.push(`**Serves:** ${recipe.servings}`);
  if (recipe.sourceUrl) lines.push(`**Source:** ${recipe.sourceUrl}`);
  lines.push('', '## Ingredients', '');
  for (const ing of recipe.ingredients) lines.push(`- ${formatIngredient(ing)}`);
  lines.push('', '## Method (Thermomix TM7)', '');
  recipe.tmSteps.forEach((step, i) => {
    lines.push(`${i + 1}. ${formatStepLine(step.text, step.setting)}`);
    if (step.note && step.setting?.mode !== 'prep') lines.push(`   _${step.note}_`);
  });
  if (recipe.deviceWarnings.length) {
    lines.push('', '## ⚠️ Off-device steps', '');
    for (const w of recipe.deviceWarnings) lines.push(`- ${w}`);
  }
  return lines.join('\n');
}

function formatNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : String(n);
}
