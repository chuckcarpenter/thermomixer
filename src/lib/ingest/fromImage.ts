/**
 * Ingest a recipe from a photo/screenshot. This is purely an LLM-vision task
 * (rules don't do OCR), so it delegates to the LLM layer.
 */
import type { CanonicalRecipe } from '../tm/types';
import { extractFromImage, hasLLM } from '../llm';

type MediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

const SUPPORTED: Record<string, MediaType> = {
  'image/jpeg': 'image/jpeg',
  'image/jpg': 'image/jpeg',
  'image/png': 'image/png',
  'image/webp': 'image/webp',
  'image/gif': 'image/gif',
};

export async function ingestFromImage(
  base64: string,
  mimeType: string,
): Promise<CanonicalRecipe> {
  if (!hasLLM()) {
    throw new Error('Photo import needs an ANTHROPIC_API_KEY (vision). Set it in your .env.');
  }
  const mediaType = SUPPORTED[mimeType.toLowerCase()];
  if (!mediaType) {
    throw new Error(`Unsupported image type "${mimeType}". Use JPEG, PNG, WebP, or GIF.`);
  }
  const recipe = await extractFromImage(base64, mediaType);
  if (!recipe || !recipe.steps.length) {
    throw new Error('Could not read a recipe from that image. Try a clearer photo.');
  }
  return recipe;
}
