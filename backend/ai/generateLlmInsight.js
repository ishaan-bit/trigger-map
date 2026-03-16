/**
 * LLM-based premium insight generator.
 *
 * Runs against a local OpenAI-compatible API (Ollama, llama.cpp, LM Studio).
 * Receives structured signals from the rebuilt patternEngine — never raw JSON dumps.
 *
 * Output: 1 compact paragraph OR 3 sharp bullets + 1 micro-experiment.
 * Tone: calm, observant, grounded. No essays, no fake-therapeutic language.
 */

const DEFAULT_API_URL = "http://localhost:11434/v1";
const DEFAULT_MODEL = "mistral";
const REQUEST_TIMEOUT_MS = 300_000;

function buildSignals(report) {
  const lines = [];
  const dq = report.dataQuality || {};

  lines.push(`Moments logged: ${dq.totalMoments || 0} over ${dq.daysLogged || 0} days.`);
  lines.push(`Confidence: ${dq.confidence || "unknown"}.`);

  if (report.topTrigger) {
    lines.push(`Dominant trigger: ${report.topTrigger}.`);
  } else if (report.tiedTriggers?.length) {
    lines.push(`Tied triggers (no dominant): ${report.tiedTriggers.join(", ")}.`);
  }

  if (report.topEmotion) {
    lines.push(`Dominant emotion: ${report.topEmotion}.`);
  } else if (report.tiedEmotions?.length) {
    lines.push(`Tied emotions: ${report.tiedEmotions.join(", ")}.`);
  }

  if (report.regulators?.length) {
    const regs = report.regulators.slice(0, 3).map(r => `${r.trigger} + ${r.emotion} (${r.count}x)`);
    lines.push(`Regulators (positive pairings): ${regs.join("; ")}.`);
  }

  if (report.frictionZones?.length) {
    const fz = report.frictionZones.slice(0, 3).map(f => `${f.trigger} + ${f.emotion} (${f.count}x)`);
    lines.push(`Friction zones (negative pairings): ${fz.join("; ")}.`);
  }

  if (report.volatilityScore !== null && report.volatilityScore !== undefined) {
    lines.push(`Volatility score: ${report.volatilityScore} (${report.volatilityScore < 0.5 ? "steady" : report.volatilityScore < 1.5 ? "moderate swings" : "high swings"}).`);
  }

  if (report.trajectoryNote) {
    lines.push(`Trajectory: ${report.trajectoryNote}`);
  }

  if (report.busiestTime) {
    lines.push(`Busiest time of day: ${report.busiestTime}.`);
  }

  if (report.triggerConcentration !== undefined) {
    lines.push(`Trigger diversity: ${report.triggerConcentration < 0.3 ? "spread broadly" : report.triggerConcentration < 0.5 ? "moderately concentrated" : "dominated by few"}.`);
  }

  return lines.join("\n");
}

function buildPrompt(report) {
  const signals = buildSignals(report);

  return `You are a behavioral pattern reader for TriggerMap. The user logs emotional triggers (work, social, money, family, exercise, health, sleep, partner) and how each made them feel (calm, neutral, anxious, frustrated, energized).

Below are structured signals from the user's past week. Only reference what appears here.

${signals}

Write a compact pattern read. Rules:
- Either one short paragraph (4-5 sentences max) OR three sharp bullet points.
- End with one concrete micro-experiment the user could try this week.
- Reference specific triggers and emotions from the signals above.
- Do not invent data that is not in the signals.
- Do not contradict the signals (e.g. do not call a week calm if volatility is high).
- Never use em dashes. Use commas, semicolons, or periods.
- Tone: calm, direct, perceptive. Not warm, not clinical, not poetic.
- Stay under 150 words.`;
}

export async function generateLlmInsight({ weeklyReport }) {
  const apiUrl = process.env.LLM_API_URL || DEFAULT_API_URL;
  const model = process.env.LLM_MODEL || DEFAULT_MODEL;

  const prompt = buildPrompt(weeklyReport);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${apiUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "You are a concise behavioral pattern reader. Write grounded, compact observations from structured data. Never use em dashes." },
          { role: "user", content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 350,
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

    // Strip any em dashes the model sneaks through
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
