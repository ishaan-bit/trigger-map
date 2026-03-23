/**
 * HF Phrasing Layer — lightweight text polishing via HuggingFace Inference API.
 *
 * Fallback: returns original text on error, timeout, quality failure, or missing HF_TOKEN.
 */

const HF_TIMEOUT_MS = 3000;
const HF_MODEL = "google/gemma-2b-it";

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
 * Returns true only if the output is clean enough to use.
 */
function passesQualityGate(original, candidate) {
  if (!candidate || candidate.length < 10) return false;

  // Reject if too short (lost >60% of content)
  if (candidate.length < original.length * 0.35) return false;

  // Reject if way too long (ballooned, likely hallucinated)
  if (candidate.length > original.length * 2.2) return false;

  // Reject if it contains prompt leak fragments
  for (const pat of PROMPT_LEAK_PATTERNS) {
    if (pat.test(candidate)) return false;
  }

  // Reject if high ratio of non-word characters (garbled output)
  const wordChars = candidate.replace(/[^a-zA-Z0-9\s]/g, "").length;
  const ratio = wordChars / candidate.length;
  if (ratio < 0.65) return false;

  // Reject if it has consecutive special chars (garbled)
  if (/[^a-zA-Z0-9\s]{4,}/.test(candidate)) return false;

  // Reject if it has orphaned single characters suggesting broken encoding
  if ((/(?:^|\s)[^aAiI\d](?:\s|$)/g.exec(candidate) || []).length > 2) return false;

  // Reject if it has suspicious repeated characters (e.g. "zzzzz", "????")
  if (/(.)\1{4,}/.test(candidate)) return false;

  return true;
}

/**
 * Polish a short text block: tighten grammar, shorten, keep meaning.
 * Returns original text on any failure or quality concern.
 */
export async function phraseText(inputText, opts = {}) {
  if (!inputText || typeof inputText !== "string") return inputText ?? "";
  const token = process.env.HF_TOKEN;
  if (!token) return inputText;

  const firstName = opts.firstName || null;
  const nameInstruction = firstName
    ? `\nIf natural, address the reader as "${firstName}" once (not forced).`
    : "";

  const prompt = `Rewrite the following text to be:
- clear and natural
- concise (max 2 sentences)
- grammatically correct

DO NOT:
- add new information
- change numbers
- change meaning
- introduce new insights${nameInstruction}

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
          parameters: { max_new_tokens: 120, temperature: 0.3 },
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

    // Strip the prompt echo — HF text-generation returns full input+output.
    // Try several echo markers to find where the original input ended.
    let cleaned = generated;
    const echoMarkers = ["Text:\n", "Text: \n", "Text:\r\n", "\nText:"];
    for (const marker of echoMarkers) {
      const idx = generated.lastIndexOf(marker);
      if (idx >= 0) {
        cleaned = generated.slice(idx + marker.length).trim();
        break;
      }
    }

    // If we still have the full prompt, try splitting on the original text
    if (cleaned.length > inputText.length * 1.8 && cleaned.includes(inputText)) {
      const afterOriginal = cleaned.slice(cleaned.lastIndexOf(inputText) + inputText.length).trim();
      if (afterOriginal.length >= 10) cleaned = afterOriginal;
    }

    // Strip common HF artifacts
    cleaned = cleaned
      .replace(/^\s*[-*•]\s*/gm, "")          // leading bullet markers
      .replace(/\*\*/g, "")                     // bold markers
      .replace(/#{1,3}\s*/g, "")               // headers
      .replace(/[\u200b-\u200f\ufeff]/g, "")   // zero-width chars
      .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "") // control chars
      .replace(/\u2014/g, ", ")                // em dash
      .replace(/\u2013/g, ", ")                // en dash
      .replace(/\u2018|\u2019/g, "'")          // smart single quotes
      .replace(/\u201c|\u201d/g, '"')          // smart double quotes
      .replace(/\s{2,}/g, " ")                 // collapse double spaces
      .trim();

    // Quality gate: reject garbled, truncated, or hallucinated output
    if (!passesQualityGate(inputText, cleaned)) return inputText;

    return cleaned;
  } catch {
    return inputText;
  } finally {
    clearTimeout(timer);
  }
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
 * Processes sequentially to respect HF rate limits.
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
