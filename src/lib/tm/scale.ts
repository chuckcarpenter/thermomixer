/**
 * Quantity and time scaling. Pure functions.
 *
 * Ingredient quantities scale linearly with servings. Thermomix cooking times
 * do NOT scale linearly — the well-known rule of thumb is +20% time when
 * roughly doubling a batch and −20% when roughly halving it. We apply a capped
 * adjustment proportional to how far the batch size moves from the original.
 */
import type { CanonicalRecipe, Ingredient } from './types';

export function scaleIngredients(
  ingredients: Ingredient[],
  factor: number,
): Ingredient[] {
  if (factor === 1) return ingredients;
  return ingredients.map((ing) =>
    ing.quantity == null
      ? ing
      : { ...ing, quantity: roundQuantity(ing.quantity * factor) },
  );
}

/** Adjust a Thermomix cooking time for a changed batch size. A factor of 2
 * adds ~20%, a factor of 0.5 subtracts ~20%; clamped to ±20%. */
export function scaleCookTime(timeSec: number, factor: number): number {
  if (factor === 1) return timeSec;
  // +20% per doubling, symmetric for halving, clamped.
  const adjust = Math.max(-0.2, Math.min(0.2, (factor - 1) * 0.2));
  return Math.round(timeSec * (1 + adjust));
}

/** Compute the scaling factor from the recipe's servings to a target. */
export function servingsFactor(recipe: CanonicalRecipe, targetServings?: number): number {
  if (!targetServings || !recipe.servings || recipe.servings <= 0) return 1;
  return targetServings / recipe.servings;
}

function roundQuantity(q: number): number {
  if (q >= 10) return Math.round(q);
  if (q >= 1) return Math.round(q * 4) / 4; // nearest quarter
  // Small amounts (spices!): eighth precision, and NEVER round a nonzero
  // quantity down to 0 — 1/8 tsp of salt scaled down is still a pinch.
  const eighth = Math.round(q * 8) / 8;
  return eighth > 0 ? eighth : Math.max(q, 1 / 16);
}
