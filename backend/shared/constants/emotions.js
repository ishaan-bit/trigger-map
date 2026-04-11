export const EMOTIONS = [
  "calm",
  "neutral",
  "anxious",
  "frustrated",
  "energized",
];

export const EMOTION_SCORE = {
  frustrated: 1,
  anxious: 2,
  neutral: 3,
  calm: 4,
  energized: 5,
  // Derived label mappings (safety net for moments stored with derived labels)
  overwhelmed: 1,
  heavy: 1,
  uneasy: 2,
  low: 2,
  restless: 2,
  alert: 3,
  flat: 2,
  disconnected: 1,
  content: 4,
  grateful: 5,
  peaceful: 5,
  excited: 5,
};

export const ENERGY_MAP = {
  calm: "steady",
  neutral: "balanced",
  anxious: "tense",
  frustrated: "drained",
  energized: "uplifted",
  // Derived label mappings (safety net for moments stored with derived labels)
  overwhelmed: "tense",
  heavy: "drained",
  uneasy: "tense",
  low: "drained",
  restless: "tense",
  alert: "tense",
  flat: "drained",
  disconnected: "drained",
  content: "steady",
  grateful: "uplifted",
  peaceful: "steady",
  excited: "uplifted",
};

// ── Two-Slider Emotion Model (valence × arousal) ──

/** Snap positions for the 5-band slider (-1 to +1) */
export const EMOTION_AXIS_STEPS = [-1, -0.5, 0, 0.5, 1];

/** Snap a raw slider value to the nearest axis step */
function snapToStep(raw) {
  let best = EMOTION_AXIS_STEPS[0];
  let bestDist = Math.abs(raw - best);
  for (let i = 1; i < EMOTION_AXIS_STEPS.length; i++) {
    const d = Math.abs(raw - EMOTION_AXIS_STEPS[i]);
    if (d < bestDist) { bestDist = d; best = EMOTION_AXIS_STEPS[i]; }
  }
  return best;
}

/** Convert raw slider positions (feel, energy) → snapped valence/arousal/intensity */
export function createEmotionCoordinates(feel, energy) {
  const valence = snapToStep(feel);
  const arousal = snapToStep(energy);
  const intensity = Math.round(Math.min(1, Math.sqrt(valence * valence + arousal * arousal) / Math.SQRT2) * 100) / 100;
  return { valence, arousal, intensity };
}

/**
 * Return a region key from (valence, arousal) for tag lookup.
 * 9 regions: {bad,neutral,good} × {low,mid,high}
 */
export function emotionRegionKey(valence, arousal) {
  const v = valence > 0.15 ? "good" : valence < -0.15 ? "bad" : "neutral";
  const a = arousal > 0.15 ? "high" : arousal < -0.15 ? "low" : "mid";
  return `${v}_${a}`;
}

// ── Continuous Emotion Model (valence-arousal circumplex) ──

/** Legacy emotion → (valence, arousal) mapping for backward compatibility */
export const EMOTION_COORDINATES = {
  calm:       { valence:  0.6, arousal: -0.5 },
  energized:  { valence:  0.7, arousal:  0.7 },
  anxious:    { valence: -0.7, arousal:  0.8 },
  frustrated: { valence: -0.6, arousal:  0.6 },
  neutral:    { valence:  0.0, arousal:  0.0 },
};

/** Derive a human-readable label key from continuous coordinates */
export function derivedEmotionLabel(valence, arousal) {
  const v = valence;
  const a = arousal;
  const mag = Math.sqrt(v * v + a * a);

  if (mag < 0.15) return "neutral";

  // 9-region mapping — plain-English feeling labels
  if (v < -0.15 && a > 0.15)  return mag > 0.65 ? "overwhelmed" : "anxious";
  if (v < -0.15 && a < -0.15) return mag > 0.65 ? "heavy"       : "low";
  if (v < -0.15)              return mag > 0.65 ? "frustrated"   : "uneasy";
  if (v > 0.15 && a > 0.15)   return mag > 0.65 ? "excited"     : "energized";
  if (v > 0.15 && a < -0.15)  return mag > 0.65 ? "peaceful"    : "calm";
  if (v > 0.15)               return mag > 0.65 ? "grateful"    : "content";
  if (a > 0.15)               return mag > 0.65 ? "restless"    : "alert";
  if (a < -0.15)              return mag > 0.65 ? "disconnected": "flat";

  return "neutral";
}

/** Map legacy discrete emotion string to valence/arousal coordinates */
export function legacyToCoordinates(emotion) {
  return EMOTION_COORDINATES[emotion] || EMOTION_COORDINATES.neutral;
}

/** Map continuous coordinates to the nearest legacy emotion (for backward compat) */
export function coordinatesToLegacy(valence, arousal) {
  const mag = Math.sqrt(valence * valence + arousal * arousal);
  // Near center → neutral
  if (mag < 0.25) return "neutral";
  // Negative valence → must be anxious or frustrated, never neutral
  if (valence < -0.2) return arousal >= 0.7 ? "anxious" : "frustrated";
  // Positive valence → must be energized or calm, never neutral
  if (valence > 0.2)  return arousal >= 0   ? "energized" : "calm";
  // Ambiguous valence band — decide by arousal direction
  if (arousal > 0) return "energized";
  if (arousal < 0) return "calm";
  return "neutral";
}

/** Return emotion-signal keywords for LLM/mode composition based on region */
export function emotionSignalKeywords(valence, arousal) {
  switch (emotionRegionKey(valence, arousal)) {
    case "bad_high":     return ["anxious", "stressed", "overwhelmed", "tense", "irritated"];
    case "bad_low":      return ["drained", "low", "heavy", "disconnected", "numb"];
    case "bad_mid":      return ["off", "uneasy", "tense"];
    case "good_high":    return ["energized", "excited", "motivated", "confident", "engaged"];
    case "good_low":     return ["calm", "content", "relaxed", "settled", "safe"];
    case "good_mid":     return ["good", "steady", "content"];
    case "neutral_high": return ["alert", "restless", "keyed_up", "tense"];
    case "neutral_low":  return ["flat", "tired", "disconnected", "low"];
    default:             return ["neutral", "steady"];
  }
}