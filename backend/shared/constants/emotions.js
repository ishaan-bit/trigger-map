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
};

export const ENERGY_MAP = {
  calm: "steady",
  neutral: "balanced",
  anxious: "tense",
  frustrated: "drained",
  energized: "uplifted",
};

// ── Continuous Emotion Model (valence-arousal circumplex) ──

/** Legacy emotion → (valence, arousal) mapping for backward compatibility */
export const EMOTION_COORDINATES = {
  calm:       { valence:  0.6, arousal: -0.5 },
  energized:  { valence:  0.7, arousal:  0.7 },
  anxious:    { valence: -0.7, arousal:  0.8 },
  frustrated: { valence: -0.6, arousal:  0.6 },
  neutral:    { valence:  0.0, arousal:  0.0 },
};

/** Anchor labels for the circular picker (directional cues) */
export const CIRCUMPLEX_ANCHORS = {
  top:    { label: "energized",  valence:  0.0, arousal:  1.0 },
  right:  { label: "calm",       valence:  1.0, arousal:  0.0 },
  bottom: { label: "low",        valence:  0.0, arousal: -1.0 },
  left:   { label: "tense",      valence: -1.0, arousal:  0.0 },
};

/** Derive a human-readable label from continuous coordinates */
export function derivedEmotionLabel(valence, arousal) {
  const v = valence;
  const a = arousal;
  const mag = Math.sqrt(v * v + a * a);

  if (mag < 0.15) return "neutral";

  const prefix = mag > 0.65 ? "very " : mag > 0.35 ? "" : "slightly ";

  // 8-region mapping
  if (a > 0.3 && v > 0.3)  return prefix + "energized";
  if (a > 0.3 && v < -0.3) return prefix + "tense";
  if (a > 0.3)             return prefix + "alert";
  if (a < -0.3 && v > 0.3) return prefix + "calm";
  if (a < -0.3 && v < -0.3) return prefix + "low";
  if (a < -0.3)            return prefix + "settled";
  if (v > 0.3)             return prefix + "content";
  if (v < -0.3)            return prefix + "uneasy";

  return "neutral";
}

/** Map legacy discrete emotion string to valence/arousal coordinates */
export function legacyToCoordinates(emotion) {
  return EMOTION_COORDINATES[emotion] || EMOTION_COORDINATES.neutral;
}

/** Map continuous coordinates to the nearest legacy emotion (for backward compat) */
export function coordinatesToLegacy(valence, arousal) {
  let best = "neutral";
  let bestDist = Infinity;
  for (const [emotion, coords] of Object.entries(EMOTION_COORDINATES)) {
    const dist = Math.sqrt(
      (valence - coords.valence) ** 2 + (arousal - coords.arousal) ** 2
    );
    if (dist < bestDist) { bestDist = dist; best = emotion; }
  }
  return best;
}