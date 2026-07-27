/**
 * Top-level client island. Owns the flow: ingest (URL / photos / text) on the
 * server → convert on the server → edit locally → copy to Cookidoo / export.
 * The conversion core is server-side so servings rescales re-call /api/convert.
 *
 * Photos accumulate in local state before submitting: a recipe rarely fits in
 * one screenshot, and several images are sent together as pages of one recipe.
 */
import { useEffect, useState } from 'preact/hooks';
import type { CanonicalRecipe, TMRecipe } from '../lib/tm/types';
import {
  IMAGE_LIMITS,
  checkPayloadBudget,
  preparePhoto,
  type PreparedPhoto,
} from '../lib/image/prepare';
import { drainShareInbox, parseShareFlag } from '../lib/image/shareInbox';
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
  const [photos, setPhotos] = useState<PreparedPhoto[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [dragging, setDragging] = useState(false);

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

  // Ingredient/title edits (and metric conversion) become the new baseline, so
  // a later servings rescale — which re-derives from canonical — keeps them.
  function onRecipeChange(r: TMRecipe) {
    setRecipe(r);
    setCanonical((c) =>
      c ? { ...c, title: r.title, servings: r.servings, ingredients: r.ingredients } : c,
    );
  }

  // Downscale and stage files, keeping the good ones when some fail. Errors are
  // reported rather than swallowed — a silently dropped photo means a recipe
  // missing half its steps, with nothing to explain why.
  async function addFiles(list: FileList | File[]) {
    const incoming = Array.from(list).filter(
      (f) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(f.name),
    );
    if (!incoming.length) return;

    setPreparing(true);
    setError(null);
    const accepted: PreparedPhoto[] = [];
    const skipped: string[] = [];

    for (const file of incoming) {
      if (photos.length + accepted.length >= IMAGE_LIMITS.MAX_COUNT) {
        skipped.push(`${file.name || 'a photo'} (${IMAGE_LIMITS.MAX_COUNT} at a time)`);
        continue;
      }
      try {
        accepted.push(await preparePhoto(file));
      } catch (e) {
        skipped.push(e instanceof Error ? e.message : file.name);
      }
    }

    if (accepted.length) setPhotos((prev) => [...prev, ...accepted]);
    if (skipped.length) setError(`Skipped ${skipped.length}: ${skipped.join('; ')}`);
    setPreparing(false);
  }

  function movePhoto(index: number, delta: number) {
    setPhotos((prev) => {
      const to = index + delta;
      if (to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[to]] = [next[to]!, next[index]!];
      return next;
    });
  }

  function submitPhotos() {
    const budget = checkPayloadBudget(photos.map((p) => p.wireBytes));
    if (!budget.ok) {
      setError(budget.error);
      return;
    }
    ingest({ images: photos.map(({ base64, mimeType }) => ({ base64, mimeType })) });
  }

  // Paste is bound to the window, not the photo tab: a screenshot pasted while
  // looking at the URL tab still means "use this photo". Bailing out before
  // preventDefault when the clipboard carries no image leaves text pasting into
  // the URL and recipe fields completely untouched.
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) =>
        f.type.startsWith('image/'),
      );
      if (!files.length) return;
      e.preventDefault();
      setTab('photo');
      void addFiles(files);
    }
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
    // addFiles closes over photos to enforce the count cap.
  }, [photos.length]);

  // Without this, dropping a file just outside the drop zone navigates away and
  // destroys everything already staged.
  useEffect(() => {
    const swallow = (e: DragEvent) => e.preventDefault();
    window.addEventListener('dragover', swallow);
    window.addEventListener('drop', swallow);
    return () => {
      window.removeEventListener('dragover', swallow);
      window.removeEventListener('drop', swallow);
    };
  }, []);

  // PWA share target: the service worker parked the files in a cache and
  // redirected here.
  useEffect(() => {
    const flag = parseShareFlag(window.location.search);
    if (flag === 'none') return;

    // Strip the param synchronously, before any await, so a refresh mid-drain
    // can't re-enter this against an already-emptied cache.
    window.history.replaceState(null, '', window.location.pathname);
    setTab('photo');

    if (flag !== 'pending') {
      setError("Couldn't receive the shared photos — pick them here instead.");
      return;
    }

    void (async () => {
      try {
        const files = await drainShareInbox();
        if (files.length) await addFiles(files);
        else setError("Couldn't receive the shared photos — pick them here instead.");
      } catch {
        setError("Couldn't read the shared photos.");
      }
    })();
  }, []);

  function reset() {
    setRecipe(null);
    setCanonical(null);
    setError(null);
    setPhotos([]);
  }

  if (recipe) {
    return (
      <div class="space-y-6">
        <button type="button" class="text-sm text-emerald-700 underline" onClick={reset}>
          ← Convert another recipe
        </button>
        {busy && <p class="text-sm text-slate-500">Updating…</p>}
        <div class="grid gap-6 lg:grid-cols-2">
          <RecipeEditor recipe={recipe} busy={busy} onChange={onRecipeChange} onServingsChange={onServingsChange} />
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
          {/* The thumbnails and Convert button are siblings, not children, of
              this label — anything inside it re-opens the file picker. */}
          <label
            class={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-center text-slate-500 ${
              dragging
                ? 'border-emerald-500 bg-emerald-50'
                : 'border-slate-300 hover:border-emerald-400'
            }`}
            onDragEnter={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              void addFiles(e.dataTransfer?.files ?? []);
            }}
          >
            <span>📷 Tap to add photos or screenshots of one recipe</span>
            <span class="mt-1 text-xs text-slate-400">
              Drop or paste them too — up to {IMAGE_LIMITS.MAX_COUNT} pages of the same recipe
            </span>
            <input
              type="file"
              accept="image/*"
              multiple
              class="hidden"
              disabled={busy || preparing}
              onChange={(e) => {
                const input = e.target as HTMLInputElement;
                void addFiles(input.files ?? []);
                // Let the same file be re-picked after a remove — a file input
                // won't re-fire change for an unchanged value.
                input.value = '';
              }}
            />
          </label>

          {photos.length > 0 && (
            <>
              <div class="flex items-center justify-between text-sm text-slate-600">
                <span>
                  {photos.length} photo{photos.length === 1 ? '' : 's'} · combined into one recipe,
                  in this order
                </span>
                <button
                  type="button"
                  class="text-xs text-slate-500 underline hover:text-slate-700"
                  onClick={() => setPhotos([])}
                >
                  Clear all
                </button>
              </div>

              <ol class="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {photos.map((photo, i) => (
                  <li
                    key={photo.id}
                    class="relative overflow-hidden rounded-lg border border-slate-200 bg-white"
                  >
                    <img src={photo.dataUrl} alt="" class="h-24 w-full object-cover" />
                    <span class="absolute left-1 top-1 rounded bg-slate-900/70 px-1.5 py-0.5 font-mono text-xs text-white">
                      {i + 1}
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove photo ${i + 1}`}
                      class="absolute right-1 top-1 rounded bg-white/90 px-1.5 py-0.5 text-xs text-slate-600 hover:bg-white"
                      onClick={() => setPhotos((prev) => prev.filter((p) => p.id !== photo.id))}
                    >
                      ✕
                    </button>
                    <div class="absolute inset-x-1 bottom-1 flex justify-between">
                      <button
                        type="button"
                        aria-label={`Move photo ${i + 1} earlier`}
                        disabled={i === 0}
                        class="rounded bg-white/90 px-1.5 text-xs text-slate-600 hover:bg-white disabled:opacity-30"
                        onClick={() => movePhoto(i, -1)}
                      >
                        ←
                      </button>
                      <button
                        type="button"
                        aria-label={`Move photo ${i + 1} later`}
                        disabled={i === photos.length - 1}
                        class="rounded bg-white/90 px-1.5 text-xs text-slate-600 hover:bg-white disabled:opacity-30"
                        onClick={() => movePhoto(i, 1)}
                      >
                        →
                      </button>
                    </div>
                  </li>
                ))}
              </ol>

              <button
                type="button"
                disabled={busy || preparing}
                class="w-full rounded-lg bg-emerald-600 py-2 font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                onClick={submitPhotos}
              >
                {busy
                  ? 'Converting…'
                  : `Convert ${photos.length} photo${photos.length === 1 ? '' : 's'} to TM7`}
              </button>
            </>
          )}

          {preparing && <p class="text-center text-sm text-slate-500">Preparing photos…</p>}
          {busy && <p class="text-center text-sm text-slate-500">Reading the photos…</p>}
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
