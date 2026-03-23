/**
 * Grammar-safe text composition for rule-based insights.
 *
 * Two layers:
 * 1. Composition helpers — used at template sites for known patterns
 * 2. lintText()        — post-generation safety net that catches/fixes
 *                         grammar errors in ANY generated text string
 *
 * Emotions (calm, neutral, anxious, frustrated, energized) are adjectives.
 * They work after "feeling" or as predicate adjectives ("you felt anxious")
 * but NOT as noun subjects ("anxious was felt") or prepositional objects
 * ("leads to anxious").
 *
 * Triggers are nouns except "alone" (adverb) which needs "time alone".
 */

// ── Emotion noun forms ───────────────────────────────────────────────────────

const EMOTION_NOUNS = {
  calm:       "calmness",
  neutral:    "a neutral state",
  anxious:    "anxiety",
  frustrated: "frustration",
  energized:  "energy",
};

// ── Trigger display forms ────────────────────────────────────────────────────

const TRIGGER_LABELS = {
  alone: "time alone",
};

// ── Regex building blocks ────────────────────────────────────────────────────

const EMOTIONS = ["calm", "neutral", "anxious", "frustrated", "energized"];
const EMO = EMOTIONS.join("|");

// ── Composition helpers (proactive) ──────────────────────────────────────────

/**
 * Noun form of an emotion for use after prepositions:
 * "source of anxiety", "leads to frustration"
 */
export function emotionNoun(emotion) {
  return EMOTION_NOUNS[emotion?.toLowerCase()] || emotion;
}

/**
 * Display-safe trigger for subject/object positions:
 * "time alone" instead of bare "alone"
 */
export function triggerLabel(trigger) {
  return TRIGGER_LABELS[trigger?.toLowerCase()] || trigger;
}

/**
 * Capitalize first letter of a string.
 */
function cap(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

// ── Post-generation grammar lint (defensive) ─────────────────────────────────
//
// Scans finished text for known broken patterns and fixes them.
// Safe to call on any generated string — idempotent and fast.
//
// Patterns caught:
//  1. "leads to {adj-emotion}"          → "leads to feeling {emotion}"
//  2. "brings {adj-emotion}" (no "you") → "leads to feeling {emotion}"
//  3. "bringing {adj-emotion}" (no "you") → "bringing you {emotion}"
//  4. "source of {adj-emotion}"         → "source of {noun-form}"
//  5. "{adj-emotion} was felt"          → "You felt {emotion}"
//  6. "{adj-emotion} was your"          → "Feeling {emotion} was your"
//  7. "{x} and {adj-emotion} kept"      → "and feeling {emotion} kept"
//  8. Bare "alone" as trigger           → "time alone"
//  9. "tend to {3rd-person verb}"       → infinitive form

export function lintText(text) {
  if (!text || typeof text !== "string") return text;
  let t = text;

  // 1. "leads to {emotion}" → "leads to feeling {emotion}"
  t = t.replace(
    new RegExp(`\\bleads to (?!feeling )(${EMO})\\b`, "gi"),
    (_, e) => `leads to feeling ${e.toLowerCase()}`
  );

  // 2. "brings {emotion}" (without "you" between) → "leads to feeling {emotion}"
  t = t.replace(
    new RegExp(`\\bbrings (?!you |on )(${EMO})\\b`, "gi"),
    (_, e) => `leads to feeling ${e.toLowerCase()}`
  );

  // 3. "bringing {emotion}" (without "you") → "bringing you {emotion}"
  t = t.replace(
    new RegExp(`\\bbringing (?!you )(${EMO})\\b`, "gi"),
    (_, e) => `bringing you ${e.toLowerCase()}`
  );

  // 4. "source of {emotion}" → "source of {noun-form}"
  t = t.replace(
    new RegExp(`\\bsource of (${EMO})\\b`, "gi"),
    (_, e) => `source of ${EMOTION_NOUNS[e.toLowerCase()] || e}`
  );

  // 5. "{emotion} was felt" → "You felt {emotion}"
  t = t.replace(
    new RegExp(`(^|[.!?]\\s+)(${EMO}) was felt\\b`, "gi"),
    (_, pre, e) => `${pre}You felt ${e.toLowerCase()}`
  );

  // 6. "{emotion} was your" → "Feeling {emotion} was your"
  t = t.replace(
    new RegExp(`(^|[.!?]\\s+)(${EMO}) was your\\b`, "gi"),
    (_, pre, e) => `${pre}Feeling ${e.toLowerCase()} was your`
  );

  // 7. "{x} and {emotion} kept" → "and feeling {emotion} kept"
  t = t.replace(
    new RegExp(`\\band (${EMO}) kept\\b`, "gi"),
    (_, e) => `and feeling ${e.toLowerCase()} kept`
  );

  // 8. Bare "alone" as trigger → "time alone"
  //    Skip if already "time alone", "not alone", or "alone time"
  t = t.replace(
    new RegExp("(?<!\\btime |\\bnot )\\balone\\b(?!\\s+time)", "gi"),
    "time alone"
  );
  // Capitalize at sentence start
  t = t.replace(/(^|[.!?]\s+)time alone\b/g, (_, pre) => `${pre}Time alone`);

  // 9. Verb agreement: "tend to {3rd-person}" → infinitive
  t = t.replace(/\btend to bounces\b/gi, "tend to bounce");
  t = t.replace(/\btend to recovers\b/gi, "tend to recover");
  t = t.replace(/\btend to takes\b/gi, "tend to take");

  // 10. "You's" → "Your" (broken LLM possessive, not valid English)
  t = t.replace(/\bYou's\b/g, "Your");
  t = t.replace(/\byou's\b/g, "your");

  // 11. Garbled tokens: digits mixed into letter sequences (LLM hallucination)
  t = t.replace(/\b[a-zA-Z]+\d+[a-zA-Z]+\b/g, "");   // "exer0376fing"
  t = t.replace(/\b[a-zA-Z]{2,}\d{3,}\b/g, "");        // "exer0376"
  t = t.replace(/\s{2,}/g, " ").trim();                 // clean up gaps

  return t;
}
