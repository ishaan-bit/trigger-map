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

export const EMOTION_AXIS_STEPS = [-1, -0.66, -0.33, 0, 0.33, 0.66, 1];

export const EMOTION_COORDINATES = {
  calm: { valence: 0.66, arousal: -0.5 },
  energized: { valence: 0.66, arousal: 0.66 },
  anxious: { valence: -0.66, arousal: 0.66 },
  frustrated: { valence: -0.5, arousal: 0.5 },
  neutral: { valence: 0, arousal: 0 },
};

export const CIRCUMPLEX_ANCHORS = {
  top: { label: "energized", valence: 0, arousal: 1 },
  right: { label: "calm", valence: 1, arousal: 0 },
  bottom: { label: "low", valence: 0, arousal: -1 },
  left: { label: "tense", valence: -1, arousal: 0 },
};

export function clampEmotionValue(value) {
  return Math.max(-1, Math.min(1, Number(value) || 0));
}

export function snapEmotionValue(value) {
  const clamped = clampEmotionValue(value);
  return EMOTION_AXIS_STEPS.reduce((closest, step) => (
    Math.abs(step - clamped) < Math.abs(closest - clamped) ? step : closest
  ), EMOTION_AXIS_STEPS[0]);
}

export function createEmotionCoordinates(valence, arousal, { snap = true } = {}) {
  const nextValence = snap ? snapEmotionValue(valence) : clampEmotionValue(valence);
  const nextArousal = snap ? snapEmotionValue(arousal) : clampEmotionValue(arousal);
  const intensity = Math.min(1, Math.sqrt(nextValence ** 2 + nextArousal ** 2));

  return {
    valence: Number(nextValence.toFixed(2)),
    arousal: Number(nextArousal.toFixed(2)),
    intensity: Number(intensity.toFixed(2)),
  };
}

export function emotionRegionKey(valence, arousal) {
  const v = clampEmotionValue(valence);
  const a = clampEmotionValue(arousal);

  if (Math.abs(v) < 0.2 && Math.abs(a) < 0.2) return "center";
  if (v <= -0.25 && a >= 0.25) return "negative_high";
  if (v <= -0.25 && a <= -0.25) return "negative_low";
  if (v >= 0.25 && a >= 0.25) return "positive_high";
  if (v >= 0.25 && a <= -0.25) return "positive_low";
  if (Math.abs(v) < 0.25 && a >= 0.25) return "neutral_high";
  if (Math.abs(v) < 0.25 && a <= -0.25) return "neutral_low";
  return v >= 0 ? "positive_mid" : "negative_mid";
}

export function derivedEmotionLabel(valence, arousal) {
  const v = clampEmotionValue(valence);
  const a = clampEmotionValue(arousal);

  switch (emotionRegionKey(v, a)) {
    case "negative_high":
      if (a >= 0.66 && v <= -0.66) return "overwhelmed";
      if (a >= 0.5 && v <= -0.5) return "anxious";
      return "stressed";
    case "negative_low":
      if (a <= -0.66 && v <= -0.5) return "numb";
      if (a <= -0.5) return "drained";
      return "heavy";
    case "positive_high":
      if (a >= 0.66 && v >= 0.66) return "excited";
      if (a >= 0.5) return "energized";
      return "motivated";
    case "positive_low":
      if (a <= -0.66 && v >= 0.5) return "relaxed";
      if (a <= -0.5) return "calm";
      return "content";
    case "neutral_high":
      if (a >= 0.66) return "keyed_up";
      if (a >= 0.45) return "alert";
      return "restless";
    case "neutral_low":
      if (a <= -0.66) return "tired";
      if (v < 0) return "disconnected";
      return "flat";
    case "positive_mid":
      return v >= 0.5 ? "good" : "steady";
    case "negative_mid":
      return v <= -0.5 ? "off" : "uneasy";
    default:
      return "neutral";
  }
}

export function emotionSignalKeywords(valence, arousal) {
  switch (emotionRegionKey(valence, arousal)) {
    case "negative_high":
      return ["anxious", "stressed", "overwhelmed", "tense", "irritated"];
    case "negative_low":
      return ["drained", "low", "heavy", "disconnected", "numb"];
    case "positive_high":
      return ["energized", "excited", "motivated", "confident", "engaged"];
    case "positive_low":
      return ["calm", "content", "relaxed", "settled", "safe"];
    case "neutral_high":
      return ["alert", "restless", "keyed_up", "tense"];
    case "neutral_low":
      return ["flat", "tired", "disconnected", "low"];
    case "positive_mid":
      return ["good", "steady", "content"];
    case "negative_mid":
      return ["off", "uneasy", "tense"];
    default:
      return ["neutral", "steady"];
  }
}

export function legacyToCoordinates(emotion) {
  return EMOTION_COORDINATES[emotion] || EMOTION_COORDINATES.neutral;
}

export function coordinatesToLegacy(valence, arousal) {
  let best = "neutral";
  let bestDist = Infinity;

  for (const [emotion, coords] of Object.entries(EMOTION_COORDINATES)) {
    const dist = Math.sqrt((valence - coords.valence) ** 2 + (arousal - coords.arousal) ** 2);
    if (dist < bestDist) {
      bestDist = dist;
      best = emotion;
    }
  }

  return best;
}