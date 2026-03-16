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
const REQUEST_TIMEOUT_MS = 300_000;

function buildPrompt({ weeklyReport, historicalReports, userTrends }) {
  const currentWeek = JSON.stringify(weeklyReport, null, 2);
  const history = historicalReports?.length
    ? historicalReports.map((r, i) => `Week ${i + 1}: top trigger=${r.topTrigger}, top emotion=${r.topEmotion}, moments=${r.totalMoments}`).join("\n")
    : "No historical data available yet.";

  const trends = userTrends
    ? `Behavioral trends: ${JSON.stringify(userTrends)}`
    : "";

  return `You are a behavioral pattern analyst for TriggerMap, a journaling app where users log emotional triggers (work, social, money, family, exercise, health, sleep, partner) and how each made them feel (calm, neutral, anxious, frustrated, energized).

Analyze this user's week with clinical depth and personal specificity. Your job is not to comfort but to illuminate. Identify:
- Cross-trigger emotional cascades (e.g. work stress spilling into partner interactions)
- Time-based behavioral rhythms (when certain triggers cluster and what that implies)
- Emotional asymmetries (triggers that provoke outsized reactions vs ones that stay stable)
- Avoidance or displacement patterns (conspicuous absences of certain triggers)
- Week-over-week drift if historical data exists (escalation, recovery, stagnation)

CURRENT WEEK DATA:
${currentWeek}

HISTORICAL SUMMARIES:
${history}

${trends}

Rules:
- Write 3 to 4 flowing paragraphs, no bullet points, no headers
- Address the user as "you"
- Never use em dashes. Use commas, semicolons, or periods instead
- Reference specific triggers and emotions from the data, not generic advice
- Include one precise, actionable micro-experiment the user could try next week
- Keep it under 280 words
- Sound like a sharp, perceptive counselor, not a greeting card`;
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
          { role: "system", content: "You are a sharp behavioral pattern analyst. Write incisive, data-grounded reflections that reveal hidden emotional dynamics. Never use em dashes." },
          { role: "user", content: prompt },
        ],
        temperature: 0.75,
        max_tokens: 600,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`LLM API returned ${response.status}: ${text}`);
    }

    const data = await response.json();
    let content = data.choices?.[0]?.message?.content?.trim();

    if (!content) {
      throw new Error("LLM returned empty response");
    }

    // Strip any em dashes that slipped through
    content = content.replace(/\u2014/g, ",").replace(/\u2013/g, ",");

    return {
      narrative: content,
      model: `llm-${model}`,
      generatedAt: new Date().toISOString(),
    };
  } finally {
    clearTimeout(timeout);
  }
}
