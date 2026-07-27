/**
 * Ingest a recipe from one or more photos/screenshots. This is purely an
 * LLM-vision task (rules don't do OCR), so it delegates to the LLM layer.
 *
 * Several images are treated as pages of a SINGLE recipe — a long recipe
 * captured in a few scrolls, or a cookbook spread — and merged into one
 * CanonicalRecipe by one vision call.
 */
import type { CanonicalRecipe } from '../tm/types';
import { extractFromImages, hasLLM, type ImageInput } from '../llm';

type MediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

const SUPPORTED: Record<string, MediaType> = {
  'image/jpeg': 'image/jpeg',
  'image/jpg': 'image/jpeg',
  'image/png': 'image/png',
  'image/webp': 'image/webp',
  'image/gif': 'image/gif',
};

/** Pages of one recipe. Mirrors IMAGE_LIMITS in src/lib/image/prepare.ts —
 *  the client caps for UX, this caps because /api/ingest is a public endpoint. */
const MAX_IMAGES = 8;
/** Total base64 characters. Vercel rejects bodies over ~4.5 MB before our code
 *  runs; this guards the band underneath that, so a caller can't hand the model
 *  an arbitrarily expensive batch. */
const MAX_TOTAL_BASE64 = 4_400_000;

/** The request payload was unusable — caller error, not a failure to read. */
export class ImageInputError extends Error {}
/** The images were fine, but no recipe came back out of them. */
export class ImageReadError extends Error {}

/**
 * Pure. Validate and normalize an ingest body's image payload, accepting both
 * the current `{ images: [...] }` shape and the original single-image
 * `{ imageBase64, mimeType }` one. Throws ImageInputError with a message that
 * names the offending photo by its 1-based position.
 */
export function normalizeImageInputs(body: unknown): ImageInput[] {
  const raw = collect(body);
  if (!raw.length) throw new ImageInputError('Provide at least one image.');
  if (raw.length > MAX_IMAGES) {
    throw new ImageInputError(`Too many photos — ${MAX_IMAGES} at a time (got ${raw.length}).`);
  }

  const images = raw.map((entry, i) => {
    const base64 = String((entry as any)?.base64 ?? '');
    const mimeType = String((entry as any)?.mimeType ?? 'image/jpeg');
    if (!base64) throw new ImageInputError(`Photo ${i + 1} has no image data.`);
    const mediaType = SUPPORTED[mimeType.toLowerCase()];
    if (!mediaType) {
      throw new ImageInputError(
        `Photo ${i + 1} is an unsupported type ("${mimeType}"). Use JPEG, PNG, WebP, or GIF.`,
      );
    }
    return { base64, mimeType: mediaType };
  });

  const total = images.reduce((sum, img) => sum + img.base64.length, 0);
  if (total > MAX_TOTAL_BASE64) {
    throw new ImageInputError('Those photos are too large to upload together. Send fewer.');
  }
  return images;
}

function collect(body: unknown): unknown[] {
  const b = body as any;
  if (Array.isArray(b?.images)) return b.images;
  // Original single-image shape, still accepted.
  if (b?.imageBase64) return [{ base64: b.imageBase64, mimeType: b.mimeType ?? 'image/jpeg' }];
  return [];
}

export async function ingestFromImages(images: ImageInput[]): Promise<CanonicalRecipe> {
  if (!hasLLM()) {
    throw new ImageInputError(
      'Photo import needs an AI_GATEWAY_API_KEY (vision). Set it in your .env.',
    );
  }
  const recipe = await extractFromImages(images);
  if (!recipe || !recipe.steps.length) {
    throw new ImageReadError(
      images.length > 1
        ? 'Could not read a recipe from those photos. Try clearer shots, or fewer of them.'
        : 'Could not read a recipe from that image. Try a clearer photo.',
    );
  }
  return recipe;
}
