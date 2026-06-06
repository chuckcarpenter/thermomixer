/**
 * Top-level client island. Owns the flow: ingest (URL / photo / text) on the
 * server → convert on the server → edit locally → copy to Cookidoo / export.
 * The conversion core is server-side so servings rescales re-call /api/convert.
 */
import { useState } from 'preact/hooks';
import type { CanonicalRecipe, TMRecipe } from '../lib/tm/types';
import RecipeEditor from './RecipeEditor';
import CookidooPanel from './CookidooPanel';

type Tab = 'url' | 'photo' | 'text';

export default function App() {
  const [tab, setTab] = useState<Tab>('url');
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canonical, setCanonical] = useState<CanonicalRecipe | null>(null);
  const [recipe, setRecipe] = useState<TMRecipe | null>(null);

  async function post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
    return data as T;
  }

  async function convert(c: CanonicalRecipe, targetServings?: number) {
    const tm = await post<TMRecipe>('/api/convert', { recipe: c, targetServings, aiFallback: true });
    setRecipe(tm);
  }

  async function ingest(body: unknown) {
    setBusy(true);
    setError(null);
    try {
      const c = await post<CanonicalRecipe>('/api/ingest', body);
      setCanonical(c);
      await convert(c);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  async function onServingsChange(n: number) {
    if (!canonical) return;
    setBusy(true);
    try {
      await convert(canonical, n);
    } finally {
      setBusy(false);
    }
  }

  function handlePhoto(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      const base64 = dataUrl.split(',')[1];
      ingest({ imageBase64: base64, mimeType: file.type });
    };
    reader.readAsDataURL(file);
  }

  function reset() {
    setRecipe(null);
    setCanonical(null);
    setError(null);
  }

  if (recipe) {
    return (
      <div class="space-y-6">
        <button type="button" class="text-sm text-emerald-700 underline" onClick={reset}>
          ← Convert another recipe
        </button>
        {busy && <p class="text-sm text-slate-500">Updating…</p>}
        <div class="grid gap-6 lg:grid-cols-2">
          <RecipeEditor recipe={recipe} busy={busy} onChange={setRecipe} onServingsChange={onServingsChange} />
          <CookidooPanel recipe={recipe} />
        </div>
      </div>
    );
  }

  return (
    <div class="mx-auto max-w-xl space-y-4">
      <div class="flex gap-2">
        {(['url', 'photo', 'text'] as Tab[]).map((t) => (
          <button
            type="button"
            class={`rounded-full px-4 py-1.5 text-sm font-medium ${
              tab === t ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
            onClick={() => setTab(t)}
          >
            {t === 'url' ? 'From URL' : t === 'photo' ? 'From photo' : 'Paste text'}
          </button>
        ))}
      </div>

      {tab === 'url' && (
        <form
          class="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (url.trim()) ingest({ url: url.trim() });
          }}
        >
          <input
            type="url"
            required
            placeholder="https://example.com/great-recipe"
            class="w-full rounded-lg border border-slate-300 px-3 py-2"
            value={url}
            onInput={(e) => setUrl((e.target as HTMLInputElement).value)}
          />
          <button type="submit" disabled={busy} class="w-full rounded-lg bg-emerald-600 py-2 font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
            {busy ? 'Converting…' : 'Convert to TM7'}
          </button>
        </form>
      )}

      {tab === 'photo' && (
        <div class="space-y-3">
          <label class="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 p-8 text-center text-slate-500 hover:border-emerald-400">
            <span>📷 Tap to upload a photo or screenshot of a recipe</span>
            <input type="file" accept="image/*" class="hidden" disabled={busy} onChange={handlePhoto} />
          </label>
          {busy && <p class="text-center text-sm text-slate-500">Reading the photo…</p>}
        </div>
      )}

      {tab === 'text' && (
        <form
          class="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) ingest({ text: text.trim() });
          }}
        >
          <textarea
            required
            rows={8}
            placeholder="Paste the full recipe (ingredients + method)…"
            class="w-full rounded-lg border border-slate-300 px-3 py-2"
            value={text}
            onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
          />
          <button type="submit" disabled={busy} class="w-full rounded-lg bg-emerald-600 py-2 font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
            {busy ? 'Converting…' : 'Convert to TM7'}
          </button>
        </form>
      )}

      {error && <p class="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    </div>
  );
}
