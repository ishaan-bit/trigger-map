/**
 * Ollama Chat — shared wrapper around the native Ollama /api/chat endpoint.
 *
 * Uses the native API (not /v1/chat/completions) so we can pass `num_ctx`
 * and `num_gpu` to control VRAM usage on GPUs with limited memory
 * (e.g. Intel Arc 140V, 8 GB).
 *
 * num_gpu controls how many model layers are offloaded to GPU (rest on CPU).
 * Setting it below the total layer count leaves VRAM headroom for the KV cache.
 */

const DEFAULT_NUM_CTX = 4096;
const DEFAULT_NUM_GPU = 26; // phi3 has 32 layers; 26 on GPU ≈ 81% GPU / 19% CPU

/**
 * Send a chat completion request via the native Ollama API.
 *
 * @param {object}  opts
 * @param {string}  opts.apiUrl      – base URL, e.g. "http://localhost:11434/v1"
 * @param {string}  opts.model       – model name
 * @param {Array}   opts.messages    – [{role, content}]
 * @param {number}  [opts.temperature=0.2]
 * @param {number}  [opts.maxTokens=375]
 * @param {number}  [opts.numCtx]    – context window (default: DEFAULT_NUM_CTX)
 * @param {number}  [opts.timeoutMs=600000]
 * @returns {Promise<{content: string, finishReason: string, promptTokens: number, completionTokens: number}>}
 */
export async function ollamaChat({
  apiUrl,
  model,
  messages,
  temperature = 0.2,
  maxTokens = 375,
  numCtx,
  timeoutMs = 600_000,
}) {
  // Strip /v1 suffix if present — native API lives at the root
  const nativeBase = apiUrl.replace(/\/v1\/?$/, "");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${nativeBase}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        options: {
          temperature,
          num_predict: maxTokens,
          num_ctx: numCtx || parseInt(process.env.OLLAMA_NUM_CTX, 10) || DEFAULT_NUM_CTX,
          num_gpu: parseInt(process.env.OLLAMA_NUM_GPU, 10) || DEFAULT_NUM_GPU,
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`LLM API returned ${response.status}: ${text}`);
    }

    const data = await response.json();
    const content = data.message?.content?.trim() || "";

    return {
      content,
      finishReason: data.done_reason === "length" ? "length" : "stop",
      promptTokens: data.prompt_eval_count || 0,
      completionTokens: data.eval_count || 0,
    };
  } finally {
    clearTimeout(timeout);
  }
}
