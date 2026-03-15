/**
 * LLM-based personalized insight generator.
 *
 * Designed to run LOCALLY — calls a local OpenAI-compatible API
 * (e.g. llama.cpp server, Ollama, or LM Studio).
 *
 * Recommended model: Mistral-7B-Instruct (GGUF Q4_K_M)
 *   - Free, high-quality summarization + narrative analysis
 *   - Intel Arc GPU supported via llama.cpp SYCL backend or Ollama
 *   - ~4.4 GB VRAM at Q4_K_M quantization
 *
 * Setup options:
 *   1. Ollama:       ollama run mistral
 *   2. llama.cpp:    ./server -m mistral-7b-instruct-v0.3.Q4_K_M.gguf --port 8080
 *   3. LM Studio:    Load Mistral 7B, enable local server on port 1234
 *
 * Environment:
 *   LLM_API_URL  — local endpoint (default: http://localhost:11434/v1)
 *   LLM_MODEL    — model name   (default: mistral)
 */

const DEFAULT_API_URL = "http://localhost:11434/v1";
const DEFAULT_MODEL = "mistral";
const REQUEST_TIMEOUT_MS = 120_000;

function buildPrompt({ weeklyReport, historicalReports, userTrends }) {
  const currentWeek = JSON.stringify(weeklyReport, null, 2);
  const history = historicalReports?.length
    ? historicalReports.map((r, i) => `Week ${i + 1}: top trigger=${r.topTrigger}, top emotion=${r.topEmotion}, moments=${r.totalMoments}`).join("\n")
    : "No historical data available yet.";

  const trends = userTrends
    ? `Behavioral trends: ${JSON.stringify(userTrends)}`
    : "";

  return `You are a compassionate behavioral pattern analyst for a mental health journaling app called TriggerMap. Users log emotional triggers (work, social, money, family, exercise, health, sleep, partner) and how each made them feel (calm, neutral, anxious, frustrated, energized).

Your task: Write a warm, personalized 3-4 paragraph narrative insight for this user's week. Be reflective, not judgmental. Reference specific patterns. Offer one concrete, actionable suggestion.

CURRENT WEEK DATA:
${currentWeek}

HISTORICAL SUMMARIES:
${history}

${trends}

Write the insight now. Address the user as "you". Keep it under 250 words. Do not use bullet points — write flowing paragraphs.`;
}

export async function generateLlmInsight({ weeklyReport, historicalReports, userTrends }) {
  const apiUrl = process.env.LLM_API_URL || DEFAULT_API_URL;
  const model = process.env.LLM_MODEL || DEFAULT_MODEL;

  const prompt = buildPrompt({ weeklyReport, historicalReports, userTrends });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${apiUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "You are a compassionate behavioral pattern analyst. Write warm, reflective insights." },
          { role: "user", content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 500,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`LLM API returned ${response.status}: ${text}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim();

    if (!content) {
      throw new Error("LLM returned empty response");
    }

    return {
      narrative: content,
      model: `llm-${model}`,
      generatedAt: new Date().toISOString(),
    };
  } finally {
    clearTimeout(timeout);
  }
}
