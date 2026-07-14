/**
 * POST /api/convert
 * Body: { recipe: CanonicalRecipe, targetServings?: number, aiFallback?: boolean }
 * Returns: TMRecipe
 *
 * Runs the deterministic rules conversion, then (optionally, if a key is set)
 * asks the LLM to fill in steps the rules couldn't map. Any LLM-proposed
 * setting is re-validated through applyGuardrails — the model can't bypass the
 * device limits.
 */
export const prerender = false;

import type { APIRoute } from 'astro';
import { convertRecipe, applyReview } from '../../lib/tm/convert';
import { reviewConversion, hasLLM } from '../../lib/llm';
import type { CanonicalRecipe } from '../../lib/tm/types';

export const POST: APIRoute = async ({ request }) => {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const recipe = body.recipe as CanonicalRecipe | undefined;
  if (!recipe?.steps) return json({ error: 'Missing recipe' }, 400);

  // 1. Deterministic rules draft (also the offline / no-key result).
  const tm = convertRecipe(recipe, { targetServings: body.targetServings });

  // 2. Optional whole-recipe LLM review pass — corrects the draft in context,
  //    then applyReview re-validates every setting through the guardrails.
  if (body.aiFallback && hasLLM()) {
    try {
      const reviews = await reviewConversion(recipe, tm.tmSteps);
      if (reviews) return json(applyReview(tm, reviews));
    } catch {
      // Review failed — fall back to the rules draft below.
    }
  }

  return json(tm);
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
