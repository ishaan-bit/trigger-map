/**
 * TriggerMap Design System
 * ────────────────────────
 * Centralized emotion-led + trigger-led visual language.
 * Every emotion and trigger defines a full visual style — not just a color.
 */

import { palette } from "@/utils/theme";

/* ── Emotion Colors ── */
export const EMOTION_COLORS = {
  calm:       "#5ee6a0",
  neutral:    "#9eb0c9",
  anxious:    "#ffb347",
  frustrated: "#ff6b7a",
  energized:  "#a78bfa",
};

/* ── Trigger Colors ── */
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

/* ── Emotion Visual Styles ── */
export const EMOTION_STYLES = {
  calm: {
    color: "#5ee6a0",
    bg: "rgba(94, 230, 160, 0.20)",
    border: "rgba(94, 230, 160, 0.24)",
    glow: "rgba(94, 230, 160, 0.06)",
    borderRadius: 20,
    contrast: 0.85,
  },
  neutral: {
    color: "#9eb0c9",
    bg: "rgba(158, 176, 201, 0.20)",
    border: "rgba(158, 176, 201, 0.22)",
    glow: "rgba(158, 176, 201, 0.05)",
    borderRadius: 16,
    contrast: 0.9,
  },
  anxious: {
    color: "#ffb347",
    bg: "rgba(255, 179, 71, 0.20)",
    border: "rgba(255, 179, 71, 0.26)",
    glow: "rgba(255, 179, 71, 0.06)",
    borderRadius: 14,
    contrast: 0.95,
  },
  frustrated: {
    color: "#ff6b7a",
    bg: "rgba(255, 107, 122, 0.20)",
    border: "rgba(255, 107, 122, 0.28)",
    glow: "rgba(255, 107, 122, 0.07)",
    borderRadius: 12,
    contrast: 1.0,
  },
  energized: {
    color: "#a78bfa",
    bg: "rgba(167, 139, 250, 0.20)",
    border: "rgba(167, 139, 250, 0.24)",
    glow: "rgba(167, 139, 250, 0.06)",
    borderRadius: 16,
    contrast: 0.92,
  },
};

/* ── Trigger Visual Styles ── */
export const TRIGGER_STYLES = {
  work:     { color: "#56d0e0", bg: "rgba(86, 208, 224, 0.22)",   border: "rgba(86, 208, 224, 0.35)" },
  family:   { color: "#e0a356", bg: "rgba(224, 163, 86, 0.22)",   border: "rgba(224, 163, 86, 0.35)" },
  partner:  { color: "#e05688", bg: "rgba(224, 86, 136, 0.22)",   border: "rgba(224, 86, 136, 0.35)" },
  social:   { color: "#a78bfa", bg: "rgba(167, 139, 250, 0.22)",  border: "rgba(167, 139, 250, 0.35)" },
  alone:    { color: "#9eb0c9", bg: "rgba(158, 176, 201, 0.22)",  border: "rgba(158, 176, 201, 0.32)" },
  exercise: { color: "#5ee6a0", bg: "rgba(94, 230, 160, 0.22)",   border: "rgba(94, 230, 160, 0.35)" },
  travel:   { color: "#56e0b0", bg: "rgba(86, 224, 176, 0.22)",   border: "rgba(86, 224, 176, 0.35)" },
  health:   { color: "#ff6b7a", bg: "rgba(255, 107, 122, 0.22)",  border: "rgba(255, 107, 122, 0.35)" },
  money:    { color: "#ffb347", bg: "rgba(255, 179, 71, 0.22)",   border: "rgba(255, 179, 71, 0.35)" },
};

const DEFAULT_TRIGGER_STYLE = { color: palette.accent, bg: palette.accentSoft, border: palette.accentMedium };
const DEFAULT_EMOTION_STYLE = EMOTION_STYLES.neutral;

/** Get full visual style for an emotion */
export function emotionStyle(emotion) {
  return EMOTION_STYLES[emotion] || DEFAULT_EMOTION_STYLE;
}

/** Get full visual style for a trigger */
export function triggerStyle(trigger) {
  return TRIGGER_STYLES[trigger] || DEFAULT_TRIGGER_STYLE;
}

/* ── Stagger Animation Helper ── */
export const STAGGER_DELAY = 100; // ms between items

/* ── Living Gradient Colors ── */
export function gradientForEmotion(emotion) {
  const base = EMOTION_STYLES[emotion] || DEFAULT_EMOTION_STYLE;
  return {
    colors: [
      "rgba(8, 14, 26, 1)",        // top dark
      base.glow,                     // emotion-tinted mid
      "rgba(4, 7, 16, 1)",          // bottom dark
    ],
  };
}
