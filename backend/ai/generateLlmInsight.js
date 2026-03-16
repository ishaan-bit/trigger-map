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
  const sparse = (report.dataQuality?.totalMoments || 0) < 8;

  return `You are the pattern reader for TriggerMap. The user logs emotional triggers (work, social, money, family, exercise, health, sleep, partner) and how each made them feel (calm, neutral, anxious, frustrated, energized).

Below are structured signals from the user's past week. ONLY reference what appears here.

${signals}

Write a pattern read using EXACTLY this structure:

**What stood out**
One or two sentences about the most notable pattern or shift this week. Be specific.

**What may be contributing**
One sentence connecting a trigger-emotion pairing to a possible cause. ${sparse ? "Acknowledge the data is limited." : "Be grounded in the numbers."}

**One thing to try**
A single concrete, small experiment for next week. Make it specific to their top trigger.

Rules:
- Total length: 60-90 words. Do not exceed 100 words.
- Do not invent data. Do not repeat raw numbers already visible on screen.
- Do not moralize, lecture, or use therapeutic language.
- Do not use em dashes, colons in headers, or bullet markers.
- Tone: calm, direct, perceptive. Like a sharp friend, not a therapist.
- ${sparse ? "This user has limited data. Be honest about what you can and cannot see." : "Be confident but not certain."}`;
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
          { role: "system", content: "You are a concise behavioral pattern reader. Write structured, grounded observations from data. Use plain sentences. Never use em dashes, bullet points, or numbered lists. Keep total output under 100 words." },
          { role: "user", content: prompt },
        ],
        temperature: 0.6,
        max_tokens: 250,
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

    // Clean up formatting artifacts the model may produce
    content = content
      .replace(/\u2014/g, ", ")
      .replace(/\u2013/g, ", ")
      .replace(/\*\*/g, "")          // strip markdown bold
      .replace(/^[-*]\s+/gm, "")     // strip bullet markers
      .replace(/\n{3,}/g, "\n\n")    // collapse excess newlines
      .trim();

    return {
      narrative: content,
      model: `llm-${model}`,
      generatedAt: new Date().toISOString(),
    };
  } finally {
    clearTimeout(timeout);
  }
}
