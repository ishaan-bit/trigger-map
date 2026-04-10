/**
 * Movement Library — structured exercise primitives for the Move mode.
 * Item data now lives in movementCatalogue.js (~250 entries).
 */

import { MOVEMENTS as CATALOGUE_MOVEMENTS } from "./movementCatalogue.js";

export const MECHANISMS = {
  vagalTone:     { id: "vagalTone",     label: "Vagal Tone",      labelHi: "वेगल टोन" },
  cortisol:      { id: "cortisol",      label: "Cortisol Flush",  labelHi: "कॉर्टिसोल फ्लश" },
  endorphin:     { id: "endorphin",     label: "Endorphin Release", labelHi: "एंडॉर्फिन रिलीज़" },
  grounding:     { id: "grounding",     label: "Grounding",       labelHi: "ग्राउंडिंग" },
  proprioception:{ id: "proprioception", label: "Proprioception", labelHi: "प्रोप्रियोसेप्शन" },
  breathwork:    { id: "breathwork",    label: "Breathwork",      labelHi: "श्वास क्रिया" },
};

export const ENVIRONMENTS = {
  indoor:  { id: "indoor",  label: "Indoor",  labelHi: "घर के अंदर" },
  outdoor: { id: "outdoor", label: "Outdoor", labelHi: "बाहर" },
  office:  { id: "office",  label: "Office",  labelHi: "ऑफिस" },
  travel:  { id: "travel",  label: "Travel",  labelHi: "यात्रा" },
};

export const EQUIPMENT = {
  none:    { id: "none",    label: "No Equipment",   labelHi: "बिना उपकरण" },
  minimal: { id: "minimal", label: "Minimal",        labelHi: "कम उपकरण" },
  gym:     { id: "gym",     label: "Gym Equipment",  labelHi: "जिम उपकरण" },
};

export const INTENSITY_LEVELS = ["low", "moderate", "high"];

/** Movement primitives - sourced from movementCatalogue.js */
export const MOVEMENTS = CATALOGUE_MOVEMENTS;

export function filterMovements({ mechanisms, environments, equipment, intensity, emotions, maxDuration } = {}) {
  return MOVEMENTS.filter((m) => {
    if (mechanisms?.length && !mechanisms.some((mech) => m.mechanism.includes(mech))) return false;
    if (environments?.length && !environments.some((env) => m.environment.includes(env))) return false;
    if (equipment && m.equipment !== equipment) return false;
    if (intensity && m.intensity !== intensity) return false;
    if (emotions?.length && !emotions.some((e) => m.emotionTags.includes(e))) return false;
    if (maxDuration && m.durationMin > maxDuration) return false;
    return true;
  });
}

export function pickMovements(emotions, n = 2, { exclude = [], environment, equipment: equip } = {}) {
  const pool = filterMovements({ emotions, environments: environment ? [environment] : undefined, equipment: equip });
  const excludeSet = new Set(exclude);
  const candidates = pool.filter((m) => !excludeSet.has(m.id));
  if (candidates.length === 0) return pool.slice(0, n);

  const scored = candidates.map((m) => ({
    ...m,
    _score: emotions.filter((e) => m.emotionTags.includes(e)).length + Math.random() * 0.5,
  }));
  scored.sort((a, b) => b._score - a._score);
  return scored.slice(0, n);
}