/**
 * TriggerMap Web Design System
 * Mirrors mobile/utils/designSystem.js for visual parity.
 */

// Legacy discrete emotion colors (kept for backward compat with old moments)
export const EMOTION_COLORS = {
  calm:       "#5ee6a0",
  neutral:    "#9eb0c9",
  anxious:    "#ffb347",
  frustrated: "#ff6b7a",
  energized:  "#a78bfa",
};

// Region-based colors for the 9-region slider model
export const REGION_COLORS = {
  bad_high:     "#ff6b7a",
  bad_mid:      "#ff8a6b",
  bad_low:      "#c084fc",
  neutral_high: "#ffb347",
  neutral_mid:  "#9eb0c9",
  neutral_low:  "#7e8fa6",
  good_high:    "#56d0e0",
  good_mid:     "#5ee6a0",
  good_low:     "#a78bfa",
};

// Derived-label → color mapping (18 labels from derivedEmotionLabel)
export const DERIVED_LABEL_COLORS = {
  overwhelmed:  "#ff6b7a",
  anxious:      "#ffb347",
  heavy:        "#c084fc",
  low:          "#9e7bfa",
  frustrated:   "#ff8a6b",
  uneasy:       "#ff9f6b",
  excited:      "#56d0e0",
  energized:    "#7bc9d8",
  peaceful:     "#a78bfa",
  calm:         "#5ee6a0",
  grateful:     "#88d498",
  content:      "#5ee6a0",
  restless:     "#ffb347",
  alert:        "#ffd166",
  disconnected: "#7e8fa6",
  flat:         "#8da4bd",
  neutral:      "#9eb0c9",
};

/** Get a color for any emotion label (derived or legacy) */
export function colorForLabel(label) {
  return DERIVED_LABEL_COLORS[label] || EMOTION_COLORS[label] || "#9eb0c9";
}

export const TRIGGER_COLORS = {
  work:     "#56d0e0",
  family:   "#e0a356",
  partner:  "#e05688",
  social:   "#a78bfa",
  alone:    "#9eb0c9",
  exercise: "#5ee6a0",
  travel:   "#56e0b0",
  health:   "#ff6b7a",
  money:    "#ffb347",
};

export const EMOTION_STYLES = {
  calm: {
    color: "#5ee6a0",
    bg: "rgba(94, 230, 160, 0.20)",
    border: "rgba(94, 230, 160, 0.24)",
    glow: "rgba(94, 230, 160, 0.06)",
  },
  neutral: {
    color: "#9eb0c9",
    bg: "rgba(158, 176, 201, 0.20)",
    border: "rgba(158, 176, 201, 0.22)",
    glow: "rgba(158, 176, 201, 0.05)",
  },
  anxious: {
    color: "#ffb347",
    bg: "rgba(255, 179, 71, 0.20)",
    border: "rgba(255, 179, 71, 0.26)",
    glow: "rgba(255, 179, 71, 0.06)",
  },
  frustrated: {
    color: "#ff6b7a",
    bg: "rgba(255, 107, 122, 0.20)",
    border: "rgba(255, 107, 122, 0.28)",
    glow: "rgba(255, 107, 122, 0.07)",
  },
  energized: {
    color: "#a78bfa",
    bg: "rgba(167, 139, 250, 0.20)",
    border: "rgba(167, 139, 250, 0.24)",
    glow: "rgba(167, 139, 250, 0.06)",
  },
};

export const EMOTION_CARD_TINTS = {
  calm:       { bg: "rgba(94, 230, 160, 0.40)",  border: "rgba(94, 230, 160, 0.55)",  iconBg: "rgba(94, 230, 160, 0.35)" },
  neutral:    { bg: "rgba(148, 180, 224, 0.40)",  border: "rgba(148, 180, 224, 0.52)", iconBg: "rgba(148, 180, 224, 0.35)" },
  anxious:    { bg: "rgba(255, 179, 71, 0.40)",   border: "rgba(255, 179, 71, 0.55)",  iconBg: "rgba(255, 179, 71, 0.35)" },
  frustrated: { bg: "rgba(255, 107, 122, 0.40)",  border: "rgba(255, 107, 122, 0.55)", iconBg: "rgba(255, 107, 122, 0.35)" },
  energized:  { bg: "rgba(86, 208, 224, 0.40)",   border: "rgba(86, 208, 224, 0.55)",  iconBg: "rgba(86, 208, 224, 0.35)" },
};

export function gradientForEmotion(emotion) {
  const base = EMOTION_STYLES[emotion] || EMOTION_STYLES.neutral;
  return {
    top: "rgba(8, 14, 26, 1)",
    mid: base.glow,
    bottom: "rgba(4, 7, 16, 1)",
  };
}
