/**
 * LLM layer — the ONLY place the app talks to a model.
 *
 * Uses an OpenAI-compatible client so it works with any gateway. It defaults to
 * **opencode Zen** (https://opencode.ai/zen/v1), a curated OpenAI-compatible
 * gateway (GPT-5 / Claude / Gemini / Qwen / …). Configure via env:
 *   OPENCODE_ZEN_API_KEY  — your key (or AI_API_KEY / OPENAI_API_KEY)
 *   AI_BASE_URL           — gateway base URL (default opencode Zen)
 *   AI_MODEL              — a model id the gateway exposes (vision-capable for
 *                           photo import; see opencode `/models`)
 *
 * Per the hybrid design the LLM only does extraction (vision for photos,
 * parsing messy pages) and proposes settings for steps the rules can't map —
 * and every proposed setting is re-validated by applyGuardrails, so the model
 * can never emit an unsafe dial. Degrades gracefully: no key → helpers return
 * null and callers fall back to non-LLM behaviour.
 */
import OpenAI from 'openai';
import type { CanonicalRecipe, TMSetting } from './tm/types';

const env = (k: string) => process.env[k] ?? (import.meta.env as any)?.[k];

const API_KEY = env('OPENCODE_ZEN_API_KEY') ?? env('AI_API_KEY') ?? env('OPENAI_API_KEY');
const BASE_URL = env('AI_BASE_URL') ?? 'https://opencode.ai/zen/v1';
// Haiku is the default: cheap, vision-capable, and fully effective for recipe
// extraction (verified OCR + JSON). Override with AI_MODEL for more headroom.
const MODEL = env('AI_MODEL') ?? 'claude-haiku-4-5';

export function hasLLM(): boolean {
  return Boolean(API_KEY);
}

function client(): OpenAI {
  return new OpenAI({ apiKey: API_KEY, baseURL: BASE_URL });
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

async function complete(content: OpenAI.Chat.ChatCompletionMessageParam['content']): Promise<string> {
  const res = await client().chat.completions.create({
    model: MODEL,
    max_tokens: 2048,
    messages: [{ role: 'user', content } as OpenAI.Chat.ChatCompletionMessageParam],
  });
  return res.choices[0]?.message?.content ?? '';
}

/** Vision: extract a recipe from a photo/screenshot. */
export async function extractFromImage(
  base64: string,
  mimeType: string,
): Promise<CanonicalRecipe | null> {
  if (!hasLLM()) return null;
  const text = await complete([
    { type: 'text', text: `Extract the recipe from this image. ${RECIPE_SHAPE}` },
    { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
  ]);
  const raw = parseJson<any>(text);
  return raw ? normalizeRecipe(raw) : null;
}

/** Parse a recipe out of free text (used when a URL has no structured data). */
export async function extractFromText(
  text: string,
  sourceUrl?: string,
): Promise<CanonicalRecipe | null> {
  if (!hasLLM()) return null;
  const out = await complete(`Extract the recipe from the following text. ${RECIPE_SHAPE}\n\n---\n${text.slice(0, 12000)}`);
  const raw = parseJson<any>(out);
  return raw ? normalizeRecipe(raw, sourceUrl) : null;
}

/** Suggest a TM setting for a step the rules engine couldn't map. The result
 * MUST still be passed through applyGuardrails by the caller. */
export async function suggestSetting(stepText: string): Promise<TMSetting | null> {
  if (!hasLLM()) return null;
  const out = await complete(`You are a Thermomix TM7 expert. Assume ALL accessories are available
(Cutter+ for slicing/grating/spiralizing, Blade Cover & Peeler, butterfly whisk, Varoma).
For this single recipe step, propose the setting.
Step: "${stepText}"

Return ONLY JSON: { "timeSec": number|null, "tempC": number|"Varoma"|null, "speed": number|"dough"|null, "reverse": boolean, "mode": "cook"|"steam"|"dough"|"browning"|"sousvide"|"blend"|"warmup"|"prep"|"slicer"|"grater"|"spiralizer"|"peeler" }
Rules: temperature 37–160 °C only; speed 0–10; "Varoma" for steaming; "dough" speed for kneading;
use accessory modes (slicer/grater/spiralizer/peeler) for cutting/peeling — they need no time/temp/speed;
if the step is just prep/adding ingredients use mode "prep" with no time/temp/speed.`);
  const raw = parseJson<any>(out);
  if (!raw) return null;
  const setting: TMSetting = {};
  if (typeof raw.timeSec === 'number') setting.timeSec = raw.timeSec;
  if (raw.tempC === 'Varoma' || typeof raw.tempC === 'number') setting.tempC = raw.tempC;
  if (raw.speed === 'dough' || typeof raw.speed === 'number') setting.speed = raw.speed;
  if (raw.reverse === true) setting.reverse = true;
  if (typeof raw.mode === 'string') setting.mode = raw.mode;
  return setting;
}
