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

function buildSignals(report, recentNotes) {
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

  const tagEntries = Object.entries(report.tagFrequency || {}).sort(([, a], [, b]) => b - a);
  if (tagEntries.length) {
    const topTags = tagEntries.slice(0, 5).map(([tag, count]) => `${tag} (${count}x)`);
    lines.push(`Context tags: ${topTags.join(", ")}.`);
  }

  const pa = report.predictionAccuracy;
  if (pa && pa.daysCompared >= 2) {
    lines.push(`Prediction accuracy: ${pa.correct} of ${pa.daysCompared} days matched (${Math.round(pa.rate * 100)}%).`);
  }

  const dailyPredictions = (report.dailyAggregates || []).filter(d => d.prediction && Number(d.total || 0) > 0);
  if (dailyPredictions.length) {
    const pLines = dailyPredictions.map(d => {
      const actual = Object.entries(d.emotions || {}).sort(([, a], [, b]) => b - a)[0]?.[0] || "unknown";
      return `${d.date}: predicted ${d.prediction}, actual ${actual}`;
    });
    lines.push(`Daily predictions vs reality: ${pLines.join("; ")}.`);
  }

  if (recentNotes?.length) {
    const noteLines = recentNotes.map(n => `[${n.trigger}/${n.emotion}] "${n.note}"`);
    lines.push(`Recent user notes:\n${noteLines.join("\n")}`);
  }

  return lines.join("\n");
}

function buildPrompt(report, recentNotes) {
  const signals = buildSignals(report, recentNotes);
  const sparse = (report.dataQuality?.totalMoments || 0) < 8;
  const hasTags = Object.keys(report.tagFrequency || {}).length > 0;
  const hasPredictions = report.predictionAccuracy && report.predictionAccuracy.daysCompared >= 2;
  const hasNotes = recentNotes?.length > 0;

  return `You are the pattern reader for TriggerMap. The user logs emotional triggers (work, family, partner, social, alone, exercise, travel, health, money) and how each made them feel (calm, neutral, anxious, frustrated, energized).${hasTags ? " They also add optional context tags (e.g. deadline, conflict, distance) to describe the type of moment." : ""}${hasPredictions ? " Each morning they predict how the day will feel. You have their predictions vs actual outcomes." : ""}

Below are structured signals from the user's past week. ONLY reference what appears here.

${signals}

Respond with EXACTLY three sections, each starting with the header on its own line. Do NOT repeat any section. Write each section ONCE only.

What stood out
One or two sentences about the most notable pattern or shift this week. Be specific.

What may be contributing
One sentence connecting a trigger-emotion pairing to a possible cause. ${sparse ? "Acknowledge the data is limited." : "Be grounded in the numbers."}

One thing to try
A single concrete, small experiment for next week. Make it specific to their top trigger.

Rules:
- Output EXACTLY three sections. STOP after "One thing to try" section. Do not write anything after it.
- Total length: 60-90 words. Do not exceed 100 words.
- Do not invent data. Do not repeat raw numbers already visible on screen.
- Do not moralize, lecture, or use therapeutic language.
- Do not use em dashes, colons in headers, bullet markers, or bold markers.${hasTags ? "\n- If context tags are present, weave them naturally into your observations. Prefer note content over tags." : ""}${hasPredictions ? "\n- If prediction data is present, compare expected vs actual emotional patterns. Identify gaps between anticipation and lived experience. Prediction is a supporting signal, not the focus." : ""}${hasNotes ? "\n- User notes provide direct context. Weave their own words naturally. Priority: notes > tags > predictions." : ""}
- Tone: calm, direct, perceptive. Like a sharp friend, not a therapist.
- ${sparse ? "This user has limited data. Be honest about what you can and cannot see." : "Be confident but not certain."}`;
}

export async function generateLlmInsight({ weeklyReport, recentNotes = [] }) {
  const apiUrl = process.env.LLM_API_URL || DEFAULT_API_URL;
  const model = process.env.LLM_MODEL || DEFAULT_MODEL;

  const prompt = buildPrompt(weeklyReport, recentNotes);

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

    // Normalize variant section headers to canonical names.
    // Match header at start of line; handle both "Header\n" and "Header: content..." forms.
    content = content
      .replace(/^[ \t]*(?:most\s+)?notable\s+pattern[s]?[ \t]*:?[ \t]*/gmi, "What stood out\n")
      .replace(/^[ \t]*what\s+(?:stood|stands)\s+out[ \t]*:?[ \t]*/gmi, "What stood out\n")
      .replace(/^[ \t]*(?:possible|potential|likely)\s+(?:cause|contributing(?:\s+factor)?)[s]?[ \t]*:?[ \t]*/gmi, "What may be contributing\n")
      .replace(/^[ \t]*what\s+may\s+be\s+contributing[ \t]*:?[ \t]*/gmi, "What may be contributing\n")
      .replace(/^[ \t]*(?:one\s+thing\s+to\s+try|something\s+to\s+try|try\s+this)[ \t]*:?[ \t]*/gmi, "One thing to try\n")
      .replace(/\n{3,}/g, "\n\n");

    // Strip any preamble text before the first recognized section header
    const firstHeaderMatch = content.match(/^What stood out|^What may be contributing|^One thing to try/mi);
    if (firstHeaderMatch) {
      content = content.slice(firstHeaderMatch.index).trim();
    }

    // Truncate after the first complete 3-section set (some models repeat sections)
    const sectionHeaders = /(?:what stood out|what may be contributing|one thing to try)/gi;
    const headerPositions = [];
    let hm;
    while ((hm = sectionHeaders.exec(content)) !== null) {
      headerPositions.push({ idx: hm.index, text: hm[0].toLowerCase() });
    }
    const seenHeaders = new Set();
    for (const hp of headerPositions) {
      if (seenHeaders.has(hp.text)) {
        content = content.slice(0, hp.idx).trim();
        break;
      }
      seenHeaders.add(hp.text);
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
