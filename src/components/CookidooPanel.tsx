/**
 * Cookidoo manual-entry panel. No API — Cookidoo has none — so this mirrors
 * its "Created Recipes" editor. That editor has ONE INPUT PER ingredient and
 * PER step, so blobs don't paste well: the core flow here is a per-section
 * "Copy next" stepper — copy an item, paste it in Cookidoo, come back, repeat —
 * with per-row copy buttons and progress ticks.
 */
import { useMemo, useState } from 'preact/hooks';
import type { TMRecipe } from '../lib/tm/types';
import { formatIngredient, formatStepLine, toMarkdown } from '../lib/tm/format';
import { MARKETS } from '../lib/cookidoo/markets';

async function writeClipboard(value: string) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    // Clipboard API can be unavailable (permissions, older WebViews) — fall
    // back to the legacy textarea trick rather than failing silently.
    const ta = document.createElement('textarea');
    ta.value = value;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
}

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  async function copy(id: string, value: string) {
    await writeClipboard(value);
    setCopied(id);
    setTimeout(() => setCopied((c) => (c === id ? null : c)), 1200);
  }
  return { copied, copy };
}

/** A list section (Ingredients / Steps) with a "Copy next" stepper. */
function CopyList({ title, items }: { title: string; items: string[] }) {
  const { copied, copy } = useCopy();
  const [done, setDone] = useState<Set<number>>(new Set());
  const next = items.findIndex((_, i) => !done.has(i));

  async function copyRow(i: number) {
    await copy(`${title}-${i}`, items[i]);
    setDone((d) => new Set(d).add(i));
  }

  return (
    <div class="space-y-2">
      <div class="flex items-center justify-between gap-2">
        <span class="text-sm font-semibold text-slate-700">
          {title}
          <span class="ml-2 font-normal text-slate-400">
            {done.size}/{items.length}
          </span>
        </span>
        <div class="flex gap-2">
          {done.size > 0 && (
            <button
              type="button"
              class="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
              onClick={() => setDone(new Set())}
            >
              Reset
            </button>
          )}
          <button
            type="button"
            disabled={next === -1}
            class="rounded bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
            onClick={() => copyRow(next)}
          >
            {next === -1 ? '✓ All copied' : `Copy next (${next + 1})`}
          </button>
        </div>
      </div>
      <ol class="divide-y divide-slate-100 rounded border border-slate-200 bg-slate-50">
        {items.map((item, i) => (
          <li
            class={`flex items-center gap-2 px-2 py-1.5 text-sm ${
              done.has(i) ? 'text-slate-400' : 'text-slate-800'
            } ${i === next ? 'bg-emerald-50' : ''}`}
          >
            <span class="w-5 shrink-0 text-right font-mono text-xs text-slate-400">
              {done.has(i) ? '✓' : i + 1}
            </span>
            <span class="min-w-0 flex-1 truncate" title={item}>
              {item}
            </span>
            <button
              type="button"
              class="shrink-0 rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-600 hover:bg-white"
              onClick={() => copyRow(i)}
            >
              {copied === `${title}-${i}` ? '✓' : 'Copy'}
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Field({ title, value }: { title: string; value: string }) {
  const { copied, copy } = useCopy();
  return (
    <div class="flex items-center justify-between gap-3 rounded border border-slate-200 bg-slate-50 px-2 py-1.5">
      <div class="min-w-0">
        <span class="mr-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</span>
        <span class="truncate text-sm text-slate-800">{value}</span>
      </div>
      <button
        type="button"
        class="shrink-0 rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-600 hover:bg-white"
        onClick={() => copy(title, value)}
      >
        {copied === title ? '✓' : 'Copy'}
      </button>
    </div>
  );
}

/** Beta: create the recipe directly in the user's Cookidoo via the unofficial
 * internal API. Credentials are sent once to our server and never stored. */
function CreateInCookidoo({ recipe }: { recipe: TMRecipe }) {
  const [open, setOpen] = useState(false);
  const [market, setMarket] = useState('us');
  const [mode, setMode] = useState<'password' | 'token'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [cookie, setCookie] = useState('');
  const [busy, setBusy] = useState<null | 'dry' | 'create'>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; url?: string } | null>(null);

  async function submit(dryRun: boolean) {
    setBusy(dryRun ? 'dry' : 'create');
    setMsg(null);
    const auth = mode === 'token' ? { mode, cookie } : { mode, email, password };
    try {
      const res = await fetch('/api/cookidoo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ recipe, market, dryRun, auth }),
      });
      const data = await res.json();
      if (!res.ok) return setMsg({ ok: false, text: data.error ?? 'Failed.' });
      if (dryRun) {
        setMsg({ ok: true, text: `${data.message} (${data.preview.ingredients} ingredients, ${data.preview.steps} steps)` });
      } else {
        setMsg({ ok: true, text: 'Created in Cookidoo ✓ — open My Recipes → Created Recipes.', url: data.recipeUrl });
      }
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Request failed' });
    } finally {
      setBusy(null);
    }
  }

  const label = 'block text-xs font-medium text-slate-500';
  const field = 'mt-0.5 w-full rounded border border-slate-300 px-2 py-1 text-sm';

  return (
    <div class="rounded-lg border border-indigo-200 bg-indigo-50/40">
      <button
        type="button"
        class="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-semibold text-indigo-800"
        onClick={() => setOpen((o) => !o)}
      >
        <span>⚡ Create in my Cookidoo <span class="rounded bg-indigo-200 px-1.5 py-0.5 text-xs">beta</span></span>
        <span class="text-indigo-400">{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div class="space-y-3 border-t border-indigo-200 px-3 py-3">
          <p class="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
            <strong>Unofficial API — use at your own risk.</strong> This uses Cookidoo's internal
            endpoints (not a public API); they may change or break, and automated access may be
            against Cookidoo's terms. Requires an active <strong>paid Cookidoo subscription</strong>.
            Your credentials are sent once to create the recipe and are <strong>never stored</strong>.
          </p>

          <div>
            <label class={label}>Market</label>
            <select class={field} value={market} onChange={(e) => setMarket((e.target as HTMLSelectElement).value)}>
              {MARKETS.map((m) => (
                <option value={m.id}>{m.label} ({m.host})</option>
              ))}
            </select>
          </div>

          <div class="flex gap-3 text-sm">
            <label class="flex items-center gap-1">
              <input type="radio" checked={mode === 'password'} onChange={() => setMode('password')} />
              Email + password
            </label>
            <label class="flex items-center gap-1">
              <input type="radio" checked={mode === 'token'} onChange={() => setMode('token')} />
              Session cookie
            </label>
          </div>

          {mode === 'password' ? (
            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class={label}>Cookidoo email</label>
                <input type="email" autocomplete="off" class={field} value={email} onInput={(e) => setEmail((e.target as HTMLInputElement).value)} />
              </div>
              <div>
                <label class={label}>Password</label>
                <input type="password" autocomplete="off" class={field} value={password} onInput={(e) => setPassword((e.target as HTMLInputElement).value)} />
              </div>
            </div>
          ) : (
            <div>
              <label class={label}>
                <code>_oauth2_proxy</code> cookie (from your logged-in Cookidoo browser tab → DevTools → Application → Cookies)
              </label>
              <textarea rows={2} class={field} value={cookie} onInput={(e) => setCookie((e.target as HTMLTextAreaElement).value)} placeholder="paste the _oauth2_proxy value" />
            </div>
          )}

          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy !== null}
              class="rounded border border-indigo-300 px-3 py-1 text-sm text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
              onClick={() => submit(true)}
            >
              {busy === 'dry' ? 'Testing…' : 'Test login (dry run)'}
            </button>
            <button
              type="button"
              disabled={busy !== null}
              class="rounded bg-indigo-600 px-3 py-1 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              onClick={() => submit(false)}
            >
              {busy === 'create' ? 'Creating…' : 'Create in Cookidoo'}
            </button>
          </div>

          {msg && (
            <p class={`rounded p-2 text-sm ${msg.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>
              {msg.text}{' '}
              {msg.url && (
                <a class="underline" href={msg.url} target="_blank" rel="noreferrer">
                  open recipe
                </a>
              )}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function CookidooPanel({ recipe }: { recipe: TMRecipe }) {
  const ingredients = useMemo(() => recipe.ingredients.map(formatIngredient), [recipe]);
  const steps = useMemo(
    () => recipe.tmSteps.map((s) => formatStepLine(s.text, s.setting)),
    [recipe],
  );
  const markdown = toMarkdown(recipe);

  function download(filename: string, content: string, type: string) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  const slug =
    recipe.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'recipe';

  return (
    <section class="space-y-4 rounded-lg border border-emerald-200 bg-white p-4 shadow-sm">
      <header>
        <h2 class="text-lg font-bold text-emerald-800">Add to Cookidoo</h2>
        <p class="mt-1 text-sm text-slate-600">
          Cookidoo's editor (<strong>My Recipes → Created Recipes → Create recipe</strong>) has one
          input per ingredient and per step. Use <strong>Copy next</strong>: copy → paste in
          Cookidoo → come back → repeat. Settings are already in each step.
        </p>
      </header>

      <CreateInCookidoo recipe={recipe} />

      <div class="flex items-center gap-2 pt-1 text-xs uppercase tracking-wide text-slate-400">
        <span class="h-px flex-1 bg-slate-200" />
        or copy in by hand
        <span class="h-px flex-1 bg-slate-200" />
      </div>

      <div class="space-y-2">
        <Field title="Title" value={recipe.title} />
        {recipe.servings ? <Field title="Portions" value={String(recipe.servings)} /> : null}
      </div>

      <CopyList title="Ingredients" items={ingredients} />
      <CopyList title="Steps" items={steps} />

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
          onClick={() => navigator.clipboard.writeText(markdown)}
        >
          📋 Copy all (Markdown)
        </button>
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
