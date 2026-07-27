/**
 * POST /api/ingest
 * Body: { url }
 *     | { images: [{ base64, mimeType }] }   — pages of ONE recipe, in order
 *     | { imageBase64, mimeType }            — original single-image shape
 *     | { text }
 * Returns: CanonicalRecipe
 *
 * Network + LLM live here on the server; the browser never sees the API key.
 */
export const prerender = false;

import type { APIRoute } from 'astro';
import { ingestFromUrl } from '../../lib/ingest/fromUrl';
import {
  ingestFromImages,
  normalizeImageInputs,
  ImageInputError,
  ImageReadError,
} from '../../lib/ingest/fromImage';
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
    if (body.images || body.imageBase64) {
      return json(await ingestFromImages(normalizeImageInputs(body)));
    }
    if (body.text) {
      if (!hasLLM()) return json({ error: 'Pasting text needs an AI_GATEWAY_API_KEY.' }, 400);
      const recipe = await extractFromText(String(body.text));
      if (!recipe?.steps.length) return json({ error: 'Could not parse a recipe from that text.' }, 422);
      return json(recipe);
    }
    return json({ error: 'Provide a url, images, or text.' }, 400);
  } catch (err) {
    // Bad payload is the caller's fault (400); readable-but-unparseable is 422;
    // anything else is an upstream failure (502), as before.
    const status =
      err instanceof ImageInputError ? 400 : err instanceof ImageReadError ? 422 : 502;
    return json({ error: err instanceof Error ? err.message : 'Ingest failed' }, status);
  }
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
