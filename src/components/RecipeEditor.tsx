/**
 * Editable view of a converted recipe. The conversion is a starting point;
 * here the user tweaks settings, edits step text, and rescales servings.
 * Pure state lives in the parent (App); this component just renders + emits.
 */
import type { Ingredient, TMRecipe, TMSetting, TMStep } from '../lib/tm/types';
import { ACCESSORY_LABELS } from '../lib/tm/types';
import { formatSetting } from '../lib/tm/format';
import { toMetric, hasImperial } from '../lib/tm/units';

interface Props {
  recipe: TMRecipe;
  busy: boolean;
  onChange: (recipe: TMRecipe) => void;
  onServingsChange: (servings: number) => void;
}

export default function RecipeEditor({ recipe, busy, onChange, onServingsChange }: Props) {
  function updateStep(i: number, patch: Partial<TMStep>) {
    const tmSteps = recipe.tmSteps.map((s, idx) => (idx === i ? { ...s, ...patch } : s));
    onChange({ ...recipe, tmSteps });
  }

  function updateSetting(i: number, patch: Partial<TMSetting>) {
    const cur = recipe.tmSteps[i].setting ?? {};
    updateStep(i, { setting: { ...cur, ...patch } });
  }

  return (
    <div class="space-y-6">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="text-2xl font-bold text-slate-900">{recipe.title}</h1>
          {recipe.sourceUrl && (
            <a class="text-sm text-emerald-700 underline" href={recipe.sourceUrl} target="_blank">
              source
            </a>
          )}
        </div>
        <label class="flex items-center gap-2 text-sm text-slate-700">
          Servings
          <input
            type="number"
            min={1}
            class="w-16 rounded border border-slate-300 px-2 py-1"
            value={recipe.servings ?? ''}
            disabled={busy}
            onChange={(e) => {
              const n = parseInt((e.target as HTMLInputElement).value, 10);
              if (n > 0) onServingsChange(n);
            }}
          />
        </label>
      </div>

      {/* Ingredients — editable; quantities/units fixable in place */}
      <section>
        <div class="mb-2 flex items-center justify-between">
          <h2 class="text-lg font-semibold text-slate-800">Ingredients</h2>
          {hasImperial(recipe.ingredients) && (
            <button
              type="button"
              class="rounded bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700"
              title="The TM7 has a built-in scale — weigh in grams/ml"
              onClick={() =>
                onChange({ ...recipe, ingredients: recipe.ingredients.map(toMetric) })
              }
            >
              ⚖ Convert to metric
            </button>
          )}
        </div>
        <ul class="space-y-1.5">
          {recipe.ingredients.map((ing, i) => (
            <IngredientRow
              ing={ing}
              onChange={(patch) => {
                const ingredients = recipe.ingredients.map((x, idx) =>
                  idx === i ? { ...x, ...patch } : x,
                );
                onChange({ ...recipe, ingredients });
              }}
            />
          ))}
        </ul>
      </section>

      {/* Steps */}
      <section>
        <h2 class="mb-2 text-lg font-semibold text-slate-800">Method (TM7)</h2>
        <ol class="space-y-3">
          {recipe.tmSteps.map((step, i) => (
            <li class="rounded-lg border border-slate-200 bg-white p-3">
              <div class="flex items-start gap-2">
                <span class="mt-1 font-mono text-sm text-slate-400">{i + 1}</span>
                <div class="flex-1 space-y-2">
                  <textarea
                    class="w-full resize-none rounded border border-slate-200 p-2 text-sm text-slate-800"
                    rows={2}
                    value={step.text}
                    onInput={(e) => updateStep(i, { text: (e.target as HTMLTextAreaElement).value })}
                  />
                  <SettingRow step={step} onChange={(p) => updateSetting(i, p)} />
                  {step.needsReview && (
                    <span class="inline-block rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                      {step.note ?? 'review'}
                    </span>
                  )}
                  {!step.needsReview && step.note && (
                    <span class="text-xs text-slate-500">{step.note}</span>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function SettingRow({ step, onChange }: { step: TMStep; onChange: (p: Partial<TMSetting>) => void }) {
  const s = step.setting;
  if (!s || s.mode === 'prep') {
    return <p class="text-xs italic text-slate-400">No machine action</p>;
  }
  if (s.mode && ACCESSORY_LABELS[s.mode]) {
    return (
      <span class="inline-block rounded bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-800">
        🔧 {formatSetting(s)}
      </span>
    );
  }
  return (
    <div class="flex flex-wrap items-center gap-3 text-sm">
      <label class="flex items-center gap-1">
        <span class="text-slate-500">time (s)</span>
        <input
          type="number"
          min={0}
          class="w-20 rounded border border-slate-300 px-2 py-0.5"
          value={s.timeSec ?? ''}
          onInput={(e) =>
            onChange({ timeSec: numOrUndef((e.target as HTMLInputElement).value) })
          }
        />
      </label>
      <label class="flex items-center gap-1">
        <span class="text-slate-500">°C</span>
        <input
          type="text"
          class="w-20 rounded border border-slate-300 px-2 py-0.5"
          value={s.tempC ?? ''}
          placeholder="37–160 / Varoma"
          onInput={(e) => onChange({ tempC: parseTemp((e.target as HTMLInputElement).value) })}
        />
      </label>
      <label class="flex items-center gap-1">
        <span class="text-slate-500">speed</span>
        <input
          type="text"
          class="w-20 rounded border border-slate-300 px-2 py-0.5"
          value={s.speed ?? ''}
          placeholder="0–10 / dough"
          onInput={(e) => onChange({ speed: parseSpeed((e.target as HTMLInputElement).value) })}
        />
      </label>
      <label class="flex items-center gap-1">
        <input
          type="checkbox"
          checked={!!s.reverse}
          onChange={(e) => onChange({ reverse: (e.target as HTMLInputElement).checked })}
        />
        <span class="text-slate-500">reverse</span>
      </label>
      <span class="ml-auto rounded bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-600">
        {formatSetting(s) || '—'}
      </span>
    </div>
  );
}

function IngredientRow({ ing, onChange }: { ing: Ingredient; onChange: (p: Partial<Ingredient>) => void }) {
  return (
    <li class="flex items-center gap-1.5">
      <input
        type="text"
        class="w-14 rounded border border-slate-200 px-1.5 py-0.5 text-sm text-slate-700"
        value={ing.quantity != null ? displayQty(ing.quantity) : ''}
        placeholder="qty"
        onChange={(e) => onChange({ quantity: parseQty((e.target as HTMLInputElement).value) })}
      />
      <input
        type="text"
        class="w-16 rounded border border-slate-200 px-1.5 py-0.5 text-sm text-slate-700"
        value={ing.unit ?? ''}
        placeholder="unit"
        onChange={(e) => onChange({ unit: (e.target as HTMLInputElement).value.trim() || undefined })}
      />
      <input
        type="text"
        class="min-w-0 flex-1 rounded border border-slate-200 px-1.5 py-0.5 text-sm text-slate-700"
        value={ing.item + (ing.note ? `, ${ing.note}` : '')}
        onChange={(e) => {
          const v = (e.target as HTMLInputElement).value;
          const ci = v.indexOf(',');
          if (ci > -1) onChange({ item: v.slice(0, ci).trim(), note: v.slice(ci + 1).trim() || undefined });
          else onChange({ item: v.trim(), note: undefined });
        }}
      />
    </li>
  );
}

const QTY_GLYPHS: Record<string, number> = {
  '⅛': 0.125, '¼': 0.25, '⅓': 1 / 3, '⅜': 0.375, '½': 0.5,
  '⅝': 0.625, '⅔': 2 / 3, '¾': 0.75, '⅞': 0.875,
};

function displayQty(n: number): string {
  if (Number.isInteger(n)) return String(n);
  const whole = Math.floor(n);
  const frac = n - whole;
  const glyph = Object.entries(QTY_GLYPHS).find(([, v]) => Math.abs(frac - v) < 0.02)?.[0];
  if (glyph) return whole ? `${whole} ${glyph}` : glyph;
  return String(Math.round(n * 100) / 100);
}

function parseQty(v: string): number | undefined {
  const s = v.trim();
  if (!s) return undefined;
  const m = s.match(/^(\d+)?\s*([⅛¼⅓⅜½⅝⅔¾⅞])$/);
  if (m) return (m[1] ? parseInt(m[1], 10) : 0) + QTY_GLYPHS[m[2]];
  const frac = s.match(/^(\d+)?\s*(\d+)\/(\d+)$/);
  if (frac) return (frac[1] ? parseInt(frac[1], 10) : 0) + parseInt(frac[2], 10) / parseInt(frac[3], 10);
  const n = parseFloat(s);
  return Number.isNaN(n) ? undefined : n;
}

function numOrUndef(v: string): number | undefined {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? undefined : n;
}
function parseTemp(v: string): number | 'Varoma' | undefined {
  if (/varoma/i.test(v)) return 'Varoma';
  return numOrUndef(v);
}
function parseSpeed(v: string): number | 'dough' | undefined {
  if (/dough/i.test(v)) return 'dough';
  const n = parseFloat(v);
  return Number.isNaN(n) ? undefined : n;
}
