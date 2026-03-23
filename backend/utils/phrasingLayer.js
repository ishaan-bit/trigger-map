/**
 * HF Phrasing Layer — lightweight text polishing via HuggingFace Inference API.
 *
 * ONLY used during batch jobs (weekly reports, action generation, LLM post-processing).
 * NEVER called in the request-response path.
 *
 * Fallback: returns original text on error, timeout, or missing HF_TOKEN.
 */

const HF_TIMEOUT_MS = 1500;
const HF_MODEL = "google/gemma-2b-it";

/**
 * Polish a short text block: tighten grammar, shorten, keep meaning.
 * Returns original text on any failure.
 *
 * @param {string} inputText - text to polish
 * @param {{ firstName?: string|null }} [opts] - optional personalisation
 * @returns {Promise<string>} polished (or original) text
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

    // Strip the prompt echo if HF returns the full input+output
    const echoIdx = generated.lastIndexOf("Text:\n");
    const cleaned = echoIdx >= 0
      ? generated.slice(echoIdx + 6).trim()
      : generated;

    // Sanity: if rewrite is longer than 2× original, keep original
    if (cleaned.length > inputText.length * 2) return inputText;
    return cleaned || inputText;
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
