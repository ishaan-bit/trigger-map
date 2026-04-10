/**
 * Movement Library - structured exercise primitives for the Move mode.
 * Item data now lives in movementCatalogue.js (~250 entries).
 */

import { MOVEMENTS as CATALOGUE_MOVEMENTS } from "./movementCatalogue.js";

export const MECHANISMS = {
  vagalTone:     { id: "vagalTone",     label: "Vagal Tone",      labelHi: "\u0935\u0947\u0917\u0932 \u091F\u094B\u0928" },
  cortisol:      { id: "cortisol",      label: "Cortisol Flush",  labelHi: "\u0915\u0949\u0930\u094D\u091F\u093F\u0938\u094B\u0932 \u092B\u094D\u0932\u0936" },
  endorphin:     { id: "endorphin",     label: "Endorphin Release", labelHi: "\u090F\u0902\u0921\u0949\u0930\u094D\u092B\u093F\u0928 \u0930\u093F\u0932\u0940\u091C\u093C" },
  grounding:     { id: "grounding",     label: "Grounding",       labelHi: "\u0917\u094D\u0930\u093E\u0909\u0902\u0921\u093F\u0902\u0917" },
  proprioception:{ id: "proprioception", label: "Proprioception", labelHi: "\u092A\u094D\u0930\u094B\u092A\u094D\u0930\u093F\u092F\u094B\u0938\u0947\u092A\u094D\u0936\u0928" },
  breathwork:    { id: "breathwork",    label: "Breathwork",      labelHi: "\u0936\u094D\u0935\u093E\u0938 \u0915\u094D\u0930\u093F\u092F\u093E" },
};

export const ENVIRONMENTS = {
  indoor:  { id: "indoor",  label: "Indoor",  labelHi: "\u0918\u0930 \u0915\u0947 \u0905\u0902\u0926\u0930" },
  outdoor: { id: "outdoor", label: "Outdoor", labelHi: "\u092C\u093E\u0939\u0930" },
  office:  { id: "office",  label: "Office",  labelHi: "\u0911\u092B\u093F\u0938" },
  travel:  { id: "travel",  label: "Travel",  labelHi: "\u092F\u093E\u0924\u094D\u0930\u093E" },
};

export const EQUIPMENT = {
  none:    { id: "none",    label: "No Equipment",   labelHi: "\u092C\u093F\u0928\u093E \u0909\u092A\u0915\u0930\u0923" },
  minimal: { id: "minimal", label: "Minimal",        labelHi: "\u0915\u092E \u0909\u092A\u0915\u0930\u0923" },
  gym:     { id: "gym",     label: "Gym Equipment",  labelHi: "\u091C\u093F\u092E \u0909\u092A\u0915\u0930\u0923" },
};

export const INTENSITY_LEVELS = ["low", "moderate", "high"];

/** Movement primitives - sourced from movementCatalogue.js */
export const MOVEMENTS = CATALOGUE_MOVEMENTS;

export function filterMovements({ mechanisms, environments, equipment, intensity, emotions } = {}) {
  return MOVEMENTS.filter((m) => {
    if (mechanisms?.length && !mechanisms.some((mech) => m.mechanism.includes(mech))) return false;
    if (environments?.length && !environments.some((env) => m.environment.includes(env))) return false;
    if (equipment && m.equipment !== equipment) return false;
    if (intensity && m.intensity !== intensity) return false;
    if (emotions?.length && !emotions.some((e) => m.emotionTags.includes(e))) return false;
    return true;
  });
}

export function pickMovements(emotions, n = 2, { exclude = [], boost = [], environment, equipment: equip } = {}) {
  const pool = filterMovements({ emotions, environments: environment ? [environment] : undefined, equipment: equip });
  const excludeSet = new Set(exclude);
  const boostSet = new Set(boost);
  const candidates = pool.filter((m) => !excludeSet.has(m.id));

  const score = (m) =>
    (emotions.length ? emotions.filter((e) => m.emotionTags.includes(e)).length : 0)
    + (boostSet.has(m.id) ? 1.5 : 0)
    + Math.random() * 0.5;

  const scored = candidates.map((m) => ({ ...m, _score: score(m) }));
  scored.sort((a, b) => b._score - a._score);

  if (scored.length < n) {
    const usedIds = new Set(scored.map((m) => m.id));
    const envEquipPool = filterMovements({ environments: environment ? [environment] : undefined, equipment: equip });
    const backfill = envEquipPool
      .filter((m) => !excludeSet.has(m.id) && !usedIds.has(m.id))
      .map((m) => ({ ...m, _score: score(m) - 5 }));
    backfill.sort((a, b) => b._score - a._score);
    scored.push(...backfill);
  }

  return scored.slice(0, n);
}