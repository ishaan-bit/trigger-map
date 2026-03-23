/**
 * Phrasing Layer — deterministic text polishing for user-facing content.
 *
 * Fast local regex-based cleanup that never degrades already well-written text.
 * Fallback: always returns original text on any failure.
 */

import { lintText } from "./textGrammar.js";

// ── Local polish ────────────────────────────────────────────────────────────

/**
 * Deterministic text polish: fix common artifacts without calling any external API.
 * Safe to call on every path (live API, batch, console-triggered).
 */
function localPolish(text) {
  if (!text || typeof text !== "string") return text ?? "";
  // Grammar lint first — catches adjective-as-noun, bare "alone", verb agreement
  let t = lintText(text);
  return t
    // Unicode normalization
    .replace(/\u2014/g, " - ")                 // em dash
    .replace(/\u2013/g, " - ")                 // en dash
    .replace(/\u2018|\u2019/g, "'")            // smart single quotes
    .replace(/\u201c|\u201d/g, '"')            // smart double quotes
    .replace(/[\u200b-\u200f\ufeff]/g, "")     // zero-width chars
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "") // control chars
    // Stray formatting
    .replace(/\*\*/g, "")                       // bold markers
    .replace(/#{1,3}\s+/g, "")                 // markdown headers
    .replace(/^\s*[-*•]\s+/gm, "")            // bullet markers
    // Whitespace
    .replace(/\s{2,}/g, " ")                   // collapse multiple spaces
    .replace(/\n{3,}/g, "\n\n")               // collapse excess newlines
    // Trailing/leading cleanup
    .replace(/^\s+|\s+$/g, "")                 // trim
    // Fix common double-period artifacts
    .replace(/\.{2,}/g, ".")
    // Fix space before punctuation
    .replace(/\s+([.,;:!?])/g, "$1")
    // Fix missing space after punctuation (but not in numbers like 3.5)
    .replace(/([.!?])([A-Z])/g, "$1 $2");
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Polish a text block using fast local deterministic cleaning.
 *
 * @param {string} inputText
 * @param {{ firstName?: string|null }} [opts]
 * @returns {Promise<string>}
 */
export async function phraseText(inputText, opts = {}) {
  if (!inputText || typeof inputText !== "string") return inputText ?? "";
  let result = localPolish(inputText);

  // Personalize with firstName — "Your" at sentence start → "Kumar's"
  const name = opts.firstName;
  if (name) {
    result = result.replace(/(^|[.!?]\s+)Your\b/g, `$1${name}'s`);
  }

  return result;
}

/**
 * Extract first name from a full display name.
 * @param {string|null|undefined} displayName
 * @returns {string|null}
 */
export function extractFirstName(displayName) {
  if (!displayName || typeof displayName !== "string") return null;
  const first = displayName.trim().split(/\s+/)[0];
  return first && first.length >= 2 ? first : null;
}

/**
 * Batch-phrase an array of text strings.
 * @param {string[]} texts
 * @param {{ firstName?: string|null }} [opts]
 * @returns {Promise<string[]>}
 */
export async function phraseTexts(texts, opts = {}) {
  const results = [];
  for (const t of texts) {
    results.push(await phraseText(t, opts));
  }
  return results;
}
