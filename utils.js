import { MAIN_PROTEIN_MAP } from "./constants.js";

export function normalizeToProtein(ingredientText) {
  const t = ingredientText.replace(/[\s　].*/g, "");
  for (const [key, val] of Object.entries(MAIN_PROTEIN_MAP)) {
    if (t.includes(key)) return val;
  }
  return null;
}

export function getRecipeProteins(recipe) {
  const found = new Set();
  for (const ing of recipe.ingredients) {
    const p = normalizeToProtein(ing);
    if (p) found.add(p);
  }
  return [...found];
}

export function collectOtherIngredients(recipes) {
  const set = new Set();
  for (const r of recipes) {
    for (const ing of r.ingredients) {
      const name = ing.split(/[\s　]/)[0].trim();
      if (name && !normalizeToProtein(ing)) set.add(name);
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, "ja"));
}
