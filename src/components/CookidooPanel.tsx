/**
 * Cookidoo manual-entry panel. No API — Cookidoo has none — so this mirrors
 * the fields its "Created Recipes" editor asks for and gives each a copy
 * button. Pasting these in is a ~2-minute job with zero integration risk.
 */
import { useState } from 'preact/hooks';
import type { TMRecipe } from '../lib/tm/types';
import { formatIngredient, formatStepLine, toMarkdown } from '../lib/tm/format';

function CopyButton({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      class="rounded bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
    >
      {copied ? '✓ Copied' : label}
    </button>
  );
}

function Field({ title, value }: { title: string; value: string }) {
  return (
    <div class="space-y-1">
      <div class="flex items-center justify-between">
        <span class="text-sm font-semibold text-slate-700">{title}</span>
        <CopyButton label="Copy" value={value} />
      </div>
      <pre class="max-h-48 overflow-auto whitespace-pre-wrap rounded border border-slate-200 bg-slate-50 p-2 text-sm text-slate-800">
        {value}
      </pre>
    </div>
  );
}

export default function CookidooPanel({ recipe }: { recipe: TMRecipe }) {
  const ingredientsText = recipe.ingredients.map(formatIngredient).join('\n');
  const stepsText = recipe.tmSteps.map((s) => formatStepLine(s.text, s.setting)).join('\n\n');
  const markdown = toMarkdown(recipe);

  function download(filename: string, content: string, type: string) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  const slug = recipe.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'recipe';

  return (
    <section class="space-y-4 rounded-lg border border-emerald-200 bg-white p-4 shadow-sm">
      <header class="flex items-center justify-between">
        <h2 class="text-lg font-bold text-emerald-800">Add to Cookidoo</h2>
        <CopyButton label="Copy all" value={markdown} />
      </header>
      <p class="text-sm text-slate-600">
        In Cookidoo, open <strong>My Recipes → Created Recipes → Create recipe</strong>, then paste each
        field below. Steps already include the time / temperature / speed.
      </p>

      <Field title="Title" value={recipe.title} />
      {recipe.servings ? <Field title="Portions" value={String(recipe.servings)} /> : null}
      <Field title="Ingredients (one per line)" value={ingredientsText} />
      <Field title="Steps" value={stepsText} />

      {recipe.deviceWarnings.length > 0 && (
        <div class="rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-800">
          <strong>⚠️ Off-device steps</strong> — do these outside the TM7:
          <ul class="ml-4 list-disc">
            {recipe.deviceWarnings.map((w) => (
              <li>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <div class="flex flex-wrap gap-2 pt-2">
        <button
          type="button"
          class="rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50"
          onClick={() => download(`${slug}.md`, markdown, 'text/markdown')}
        >
          ⬇ Markdown
        </button>
        <button
          type="button"
          class="rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50"
          onClick={() => download(`${slug}.json`, JSON.stringify(recipe, null, 2), 'application/json')}
        >
          ⬇ JSON
        </button>
        <button
          type="button"
          class="rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50"
          onClick={() => window.print()}
        >
          🖨 Print
        </button>
      </div>
    </section>
  );
}
