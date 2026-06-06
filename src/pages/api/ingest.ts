/**
 * POST /api/ingest
 * Body: { url } | { imageBase64, mimeType } | { text }
 * Returns: CanonicalRecipe
 *
 * Network + LLM live here on the server; the browser never sees the API key.
 */
export const prerender = false;

import type { APIRoute } from 'astro';
import { ingestFromUrl } from '../../lib/ingest/fromUrl';
import { ingestFromImage } from '../../lib/ingest/fromImage';
import { extractFromText, hasLLM } from '../../lib/llm';

export const POST: APIRoute = async ({ request }) => {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  try {
    if (body.url) {
      return json(await ingestFromUrl(String(body.url)));
    }
    if (body.imageBase64) {
      return json(await ingestFromImage(String(body.imageBase64), String(body.mimeType ?? 'image/jpeg')));
    }
    if (body.text) {
      if (!hasLLM()) return json({ error: 'Pasting text needs an ANTHROPIC_API_KEY.' }, 400);
      const recipe = await extractFromText(String(body.text));
      if (!recipe?.steps.length) return json({ error: 'Could not parse a recipe from that text.' }, 422);
      return json(recipe);
    }
    return json({ error: 'Provide a url, imageBase64, or text.' }, 400);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Ingest failed' }, 502);
  }
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
