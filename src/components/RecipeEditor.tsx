/**
 * Editable view of a converted recipe. The conversion is a starting point;
 * here the user tweaks settings, edits step text, and rescales servings.
 * Pure state lives in the parent (App); this component just renders + emits.
 */
import type { TMRecipe, TMSetting, TMStep } from '../lib/tm/types';
import { ACCESSORY_LABELS } from '../lib/tm/types';
import { formatIngredient, formatSetting } from '../lib/tm/format';

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

      {/* Ingredients */}
      <section>
        <h2 class="mb-2 text-lg font-semibold text-slate-800">Ingredients</h2>
        <ul class="space-y-1">
          {recipe.ingredients.map((ing) => (
            <li class="text-slate-700">• {formatIngredient(ing)}</li>
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
