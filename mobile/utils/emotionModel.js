/**
 * Continuous emotion model utilities — circumplex coordinate math.
 *
 * The circular picker is a unit circle where:
 *   x-axis = valence (-1 left, +1 right)
 *   y-axis = arousal (-1 bottom, +1 top)
 *   intensity = distance from center (0–1)
 */

import { palette } from "./theme";

// ── Coordinate mapping ──

/** Convert a tap position on the circular field to valence/arousal/intensity */
export function tapToCoordinates(tapX, tapY, fieldSize) {
  const cx = fieldSize / 2;
  const cy = fieldSize / 2;
  const rawX = (tapX - cx) / cx;   // -1 to +1
  const rawY = -(tapY - cy) / cy;  // -1 to +1  (invert Y: screen top = high arousal)

  // Clamp to unit circle
  const dist = Math.sqrt(rawX * rawX + rawY * rawY);
  const clamped = Math.min(dist, 1);
  const angle = Math.atan2(rawY, rawX);

  const valence = Math.round(clamped * Math.cos(angle) * 100) / 100;
  const arousal = Math.round(clamped * Math.sin(angle) * 100) / 100;
  const intensity = Math.round(clamped * 100) / 100;

  return { valence, arousal, intensity };
}

/** Convert valence/arousal back to pixel position on the circular field */
export function coordinatesToPosition(valence, arousal, fieldSize) {
  const cx = fieldSize / 2;
  const cy = fieldSize / 2;
  return {
    x: cx + valence * cx,
    y: cy - arousal * cy,  // invert Y
  };
}

// ── Color mapping ──

/** Map valence/arousal to a color for visualization */
export function emotionColor(valence, arousal) {
  const mag = Math.sqrt(valence * valence + arousal * arousal);
  if (mag < 0.15) return palette.muted;

  if (arousal > 0.3 && valence > 0.3) return palette.accent;       // energized → cyan
  if (arousal > 0.3 && valence < -0.3) return palette.danger;      // tense → red
  if (arousal > 0.3) return palette.warning;                        // alert → amber
  if (arousal < -0.3 && valence > 0.3) return palette.success;     // calm → green
  if (arousal < -0.3 && valence < -0.3) return palette.purple;     // low → purple
  if (arousal < -0.3) return "#7fa8d4";                             // settled → blue-grey
  if (valence > 0.3) return palette.success;                        // content → green
  if (valence < -0.3) return palette.warning;                       // uneasy → amber

  return palette.muted;
}

/** Gradient stops for the circular field background */
export const FIELD_GRADIENT = {
  topLeft:     "rgba(255, 107, 122, 0.18)",  // tense-energized
  topRight:    "rgba(86, 208, 224, 0.18)",    // energized-calm
  bottomLeft:  "rgba(167, 139, 250, 0.18)",   // low-tense
  bottomRight: "rgba(94, 230, 160, 0.18)",    // calm-low
  center:      "rgba(184, 200, 216, 0.08)",   // neutral
};

// ── Label mapping ──

/** Short label shown on tap (1–2 words) */
export function shortLabel(valence, arousal) {
  const mag = Math.sqrt(valence * valence + arousal * arousal);
  if (mag < 0.15) return "neutral";

  const prefix = mag > 0.65 ? "very " : mag > 0.35 ? "" : "slightly ";

  if (arousal > 0.3 && valence > 0.3)  return prefix + "energized";
  if (arousal > 0.3 && valence < -0.3) return prefix + "tense";
  if (arousal > 0.3)                   return prefix + "alert";
  if (arousal < -0.3 && valence > 0.3) return prefix + "calm";
  if (arousal < -0.3 && valence < -0.3) return prefix + "low";
  if (arousal < -0.3)                  return prefix + "settled";
  if (valence > 0.3)                   return prefix + "content";
  if (valence < -0.3)                  return prefix + "uneasy";
  return "neutral";
}

/** Emotion score (1–5 scale) from continuous coordinates — backward compat */
export function coordinatesToScore(valence, arousal) {
  // Map valence from [-1, +1] to [1, 5] with arousal as modifier
  const base = (valence + 1) * 2 + 1; // 1 to 5
  const arousalMod = arousal * 0.3;
  return Math.max(1, Math.min(5, Math.round((base + arousalMod) * 10) / 10));
}
