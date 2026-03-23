/**
 * Phrasing Layer — text polishing for user-facing content.
 *
 * Local deterministic polisher by default; optional HF API call when explicitly
 * requested (e.g. via ops console toggle). The local path is fast, reliable,
 * and never degrades already well-written text.
 *
 * Fallback: always returns original text on any failure.
 */

const HF_TIMEOUT_MS = 4000;
const HF_MODEL = "google/gemma-2b-it";

// ── Local polish (default) ──────────────────────────────────────────────────

/**
 * Deterministic text polish: fix common artifacts without calling any external API.
 * Safe to call on every path (live API, batch, console-triggered).
 */
function localPolish(text) {
  if (!text || typeof text !== "string") return text ?? "";
  return text
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

// ── HF API path (opt-in only) ───────────────────────────────────────────────

// Prompt fragments that indicate the model echoed instructions
const PROMPT_LEAK_PATTERNS = [
  /rewrite the following/i,
  /do not[:\s]/i,
  /grammatically correct/i,
  /add new information/i,
  /change meaning/i,
  /concise \(max/i,
  /clear and natural/i,
  /introduce new insights/i,
  /address the reader/i,
  /\bText:\s*$/m,
];

/**
 * Check if HF output passes quality bar vs the original.
 */
function passesQualityGate(original, candidate) {
  if (!candidate || candidate.length < 10) return false;
  if (candidate.length < original.length * 0.4) return false;
  if (candidate.length > original.length * 2) return false;

  for (const pat of PROMPT_LEAK_PATTERNS) {
    if (pat.test(candidate)) return false;
  }

  // Reject if high ratio of non-word characters
  const wordChars = candidate.replace(/[^a-zA-Z0-9\s]/g, "").length;
  if (wordChars / candidate.length < 0.7) return false;

  // Reject consecutive special chars
  if (/[^a-zA-Z0-9\s]{4,}/.test(candidate)) return false;

  // Reject repeated characters
  if (/(.)\1{4,}/.test(candidate)) return false;

  // Reject if too many words differ (meaning was likely changed)
  const origWords = new Set(original.toLowerCase().split(/\s+/));
  const candWords = candidate.toLowerCase().split(/\s+/);
  const overlap = candWords.filter(w => origWords.has(w)).length;
  if (candWords.length > 5 && overlap / candWords.length < 0.3) return false;

  return true;
}

/**
 * Call HuggingFace API to polish text. Only used when explicitly enabled.
 * Returns original text on any failure or quality concern.
 */
async function hfPolish(inputText, opts = {}) {
  const token = process.env.HF_TOKEN;
  if (!token) return inputText;

  const firstName = opts.firstName || null;
  const nameInstruction = firstName
    ? `\nIf natural, address the reader as "${firstName}" once (not forced).`
    : "";

  const prompt = `Rewrite the following text to be clearer and more natural. Keep it concise (max 2 sentences). Use correct grammar and spelling.

Do not add new information. Do not change numbers or meaning.${nameInstruction}

Text:
${inputText}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HF_TIMEOUT_MS);

  try {
    const res = await fetch(
      `https://api-inference.huggingface.co/models/${HF_MODEL}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inputs: prompt,
          parameters: { max_new_tokens: 120, temperature: 0.2 },
        }),
        signal: controller.signal,
      }
    );

    if (!res.ok) return inputText;
    const data = await res.json();
    const generated = Array.isArray(data)
      ? data[0]?.generated_text?.trim()
      : data?.generated_text?.trim();
    if (!generated || generated.length < 5) return inputText;

    // Strip echo
    let cleaned = generated;
    const echoMarkers = ["Text:\n", "Text: \n", "Text:\r\n", "\nText:"];
    for (const marker of echoMarkers) {
      const idx = generated.lastIndexOf(marker);
      if (idx >= 0) {
        cleaned = generated.slice(idx + marker.length).trim();
        break;
      }
    }

    // If still includes prompt, try splitting on original
    if (cleaned.length > inputText.length * 1.8 && cleaned.includes(inputText)) {
      const after = cleaned.slice(cleaned.lastIndexOf(inputText) + inputText.length).trim();
      if (after.length >= 10) cleaned = after;
    }

    // Clean artifacts then run through local polish too
    cleaned = localPolish(cleaned);

    if (!passesQualityGate(inputText, cleaned)) return inputText;
    return cleaned;
  } catch {
    return inputText;
  } finally {
    clearTimeout(timer);
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Polish a text block. By default uses fast local deterministic cleaning.
 * Set opts.useHf = true to also run through HuggingFace API (with fallback).
 *
 * @param {string} inputText
 * @param {{ firstName?: string|null, useHf?: boolean }} [opts]
 * @returns {Promise<string>}
 */
export async function phraseText(inputText, opts = {}) {
  if (!inputText || typeof inputText !== "string") return inputText ?? "";

  // Always run local polish first
  let result = localPolish(inputText);

  // Only call HF if explicitly opted in
  if (opts.useHf) {
    result = await hfPolish(result, opts);
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
 * @param {{ firstName?: string|null, useHf?: boolean }} [opts]
 * @returns {Promise<string[]>}
 */
export async function phraseTexts(texts, opts = {}) {
  const results = [];
  for (const t of texts) {
    results.push(await phraseText(t, opts));
  }
  return results;
}
