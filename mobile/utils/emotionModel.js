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

// ── Label mapping (Plutchik-based) ──

/**
 * Short label shown on tap — based on Plutchik's wheel of emotions.
 * Two intensity layers: outer (mild) → inner (intense).
 *
 * The circumplex is divided into 8 sectors by angle, with intensity
 * modulated by distance from center (mag).
 *
 * Sectors (angle from positive‑X, counter-clockwise):
 *   0°–45°   → joy / ecstasy
 *  45°–90°   → anticipation / vigilance
 *  90°–135°  → anger / rage
 * 135°–180°  → disgust / loathing
 * 180°–225°  → sadness / grief
 * 225°–270°  → surprise / amazement
 * 270°–315°  → fear / terror
 * 315°–360°  → trust / admiration
 */
export function shortLabel(valence, arousal) {
  const mag = Math.sqrt(valence * valence + arousal * arousal);
  if (mag < 0.12) return "neutral";

  // angle in degrees 0–360 (0 = right/+valence, 90 = up/+arousal)
  let angle = Math.atan2(arousal, valence) * (180 / Math.PI);
  if (angle < 0) angle += 360;

  // Plutchik sectors with 3 intensity tiers: mild / base / intense
  const sectors = [
    { min: 0,   max: 45,  mild: "serenity",      base: "joy",          intense: "ecstasy" },
    { min: 45,  max: 90,  mild: "interest",       base: "anticipation", intense: "vigilance" },
    { min: 90,  max: 135, mild: "annoyance",      base: "anger",        intense: "rage" },
    { min: 135, max: 180, mild: "boredom",         base: "disgust",      intense: "loathing" },
    { min: 180, max: 225, mild: "pensiveness",     base: "sadness",      intense: "grief" },
    { min: 225, max: 270, mild: "distraction",     base: "surprise",     intense: "amazement" },
    { min: 270, max: 315, mild: "apprehension",    base: "fear",         intense: "terror" },
    { min: 315, max: 360, mild: "acceptance",      base: "trust",        intense: "admiration" },
  ];

  const sector = sectors.find((s) => angle >= s.min && angle < s.max) || sectors[0];

  if (mag > 0.65) return sector.intense;
  if (mag > 0.30) return sector.base;
  return sector.mild;
}

/** Emotion score (1–5 scale) from continuous coordinates — backward compat */
export function coordinatesToScore(valence, arousal) {
  // Map valence from [-1, +1] to [1, 5] with arousal as modifier
  const base = (valence + 1) * 2 + 1; // 1 to 5
  const arousalMod = arousal * 0.3;
  return Math.max(1, Math.min(5, Math.round((base + arousalMod) * 10) / 10));
}
