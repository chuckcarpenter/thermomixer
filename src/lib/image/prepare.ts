/**
 * Browser-side photo prep for the multi-photo ingest path.
 *
 * A recipe rarely fits in one screenshot, so the app takes several — and a few
 * untouched phone photos are far too big for a serverless request body. This
 * decodes each one, downscales it to the largest dimension the vision model
 * actually uses, and re-encodes as JPEG. It returns a single data URL that acts
 * as BOTH the thumbnail `src` and the POST payload, so there's no object-URL
 * lifecycle to manage and nothing is encoded twice.
 *
 * `preparePhoto` is browser-only (Image + canvas), but the DOM is touched only
 * inside function bodies and every decision it makes is factored into a pure
 * exported helper — so this module imports cleanly in node and the maths is
 * unit-tested without jsdom.
 */

export const IMAGE_LIMITS = {
  /** Pages of one recipe. Eight covers a cookbook spread or a scroll chain. */
  MAX_COUNT: 8,
  /** The standard-resolution vision tier downsamples past this, so anything
   *  larger is upload bandwidth spent on pixels the model discards. */
  MAX_EDGE: 1568,
  JPEG_QUALITY: 0.85,
  /** Total base64 characters across the batch ≈ bytes on the wire. Vercel caps
   *  function request bodies at ~4.5 MB; leave room for the JSON envelope. */
  MAX_TOTAL_BASE64: 4_000_000,
  /** An already-supported image this small ships untouched — re-encoding a PNG
   *  screenshot to JPEG puts ringing on the very text the model has to read. */
  PASSTHROUGH_MAX_BYTES: 900_000,
} as const;

/** Types the server allowlist accepts, so passing them through is safe. */
const PASSTHROUGH_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export interface PreparedPhoto {
  id: string;
  name: string;
  /** Doubles as the thumbnail src and the source of `base64`. */
  dataUrl: string;
  base64: string;
  mimeType: string;
  /** base64 length — what this photo actually costs on the wire. */
  wireBytes: number;
  width: number;
  height: number;
  /** False when the original bytes were small enough to ship as-is. */
  reencoded: boolean;
}

/** Pure. Target dimensions for a maximum long edge. Never upscales. */
export function planDownscale(
  width: number,
  height: number,
  maxEdge: number = IMAGE_LIMITS.MAX_EDGE,
): { width: number; height: number; scaled: boolean } {
  const longest = Math.max(width, height);
  if (!Number.isFinite(longest) || longest <= 0) return { width: 0, height: 0, scaled: false };
  if (longest <= maxEdge) return { width, height, scaled: false };
  const ratio = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
    scaled: true,
  };
}

/**
 * Pure. True when the original file can be sent untouched: small enough, already
 * within the model's resolution, and a type the server accepts. HEIC always
 * returns false — it must be re-encoded or the server allowlist rejects it.
 */
export function shouldPassThrough(
  mimeType: string,
  bytes: number,
  longEdge: number,
  maxEdge: number = IMAGE_LIMITS.MAX_EDGE,
  maxBytes: number = IMAGE_LIMITS.PASSTHROUGH_MAX_BYTES,
): boolean {
  return longEdge <= maxEdge && bytes <= maxBytes && PASSTHROUGH_TYPES.has(mimeType.toLowerCase());
}

export type BudgetCheck =
  | { ok: true; totalBytes: number }
  | { ok: false; totalBytes: number; error: string };

/** Pure. Does this batch fit the count cap and the request-body budget? */
export function checkPayloadBudget(
  wireBytes: number[],
  maxTotal: number = IMAGE_LIMITS.MAX_TOTAL_BASE64,
  maxCount: number = IMAGE_LIMITS.MAX_COUNT,
): BudgetCheck {
  const totalBytes = wireBytes.reduce((sum, n) => sum + n, 0);
  if (!wireBytes.length) return { ok: false, totalBytes, error: 'Add at least one photo.' };
  if (wireBytes.length > maxCount) {
    return { ok: false, totalBytes, error: `Too many photos — ${maxCount} at a time.` };
  }
  if (totalBytes > maxTotal) {
    return {
      ok: false,
      totalBytes,
      error: `Those photos total ${mb(totalBytes)} MB to upload (max ${mb(maxTotal)} MB). Remove one, or crop tighter.`,
    };
  }
  return { ok: true, totalBytes };
}

const mb = (n: number) => (n / 1_000_000).toFixed(1);

/** Decode, downscale if needed, and package a file for upload + preview. */
export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);
    const width = img.naturalWidth;
    const height = img.naturalHeight;
    if (!width || !height) throw new Error('zero-size decode');

    if (shouldPassThrough(file.type, file.size, Math.max(width, height))) {
      return pack(file, await readAsDataUrl(file), file.type, width, height, false);
    }

    const target = planDownscale(width, height);
    const canvas = document.createElement('canvas');
    canvas.width = target.width;
    canvas.height = target.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');

    // Aliased glyph edges wreck OCR, so ask for the good resampler.
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    // JPEG has no alpha channel: without this, a transparent screenshot
    // composites against transparent black and comes out black-on-black.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, target.width, target.height);
    ctx.drawImage(img, 0, 0, target.width, target.height);

    const dataUrl = canvas.toDataURL('image/jpeg', IMAGE_LIMITS.JPEG_QUALITY);
    return pack(file, dataUrl, 'image/jpeg', target.width, target.height, true);
  } catch {
    // Undecodable means we also can't downscale, orient, or size-check it, so
    // reject this one file by name rather than shipping bytes blind.
    throw new Error(`Couldn't read "${file.name || 'that image'}" — try a JPEG or PNG.`);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function pack(
  file: File,
  dataUrl: string,
  mimeType: string,
  width: number,
  height: number,
  reencoded: boolean,
): PreparedPhoto {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  return {
    id: `${file.name}:${file.size}:${file.lastModified}:${Math.random().toString(36).slice(2, 8)}`,
    name: file.name || 'photo',
    dataUrl,
    base64,
    mimeType,
    wireBytes: base64.length,
    width,
    height,
    reencoded,
  };
}

/**
 * An <img> element rather than createImageBitmap: HTMLImageElement applies EXIF
 * orientation by default on every target browser (so portrait phone photos
 * aren't sideways), and Apple platforms decode HEIC here for free — meaning the
 * JPEG re-encode above normalizes the type before the server ever sees it.
 * createImageBitmap's `imageOrientation` default changed mid-spec, so it is
 * either redundant or silently ignored depending on the Safari version.
 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('decode failed'));
    img.src = src;
  });
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('read failed'));
    reader.readAsDataURL(file);
  });
}
