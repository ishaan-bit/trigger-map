/**
 * Shared emoji glyphs for triggers and emotions — single source so the Trigger
 * Map and other surfaces stay visually consistent.
 */
export const TRIGGER_ICONS = {
  work: "🏢",
  social: "👥",
  money: "💰",
  family: "🏠",
  exercise: "🏃",
  health: "💊",
  sleep: "😴",
  partner: "💛",
  alone: "🧘",
  travel: "📍",
  other: "📌",
};

export const EMOTION_EMOJIS = {
  frustrated: "😤",
  anxious: "😰",
  neutral: "😐",
  calm: "😌",
  energized: "⚡",
};

export function triggerIcon(key) {
  return TRIGGER_ICONS[key] || "📌";
}

export function emotionEmoji(key) {
  return EMOTION_EMOJIS[key] || "•";
}
