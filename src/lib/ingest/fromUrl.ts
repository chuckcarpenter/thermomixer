/**
 * Ingest a recipe from a URL.
 *
 * 1. Fetch the page ourselves with a browser User-Agent and parse
 *    schema.org/Recipe JSON-LD (what most recipe sites/blogs publish). We do
 *    our own fetch because library scrapers use a bare UA that many sites 403.
 * 2. If there's no usable structured data, strip the page to text and let the
 *    LLM extract a recipe (handles blogs with no JSON-LD).
 *
 * Note: some large sites (AllRecipes, Serious Eats) hard-block server fetches
 * with Cloudflare — for those, the photo or paste-text paths are the answer.
 */
import * as cheerio from 'cheerio';
import type { CanonicalRecipe, Ingredient } from '../tm/types';
import { extractFromText } from '../llm';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

export async function ingestFromUrl(url: string): Promise<CanonicalRecipe> {
  const res = await fetch(url, { headers: { 'user-agent': UA } });
  if (!res.ok) {
    throw new Error(
      `The site returned ${res.status} — it may block automated access. Try the photo or paste-text option.`,
    );
  }
  const html = await res.text();
  const $ = cheerio.load(html);

  const jsonLd = findRecipeJsonLd($);
  if (jsonLd) return fromJsonLd(jsonLd, url);

  // Fallback: hand readable text to the LLM.
  const text = readableText($);
  const viaLlm = await extractFromText(text, url);
  if (viaLlm && viaLlm.ingredients.length) return viaLlm;

  throw new Error(
    'No structured recipe data found, and no ANTHROPIC_API_KEY is set for the AI fallback. ' +
      'Try pasting the recipe text or a photo.',
  );
}

/** Find the first schema.org/Recipe node across all JSON-LD blocks. */
function findRecipeJsonLd($: cheerio.CheerioAPI): any | null {
  let found: any = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    if (found) return;
    let parsed: any;
    try {
      parsed = JSON.parse($(el).contents().text());
    } catch {
      return;
    }
    const candidates = Array.isArray(parsed) ? parsed : parsed['@graph'] ?? [parsed];
    for (const node of candidates) {
      const type = node?.['@type'];
      if (type === 'Recipe' || (Array.isArray(type) && type.includes('Recipe'))) {
        found = node;
        return;
      }
    }
  });
  return found;
}

function fromJsonLd(r: any, url: string): CanonicalRecipe {
  return {
    title: typeof r.name === 'string' ? r.name : 'Untitled recipe',
    servings: parseServings(r.recipeYield),
    prepTimeMin: parseMinutes(r.prepTime),
    cookTimeMin: parseMinutes(r.cookTime ?? r.totalTime),
    ingredients: asArray(r.recipeIngredient).map((l) => parseIngredientLine(String(l))),
    steps: flattenInstructions(r.recipeInstructions),
    image: pickImage(r.image),
    sourceUrl: url,
  };
}

/** recipeInstructions can be a string, string[], HowToStep[], or HowToSection[]
 * (each section nesting its own itemListElement). Flatten to plain strings. */
function flattenInstructions(instr: any): string[] {
  if (!instr) return [];
  if (typeof instr === 'string') {
    return instr.split(/\n+|(?<=\.)\s{2,}/).map((s) => s.trim()).filter(Boolean);
  }
  const out: string[] = [];
  for (const item of asArray(instr)) {
    if (typeof item === 'string') out.push(tidyStep(item));
    else if (item?.['@type'] === 'HowToSection' && item.itemListElement) {
      out.push(...flattenInstructions(item.itemListElement));
    } else if (item?.text) {
      out.push(tidyStep(String(item.text)));
    }
  }
  return out.filter(Boolean);
}

/** Some recipe plugins (e.g. WordPress Recipe Maker) append an ingredient list
 * onto the instruction text with no space — "…in the oven.2 c. egg noodles".
 * A period followed immediately by a digit/fraction is the tell; cut there. */
