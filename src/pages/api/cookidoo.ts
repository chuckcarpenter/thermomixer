/**
 * POST /api/cookidoo — create a recipe in the user's own Cookidoo account via
 * Cookidoo's UNOFFICIAL internal API. Beta, at the user's own risk.
 *
 * Body:
 *   { recipe, market, dryRun?, auth: { mode: 'password', email, password }
 *                              | { mode: 'token', cookie } }
 *
 * SECURITY: credentials are pass-through only. They are used for a single
 * login/create and are never stored, never written to disk, and never logged.
 * This handler deliberately performs NO logging of the request body, and error
 * messages never echo credentials.
 */
export const prerender = false;

import type { APIRoute } from 'astro';
import type { TMRecipe } from '../../lib/tm/types';
import { getMarket } from '../../lib/cookidoo/markets';
import { loginWithPassword, jarFromCookie, CookidooAuthError } from '../../lib/cookidoo/auth';
import { buildPayload, createRecipe, CookidooCreateError } from '../../lib/cookidoo/create';

export const POST: APIRoute = async ({ request }) => {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const recipe = body.recipe as TMRecipe | undefined;
  const market = getMarket(String(body.market ?? ''));
  const auth = body.auth ?? {};
  const dryRun = Boolean(body.dryRun);

  if (!recipe?.tmSteps?.length) return json({ error: 'Missing recipe.' }, 400);
  if (!market) return json({ error: 'Unknown or missing market.' }, 400);

  // Build the payload first — pure, no network, no secrets.
  const payload = buildPayload(recipe);

  try {
    // Authenticate (this is where credentials are used — once, then discarded).
    const jar =
      auth.mode === 'token'
        ? jarFromCookie(market, String(auth.cookie ?? ''))
        : await loginWithPassword(market, String(auth.email ?? ''), String(auth.password ?? ''));

    if (dryRun) {
      return json({
        ok: true,
        dryRun: true,
        authenticated: true,
        message:
          auth.mode === 'token'
            ? 'Session cookie accepted. Recipe payload built — nothing was created.'
            : 'Login succeeded. Recipe payload built — nothing was created.',
        preview: {
          recipeName: payload.recipeName,
          ingredients: payload.patch.ingredients.length,
          steps: payload.patch.instructions.length,
          yield: payload.patch.yield,
          tools: payload.patch.tools,
        },
      });
    }

    const result = await createRecipe(market, jar, payload);
    return json({ ok: true, recipeId: result.recipeId, recipeUrl: result.recipeUrl });
  } catch (err) {
    // Return a safe, credential-free message.
    if (err instanceof CookidooAuthError || err instanceof CookidooCreateError) {
      return json({ error: err.message }, 502);
    }
    return json({ error: 'Cookidoo request failed. This is an unofficial API and may have changed.' }, 502);
  }
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
