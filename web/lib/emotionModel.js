/**
 * Continuous emotion model — circumplex coordinate math, ported from
 * mobile/utils/emotionModel.js so the web app derives colors, labels and the
 * atmosphere from the same valence/arousal logic.
 *
 *   valence = x-axis (-1 unpleasant ←→ +1 pleasant)
 *   arousal = y-axis (-1 calm ←→ +1 intense)
 *   intensity = distance from center (0–1)
 */

import { coordinatesToLegacy, derivedEmotionLabel } from "@triggermap/shared/constants/emotions";

// Palette mirrors mobile/utils/theme.js.
const C = {
  muted: "#b8c8d8",
  accent: "#56d0e0",
  accentStrong: "#2e93a8",
  success: "#5ee6a0",
  warning: "#ffb347",
  danger: "#ff6b7a",
  purple: "#a78bfa",
  settled: "#7fa8d4",
};

// ── Coordinate ↔ position (used by the EmotionPad) ──

/** Convert a pointer position on a square field to valence/arousal/intensity. */
export function tapToCoordinates(tapX, tapY, fieldSize) {
  const cx = fieldSize / 2;
  const cy = fieldSize / 2;
  const rawX = (tapX - cx) / cx; // -1..+1
  const rawY = -(tapY - cy) / cy; // invert Y: screen top = high arousal

  const dist = Math.sqrt(rawX * rawX + rawY * rawY);
  const clamped = Math.min(dist, 1);
  const angle = Math.atan2(rawY, rawX);

  const valence = Math.round(clamped * Math.cos(angle) * 100) / 100;
  const arousal = Math.round(clamped * Math.sin(angle) * 100) / 100;
  const intensity = Math.round(clamped * 100) / 100;
  return { valence, arousal, intensity };
}

/** Convert valence/arousal back to a pixel position on the field. */
export function coordinatesToPosition(valence, arousal, fieldSize) {
  const cx = fieldSize / 2;
  const cy = fieldSize / 2;
  return { x: cx + valence * cx, y: cy - arousal * cy };
}

// ── Color mapping ──

/** Map valence/arousal to a representative color. */
export function emotionColor(valence, arousal) {
  const v = valence || 0;
  const a = arousal || 0;
  const mag = Math.sqrt(v * v + a * a);
  if (mag < 0.15) return C.muted;

  if (a > 0.3 && v > 0.3) return C.accent; // energized → cyan
  if (a > 0.3 && v < -0.3) return C.danger; // tense → red
  if (a > 0.3) return C.warning; // alert → amber
  if (a < -0.3 && v > 0.3) return C.success; // calm → green
  if (a < -0.3 && v < -0.3) return C.purple; // low → purple
  if (a < -0.3) return C.settled; // settled → blue-grey
  if (v > 0.3) return C.success; // content → green
  if (v < -0.3) return C.warning; // uneasy → amber
  return C.muted;
}

/** Gradient stops for the circular field background. */
export const FIELD_GRADIENT = {
  topLeft: "rgba(255, 107, 122, 0.18)",
  topRight: "rgba(86, 208, 224, 0.18)",
  bottomLeft: "rgba(167, 139, 250, 0.18)",
  bottomRight: "rgba(94, 230, 160, 0.18)",
  center: "rgba(184, 200, 216, 0.08)",
};

// Aurora hue triads per dominant emotion — [primary, secondary, deep].
// Mirrors mobile/components/AtmosphericField.js.
export const AURORA = {
  calm: ["#5ee6a0", "#56d0e0", "#2e93a8"],
  neutral: ["#56d0e0", "#a78bfa", "#2e93a8"],
  anxious: ["#ffb347", "#e0a356", "#a78bfa"],
  frustrated: ["#ff6b7a", "#a78bfa", "#56d0e0"],
  energized: ["#a78bfa", "#56d0e0", "#5ee6a0"],
};

// ── Labels ──

/** Plutchik-style short label from coordinates. */
export function shortLabel(valence, arousal) {
  const v = valence || 0;
  const a = arousal || 0;
  const mag = Math.sqrt(v * v + a * a);
  if (mag < 0.12) return "neutral";

  let angle = Math.atan2(a, v) * (180 / Math.PI);
  if (angle < 0) angle += 360;

  const sectors = [
    { min: 0, max: 45, mild: "serenity", base: "joy", intense: "ecstasy" },
    { min: 45, max: 90, mild: "interest", base: "anticipation", intense: "vigilance" },
    { min: 90, max: 135, mild: "annoyance", base: "anger", intense: "rage" },
    { min: 135, max: 180, mild: "boredom", base: "disgust", intense: "loathing" },
    { min: 180, max: 225, mild: "pensiveness", base: "sadness", intense: "grief" },
    { min: 225, max: 270, mild: "distraction", base: "surprise", intense: "amazement" },
    { min: 270, max: 315, mild: "apprehension", base: "fear", intense: "terror" },
    { min: 315, max: 360, mild: "acceptance", base: "trust", intense: "admiration" },
  ];
  const sector = sectors.find((s) => angle >= s.min && angle < s.max) || sectors[0];
  if (mag > 0.65) return sector.intense;
  if (mag > 0.3) return sector.base;
  return sector.mild;
}

/** Emotion score (1–5) from coordinates — backward compat. */
export function coordinatesToScore(valence, arousal) {
  const base = ((valence || 0) + 1) * 2 + 1;
  const arousalMod = (arousal || 0) * 0.3;
  return Math.max(1, Math.min(5, Math.round((base + arousalMod) * 10) / 10));
}

/**
 * Legacy emotion bucket with coordinate fallback. New-model moments store only
 * valence/arousal, so reading `m.emotion` directly would leave the atmosphere
 * stuck on neutral.
 */
export function resolveEmotion(moment) {
  if (!moment) return "neutral";
  if (moment.emotion) return moment.emotion;
  if (typeof moment.valence === "number" && typeof moment.arousal === "number") {
    return coordinatesToLegacy(moment.valence, moment.arousal);
  }
  return "neutral";
}

/** Best human-readable label for a moment (server-derived → coords → bucket). */
export function momentLabel(moment) {
  if (!moment) return "neutral";
  if (moment.derivedLabel) return moment.derivedLabel;
  if (moment.emotionLabel) return moment.emotionLabel;
  if (typeof moment.valence === "number" && typeof moment.arousal === "number") {
    return derivedEmotionLabel(moment.valence, moment.arousal);
  }
  return resolveEmotion(moment);
}

/** Color for a moment using its coordinates when available. */
export function momentColor(moment) {
  if (moment && typeof moment.valence === "number" && typeof moment.arousal === "number") {
    return emotionColor(moment.valence, moment.arousal);
  }
  // Fall back to the legacy-bucket color.
  const bucket = resolveEmotion(moment);
  const map = { calm: "#5ee6a0", neutral: "#9eb0c9", anxious: "#ffb347", frustrated: "#ff6b7a", energized: "#a78bfa" };
  return map[bucket] || "#9eb0c9";
}
