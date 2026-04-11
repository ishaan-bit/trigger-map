/**
 * Nourishment Library - structured food/nutrition primitives for the Fuel mode.
 * Item data now lives in nourishmentCatalogue.js (~250 entries).
 */

import { NOURISHMENTS as CATALOGUE_NOURISHMENTS } from "./nourishmentCatalogue.js";

export const FOOD_TYPES = {
  meal:     { id: "meal",     label: "Full Meal",     labelHi: "\u092A\u0942\u0930\u093E \u092D\u094B\u091C\u0928" },
  snack:    { id: "snack",    label: "Snack",         labelHi: "\u0938\u094D\u0928\u0948\u0915" },
  drink:    { id: "drink",    label: "Drink",         labelHi: "\u092A\u0947\u092F" },
  ritual:   { id: "ritual",   label: "Food Ritual",   labelHi: "\u092D\u094B\u091C\u0928 \u0930\u093F\u091A\u0941\u0905\u0932" },
};

export const DIETS = {
  vegetarian: { id: "vegetarian", label: "Vegetarian", labelHi: "\u0936\u093E\u0915\u093E\u0939\u093E\u0930\u0940" },
  vegan:      { id: "vegan",      label: "Vegan",      labelHi: "\u0935\u0940\u0917\u0928" },
  nonVeg:     { id: "nonVeg",     label: "Non-Veg",    labelHi: "\u092E\u093E\u0902\u0938\u093E\u0939\u093E\u0930\u0940" },
  glutenFree: { id: "glutenFree", label: "Gluten-Free", labelHi: "\u0917\u094D\u0932\u0942\u091F\u0947\u0928-\u092B\u094D\u0930\u0940" },
};

export const CUISINES = {
  indian:        { id: "indian",        label: "Indian",        labelHi: "\u092D\u093E\u0930\u0924\u0940\u092F" },
  universal:     { id: "universal",     label: "Universal",     labelHi: "\u0938\u093E\u092E\u093E\u0928\u094D\u092F" },
  japanese:      { id: "japanese",      label: "Japanese",      labelHi: "\u091C\u093E\u092A\u093E\u0928\u0940" },
  mediterranean: { id: "mediterranean", label: "Mediterranean", labelHi: "\u092D\u0942\u092E\u0927\u094D\u092F\u0938\u093E\u0917\u0930\u0940\u092F" },
};

export const PREP_LEVELS = ["none", "minimal", "moderate"];

/** Nourishment primitives - sourced from nourishmentCatalogue.js */
export const NOURISHMENTS = CATALOGUE_NOURISHMENTS;

export function filterNourishments({ types, diets, cuisines, prepLevel, emotions } = {}) {
  // nonVeg users can eat everything — skip diet filter when only diet is nonVeg
  const effectiveDiets = diets?.length === 1 && diets[0] === "nonVeg" ? null : diets;
  return NOURISHMENTS.filter((n) => {
    if (types?.length && !types.includes(n.type)) return false;
    if (effectiveDiets?.length && !effectiveDiets.some((d) => n.diet.includes(d))) return false;
    if (cuisines?.length && !cuisines.some((c) => n.cuisine.includes(c))) return false;
    if (prepLevel && n.prepLevel !== prepLevel) return false;
    if (emotions?.length && !emotions.some((e) => n.emotionTags.includes(e))) return false;
    return true;
  });
}

export function pickNourishments(emotions, n = 2, { exclude = [], boost = [], diet, cuisine } = {}) {
  const pool = filterNourishments({ emotions, diets: diet ? [diet] : undefined, cuisines: cuisine ? [cuisine] : undefined });
  const excludeSet = new Set(exclude);
  const boostSet = new Set(boost);
  const candidates = pool.filter((item) => !excludeSet.has(item.id));

  const score = (item) =>
    (emotions.length ? emotions.filter((e) => item.emotionTags.includes(e)).length : 0)
    + (boostSet.has(item.id) ? 1.5 : 0)
    + Math.random() * 0.5;

  const scored = candidates.map((item) => ({ ...item, _score: score(item) }));
  scored.sort((a, b) => b._score - a._score);

  if (scored.length < n) {
    const usedIds = new Set(scored.map((item) => item.id));
    const dietPool = filterNourishments({ diets: diet ? [diet] : undefined, cuisines: cuisine ? [cuisine] : undefined });
    const backfill = dietPool
      .filter((item) => !excludeSet.has(item.id) && !usedIds.has(item.id))
      .map((item) => ({ ...item, _score: score(item) - 5 }));
    backfill.sort((a, b) => b._score - a._score);
    scored.push(...backfill);
  }

  // Ensure type diversity: at least one drink, meal, snack, ritual
  const result = [];
  const remaining = [...scored];
  for (const type of ["drink", "meal", "snack", "ritual"]) {
    const idx = remaining.findIndex((item) => item.type === type);
    if (idx >= 0) {
      result.push(remaining.splice(idx, 1)[0]);
    }
  }
  remaining.sort((a, b) => b._score - a._score);
  result.push(...remaining);

  return result.slice(0, n);
}