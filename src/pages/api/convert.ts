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
import { convertRecipe, applyGuardrails } from '../../lib/tm/convert';
import { suggestSetting, hasLLM } from '../../lib/llm';
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

  const tm = convertRecipe(recipe, { targetServings: body.targetServings });

  if (body.aiFallback && hasLLM()) {
    await Promise.all(
      tm.tmSteps.map(async (step) => {
        // Only fill genuinely-unmapped steps — not off-device ones.
        if (!step.needsReview || step.note?.startsWith('Off-device')) return;
        const suggestion = await suggestSetting(step.text);
        if (!suggestion) return;
        const { setting } = applyGuardrails(suggestion);
        step.setting = setting;
        step.needsReview = false;
        step.note = 'AI suggestion (review me)';
      }),
    );
  }

  return json(tm);
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