export function tidyStep(text: string): string {
  // A letter/bracket then a period then immediately a digit/fraction = the seam
  // (real decimals like "1.5" have a digit before the period, so they're safe).
  const cleaned = text.replace(/([a-zA-Z)\]])([.!?])(?=\d|[½¼¾⅓⅔])[\s\S]*$/, '$1$2');
  return cleaned.trim();
}

function pickImage(image: any): string | undefined {
  if (!image) return undefined;
  if (typeof image === 'string') return image;
  if (Array.isArray(image)) return pickImage(image[0]);
  return image.url ?? undefined;
}

function readableText($: cheerio.CheerioAPI): string {
  $('script, style, nav, header, footer, noscript, svg').remove();
  const main = $('article').text() || $('main').text() || $('body').text();
  return main.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function asArray<T>(v: T | T[] | undefined): T[] {
  return v == null ? [] : Array.isArray(v) ? v : [v];
}

/** Parse "4 servings" / "Serves 6" / ["4"] / 4 → number. */
function parseServings(raw?: string | string[] | number): number | undefined {
  if (raw == null) return undefined;
  if (typeof raw === 'number') return raw;
  const s = Array.isArray(raw) ? raw.join(' ') : raw;
  const m = s.match(/\d+/);
  return m ? parseInt(m[0], 10) : undefined;
}

/** Parse ISO-8601 ("PT1H30M") or "30 mins" → minutes. */
function parseMinutes(raw?: string): number | undefined {
  if (!raw) return undefined;
  const iso = raw.match(/P(?:T(?:(\d+)H)?(?:(\d+)M)?)/);
  if (iso && (iso[1] || iso[2])) {
    return parseInt(iso[1] ?? '0', 10) * 60 + parseInt(iso[2] ?? '0', 10);
  }
  const m = raw.match(/(\d+)\s*(h|hour|min)/i);
  if (!m) return undefined;
  const n = parseInt(m[1], 10);
  return /h/i.test(m[2]) ? n * 60 : n;
}

const UNITS = new Set([
  'g', 'kg', 'mg', 'ml', 'l', 'tsp', 'tbsp', 'cup', 'cups', 'oz', 'lb', 'lbs',
  'clove', 'cloves', 'pinch', 'handful', 'can', 'tin', 'slice', 'slices',
  'teaspoon', 'teaspoons', 'tablespoon', 'tablespoons', 'gram', 'grams',
]);

const FRACTIONS: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 0.333, '⅔': 0.667 };

/** Light parse of "200g plain flour" / "2 cloves garlic, minced" into parts.
 * Good enough for scaling + display; the user can edit anything off. */
export function parseIngredientLine(line: string): Ingredient {
  const text = line.trim();
  const qm = text.match(/^(\d+\s+\d+\/\d+|\d+\/\d+|\d*\.?\d+|[½¼¾⅓⅔])\s*/);
  let rest = text;
  let quantity: number | undefined;
  if (qm) {
    quantity = parseQuantity(qm[1]);
    rest = text.slice(qm[0].length);
  }
  let unit: string | undefined;
  const um = rest.match(/^([a-zA-Z]+)\.?\s+/);
  if (um && UNITS.has(um[1].toLowerCase())) {
    unit = um[1].toLowerCase();
    rest = rest.slice(um[0].length);
  }
  let note: string | undefined;
  const ci = rest.indexOf(',');
  if (ci > -1) {
    note = rest.slice(ci + 1).trim() || undefined;
    rest = rest.slice(0, ci).trim();
  }
  return { quantity, unit, item: rest.trim() || text, note };
}

function parseQuantity(s: string): number | undefined {
  s = s.trim();
  if (FRACTIONS[s] != null) return FRACTIONS[s];
  const mixed = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return parseInt(mixed[1], 10) + parseInt(mixed[2], 10) / parseInt(mixed[3], 10);
  const frac = s.match(/^(\d+)\/(\d+)$/);
  if (frac) return parseInt(frac[1], 10) / parseInt(frac[2], 10);
  const n = parseFloat(s);
  return Number.isNaN(n) ? undefined : n;
}
