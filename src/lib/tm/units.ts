/**
 * Imperial → metric conversion for ingredients. Pure, one-way, idempotent.
 *
 * The TM7 has a built-in scale, so weights (g) and volumes (ml) are the
 * natural cooking format. Strategy:
 *  - cups of a KNOWN ingredient  → grams via a density table
 *  - cups of a liquid / unknown  → millilitres (240 ml/cup — honest volume)
 *  - oz → g (28.35), unless clearly a liquid → fl oz → ml (29.6)
 *  - lb → g, quart/pint/gallon → ml
 *  - tsp / tbsp / pinch are kept — they're universal and used by the TM7
 *  - already-metric (g/kg/ml/l) and count units (cloves, cans…) pass through
 */
import type { Ingredient } from './types';

const CUP_ML = 240;

/** Grams per cup for common dry/dense ingredients, matched by keyword. */
const DENSITY_PER_CUP: Array<[RegExp, number]> = [
  [/\b(all.purpose|plain|bread|self.raising|wheat)?\s*flour\b/i, 120],
  [/\bpowdered sugar|icing sugar|confectioner/i, 120],
  [/\bbrown sugar\b/i, 220],
  [/\bsugar\b/i, 200],
  [/\bbutter\b/i, 227],
  [/\brice\b/i, 190],
  [/\b(rolled |quick )?oats\b/i, 90],
  [/\bcocoa\b/i, 100],
  [/\bcornstarch|corn flour\b/i, 128],
  [/\b(grated|shredded).*(cheese|parmesan|cheddar|mozzarella)|(cheese|parmesan|cheddar|mozzarella).*(grated|shredded)\b/i, 110],
  [/\bbread\s*crumbs?\b/i, 110],
  [/\b(chopped |sliced )?(nuts?|almonds?|walnuts?|pecans?)\b/i, 120],
  [/\bchocolate chips?\b/i, 170],
  [/\bhoney|maple syrup|molasses|golden syrup\b/i, 340],
  [/\bpeas\b/i, 145],
  [/\bberries|blueberr|raspberr|strawberr/i, 150],
];

const LIQUID = /\b(water|milk|cream|buttermilk|juice|stock|broth|wine|beer|oil|vinegar|sauce|coffee|espresso|syrup)\b/i;

const KEEP = new Set(['tsp', 'teaspoon', 'teaspoons', 'tbsp', 'tablespoon', 'tablespoons', 'pinch', 'handful']);
const METRIC = new Set(['g', 'kg', 'mg', 'ml', 'l', 'gram', 'grams', 'litre', 'liter']);

function gramsPerCup(item: string): number | null {
  const hit = DENSITY_PER_CUP.find(([re]) => re.test(item));
  return hit ? hit[1] : null;
}

function roundAmount(v: number): number {
  if (v >= 20) return Math.round(v / 5) * 5;
  return Math.round(v * 2) / 2;
}

/** Convert one ingredient to metric. Non-convertible ingredients pass through
 * unchanged (same object), so this is safe to call repeatedly. */
export function toMetric(ing: Ingredient): Ingredient {
  const unit = ing.unit?.toLowerCase();
  if (!unit || ing.quantity == null || METRIC.has(unit) || KEEP.has(unit)) return ing;

  const q = ing.quantity;
  const item = `${ing.item} ${ing.note ?? ''}`;

  switch (unit) {
    case 'cup':
    case 'cups': {
      const g = gramsPerCup(item);
      if (g) return { ...ing, quantity: roundAmount(q * g), unit: 'g' };
      return { ...ing, quantity: roundAmount(q * CUP_ML), unit: 'ml' };
    }
    case 'oz':
    case 'ounce':
    case 'ounces':
      if (LIQUID.test(item)) return { ...ing, quantity: roundAmount(q * 29.6), unit: 'ml' };
      return { ...ing, quantity: roundAmount(q * 28.35), unit: 'g' };
    case 'lb':
    case 'lbs':
    case 'pound':
    case 'pounds':
      return { ...ing, quantity: roundAmount(q * 453.6), unit: 'g' };
    case 'quart':
    case 'quarts':
      return { ...ing, quantity: roundAmount(q * 946), unit: 'ml' };
    case 'pint':
    case 'pints':
      return { ...ing, quantity: roundAmount(q * 473), unit: 'ml' };
    case 'gallon':
    case 'gallons':
      return { ...ing, quantity: roundAmount(q * 3785), unit: 'ml' };
    default:
      return ing;
  }
}

/** True if any ingredient in the list would change under toMetric. */
export function hasImperial(ingredients: Ingredient[]): boolean {
  return ingredients.some((ing) => toMetric(ing) !== ing);
}
