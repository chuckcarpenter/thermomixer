/**
 * LLM layer — the *only* place the app talks to a model. Per the hybrid
 * design, the LLM does extraction (vision for photos, parsing messy pages)
 * and proposes settings for steps the rules engine can't map. Everything it
 * returns for a setting is re-validated by `applyGuardrails`, so the model can
 * never emit an unsafe dial.
 *
 * Degrades gracefully: if ANTHROPIC_API_KEY is unset, the helpers return null
 * and callers fall back to non-LLM behaviour.
 */
import Anthropic from '@anthropic-ai/sdk';
import type { CanonicalRecipe, TMSetting } from './tm/types';

const API_KEY = process.env.ANTHROPIC_API_KEY ?? import.meta.env?.ANTHROPIC_API_KEY;
const MODEL = process.env.LLM_MODEL ?? import.meta.env?.LLM_MODEL ?? 'claude-sonnet-4-6';

export function hasLLM(): boolean {
  return Boolean(API_KEY);
}

function client(): Anthropic {
  return new Anthropic({ apiKey: API_KEY });
}

const RECIPE_SHAPE = `Return ONLY a JSON object, no prose, matching:
{
  "title": string,
  "servings": number | null,
  "prepTimeMin": number | null,
  "cookTimeMin": number | null,
  "ingredients": [{ "quantity": number | null, "unit": string | null, "item": string, "note": string | null }],
  "steps": [string]   // each a single discrete instruction
}
Split the method into discrete numbered actions. Keep quantities metric where possible.`;

/** Pull the first JSON object out of a model response. */
function parseJson<T>(text: string): T | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as T;
  } catch {
    return null;
  }
}

function normalizeRecipe(raw: any, sourceUrl?: string): CanonicalRecipe {
  return {
    title: raw.title ?? 'Untitled recipe',
    servings: raw.servings ?? undefined,
    prepTimeMin: raw.prepTimeMin ?? undefined,
    cookTimeMin: raw.cookTimeMin ?? undefined,
    ingredients: Array.isArray(raw.ingredients)
      ? raw.ingredients.map((i: any) => ({
          quantity: typeof i.quantity === 'number' ? i.quantity : undefined,
          unit: i.unit ?? undefined,
          item: i.item ?? String(i),
          note: i.note ?? undefined,
        }))
      : [],
    steps: Array.isArray(raw.steps) ? raw.steps.map(String) : [],
    sourceUrl,
  };
}

/** Vision: extract a recipe from a photo/screenshot. */
export async function extractFromImage(
  base64: string,
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
): Promise<CanonicalRecipe | null> {
  if (!hasLLM()) return null;
  const res = await client().messages.create({
    model: MODEL,
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          { type: 'text', text: `Extract the recipe from this image. ${RECIPE_SHAPE}` },
        ],
      },
    ],
  });
  const text = res.content.find((c) => c.type === 'text')?.text ?? '';
  const raw = parseJson<any>(text);
  return raw ? normalizeRecipe(raw) : null;
}

/** Parse a recipe out of free text (used when a URL has no structured data). */
export async function extractFromText(
  text: string,
  sourceUrl?: string,
): Promise<CanonicalRecipe | null> {
  if (!hasLLM()) return null;
  const res = await client().messages.create({
    model: MODEL,
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: `Extract the recipe from the following text. ${RECIPE_SHAPE}\n\n---\n${text.slice(0, 12000)}`,
      },
    ],
  });
  const out = res.content.find((c) => c.type === 'text')?.text ?? '';
  const raw = parseJson<any>(out);
  return raw ? normalizeRecipe(raw, sourceUrl) : null;
}

/** Suggest a TM setting for a step the rules engine couldn't map. The result
 * MUST still be passed through applyGuardrails by the caller. */
export async function suggestSetting(stepText: string): Promise<TMSetting | null> {
  if (!hasLLM()) return null;
  const res = await client().messages.create({
    model: MODEL,
    max_tokens: 512,
    messages: [
      {
        role: 'user',
        content: `You are a Thermomix TM7 expert. For this single recipe step, propose the dial setting.
Step: "${stepText}"

Return ONLY JSON: { "timeSec": number|null, "tempC": number|"Varoma"|null, "speed": number|"dough"|null, "reverse": boolean, "mode": "cook"|"steam"|"dough"|"browning"|"sousvide"|"blend"|"warmup"|"prep" }
Rules: temperature 37–160 °C only; speed 0–10; use "Varoma" for steaming; use "dough" speed for kneading; if the step is just prep/adding ingredients use mode "prep" with no time/temp/speed.`,
      },
    ],
  });
  const text = res.content.find((c) => c.type === 'text')?.text ?? '';
  const raw = parseJson<any>(text);
  if (!raw) return null;
  const setting: TMSetting = {};
  if (typeof raw.timeSec === 'number') setting.timeSec = raw.timeSec;
  if (raw.tempC === 'Varoma' || typeof raw.tempC === 'number') setting.tempC = raw.tempC;
  if (raw.speed === 'dough' || typeof raw.speed === 'number') setting.speed = raw.speed;
  if (raw.reverse === true) setting.reverse = true;
  if (typeof raw.mode === 'string') setting.mode = raw.mode;
  return setting;
}
