/**
 * Map a converted recipe to Cookidoo's (unofficial) "created recipes" API and
 * create it. Payload field names reference the croeer/cookiput project.
 *
 * `buildPayload` is pure and unit-tested; `createRecipe` performs the two-step
 * create (POST returns an id, then PATCH fills the recipe) using an
 * authenticated CookieJar.
 */
import type { TMRecipe } from '../tm/types';
import { formatIngredient, formatStepLine } from '../tm/format';
import type { Market } from './markets';
import { CookieJar, fetchFollow } from './http';

interface CookidooItem {
  type: 'INGREDIENT' | 'STEP';
  text: string;
}

export interface CookidooPayload {
  /** Sent with the initial POST to create the (named) recipe. */
  recipeName: string;
  /** Sent with the follow-up PATCH to populate the recipe. */
  patch: {
    name: string;
    ingredients: CookidooItem[];
    instructions: CookidooItem[];
    tools: string[];
    yield?: { value: number; unitText: string };
    totalTime?: number; // seconds
    prepTime?: number; // seconds
  };
}

/** Pure: TMRecipe → Cookidoo create/patch payload. TTS (time/temp/speed)
 * annotations ride inside each step's text via formatStepLine. */
export function buildPayload(recipe: TMRecipe): CookidooPayload {
  const name = recipe.title?.trim() || 'Untitled recipe';
  const patch: CookidooPayload['patch'] = {
    name,
    ingredients: recipe.ingredients.map((ing) => ({
      type: 'INGREDIENT',
      text: formatIngredient(ing),
    })),
    instructions: recipe.tmSteps.map((step) => ({
      type: 'STEP',
      text: formatStepLine(step.text, step.setting),
    })),
    tools: ['TM7'],
  };
  if (recipe.servings) patch.yield = { value: recipe.servings, unitText: 'portion' };
  const prep = recipe.prepTimeMin ? recipe.prepTimeMin * 60 : 0;
  const cook = recipe.cookTimeMin ? recipe.cookTimeMin * 60 : 0;
  if (prep) patch.prepTime = prep;
  if (prep || cook) patch.totalTime = prep + cook;
  return { recipeName: name, patch };
}

export interface CreateResult {
  recipeId: string;
  recipeUrl: string;
}

export class CookidooCreateError extends Error {}

async function apiCall(
  jar: CookieJar,
  method: string,
  url: string,
  body: unknown,
): Promise<{ status: number; json: any; text: string }> {
  const token = jar.get('_oauth2_proxy');
  const { res, body: text } = await fetchFollow(url, jar, {
    method,
    body: JSON.stringify(body),
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      ...(token ? { 'v-token': token } : {}),
    },
    maxRedirects: 3,
  });
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON (e.g. an HTML error page) */
  }
  return { status: res.status, json, text };
}

/** Create the recipe in Cookidoo. Two steps: POST to mint an id, then PATCH the
 * content. Tools are set best-effort so an unknown-enum can't fail the recipe. */
export async function createRecipe(
  market: Market,
  jar: CookieJar,
  payload: CookidooPayload,
): Promise<CreateResult> {
  const base = `https://${market.host}/created-recipes/${market.locale}`;

  const created = await apiCall(jar, 'POST', base, { recipeName: payload.recipeName });
  if (created.status < 200 || created.status >= 300) {
    throw new CookidooCreateError(
      describeFailure('create the recipe', created.status, created.text),
    );
  }
  const recipeId: string | undefined = created.json?.recipeId ?? created.json?.id;
  if (!recipeId) {
    throw new CookidooCreateError('Cookidoo did not return a recipe id after creation.');
  }

  const { tools, ...core } = payload.patch;
  const patched = await apiCall(jar, 'PATCH', `${base}/${recipeId}`, core);
  if (patched.status < 200 || patched.status >= 300) {
    throw new CookidooCreateError(
      `Recipe was created (id ${recipeId}) but adding its contents failed: ` +
        describeFailure('update', patched.status, patched.text),
    );
  }

  // Best-effort: set the device tools. Never let this fail the whole create.
  try {
    await apiCall(jar, 'PATCH', `${base}/${recipeId}`, { tools });
  } catch {
    /* ignore */
  }

  return {
    recipeId,
    recipeUrl: `https://${market.host}/recipes/recipe/${market.locale}/${recipeId}`,
  };
}

function describeFailure(action: string, status: number, text: string): string {
  const snippet = text.replace(/\s+/g, ' ').slice(0, 200);
  if (status === 401 || status === 403) {
    return `not authorized to ${action} (status ${status}) — the session is invalid/expired or the account has no active Cookidoo subscription.`;
  }
  return `could not ${action} (status ${status})${snippet ? `: ${snippet}` : ''}.`;
}
