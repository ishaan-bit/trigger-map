/**
 * Nourishment Library — structured food/nutrition primitives for the Fuel mode.
 * Each entry is tagged by type (what it is), diet compatibility,
 * cuisine tradition, preparation effort, and emotional-regulation relevance.
 *
 * The LLM composition engine selects from these and composes
 * contextualised nourishment guidance — it does NOT invent foods.
 *
 * Item data now lives in nourishmentCatalogue.js (~250 entries).
 */

import { NOURISHMENTS as CATALOGUE_NOURISHMENTS } from "./nourishmentCatalogue.js";

export const FOOD_TYPES = {
  meal:     { id: "meal",     label: "Full Meal",     labelHi: "पूरा भोजन" },
  snack:    { id: "snack",    label: "Snack",         labelHi: "स्नैक" },
  drink:    { id: "drink",    label: "Drink",         labelHi: "पेय" },
  ritual:   { id: "ritual",   label: "Food Ritual",   labelHi: "भोजन रिचुअल" },
};

export const DIETS = {
  vegetarian: { id: "vegetarian", label: "Vegetarian", labelHi: "शाकाहारी" },
  vegan:      { id: "vegan",      label: "Vegan",      labelHi: "वीगन" },
  nonVeg:     { id: "nonVeg",     label: "Non-Veg",    labelHi: "मांसाहारी" },
  glutenFree: { id: "glutenFree", label: "Gluten-Free", labelHi: "ग्लूटेन-फ्री" },
};

export const CUISINES = {
  indian:        { id: "indian",        label: "Indian",        labelHi: "भारतीय" },
  universal:     { id: "universal",     label: "Universal",     labelHi: "सामान्य" },
  japanese:      { id: "japanese",      label: "Japanese",      labelHi: "जापानी" },
  mediterranean: { id: "mediterranean", label: "Mediterranean", labelHi: "भूमध्यसागरीय" },
};

export const PREP_LEVELS = ["none", "minimal", "moderate"];

/** Nourishment primitives - sourced from nourishmentCatalogue.js */
export const NOURISHMENTS = CATALOGUE_NOURISHMENTS;

/**
 * Filter nourishments matching criteria.
 */
export function filterNourishments({ types, diets, cuisines, prepLevel, emotions } = {}) {
  return NOURISHMENTS.filter((n) => {
    if (types?.length && !types.includes(n.type)) return false;
    if (diets?.length && !diets.some((d) => n.diet.includes(d))) return false;
    if (cuisines?.length && !cuisines.some((c) => n.cuisine.includes(c))) return false;
    if (prepLevel && n.prepLevel !== prepLevel) return false;
    if (emotions?.length && !emotions.some((e) => n.emotionTags.includes(e))) return false;
    return true;
  });
}

/**
 * Pick N non-repeating nourishments best matching the given emotional state.
 */
export function pickNourishments(emotions, n = 2, { exclude = [], diet, cuisine } = {}) {
  const pool = filterNourishments({ emotions, diets: diet ? [diet] : undefined, cuisines: cuisine ? [cuisine] : undefined });
  const excludeSet = new Set(exclude);
  const candidates = pool.filter((item) => !excludeSet.has(item.id));
  if (candidates.length === 0) return pool.slice(0, n);

  const scored = candidates.map((item) => ({
    ...item,
    _score: emotions.filter((e) => item.emotionTags.includes(e)).length + Math.random() * 0.5,
  }));
  scored.sort((a, b) => b._score - a._score);
  return scored.slice(0, n);
}