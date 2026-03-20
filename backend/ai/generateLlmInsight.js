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

  return `Here are structured signals from a user's recent emotional data. Only reference what appears below.

---
${signals}
---

Using ONLY the data above, write EXACTLY three sections. Each section MUST start with the exact header text on its own line, followed by the content on the NEXT line. Do not put the header and content on the same line.

Section 1 header: What stood out
Section 1 content: One or two sentences about the most notable pattern or shift. Be specific to the data.

Section 2 header: What may be contributing
Section 2 content: One sentence connecting a trigger-emotion pairing to a possible cause.${sparse ? " Acknowledge the data is limited." : ""}

Section 3 header: One thing to try
Section 3 content: A single concrete, small experiment for next week tied to their top trigger.

IMPORTANT:
- Output ONLY the three sections. Nothing before "What stood out" or after the last section.
- Do NOT echo or repeat any part of these instructions.
- Total length: 60-90 words. Do not exceed 100 words.
- Do not invent data or repeat raw numbers.
- Do not moralize or use therapeutic language.
- No em dashes, colons in headers, bullet markers, bold markers, or markdown.${hasTags ? "\n- Weave context tags naturally. Prefer note content over tags." : ""}${hasPredictions ? "\n- Compare expected vs actual emotional patterns from prediction data." : ""}${hasNotes ? "\n- Weave user notes naturally. Priority: notes > tags > predictions." : ""}
- Tone: calm, direct, perceptive.${sparse ? "\n- Limited data. Be honest about what you can and cannot see." : ""}`;
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
          { role: "system", content: "Write concise emotional pattern observations. Plain sentences only. No em dashes, bullet points, numbered lists, or markdown. Never repeat the prompt or instructions in your response." },
          { role: "user", content: prompt },
        ],
        temperature: 0.6,
        max_tokens: 200,
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
      .replace(/#{1,3}\s*/g, "")     // strip markdown headers
      .replace(/\n{3,}/g, "\n\n")    // collapse excess newlines
      .trim();

    // Strip prompt echo lines the model may repeat back
    content = content
      .replace(/^.*(?:you are (?:a|the)\s+(?:\w+\s+)*(?:pattern|behavioral)|write concise|plain sentences only|never repeat|emotional pattern observations).*$/gmi, "")
      .replace(/^.*(?:structured signals|only reference what|using only the data|do not echo|do not repeat).*$/gmi, "")
      .replace(/^.*(?:section \d header|section \d content|IMPORTANT).*$/gmi, "")
      .replace(/^.*(?:em dashes|bullet (?:markers|points)|numbered lists|bold markers|no markdown).*$/gmi, "")
      .replace(/^.*(?:total length|do not exceed \d+ words|60.*90 words).*$/gmi, "")
      .trim();

    // Strip format-description echoes the model may copy as content prefixes
    content = content
      .replace(/one or two sentences about the most notable (?:pattern|shift)[:\s.]*/gi, "")
      .replace(/one sentence connecting a trigger[- ]emotion pairing to a possible cause[:\s.]*/gi, "")
      .replace(/a single concrete,? small experiment for next week[^.]*?[:\s.]*/gi, "")
      .replace(/be specific to the data\.?\s*/gi, "")
      .trim();

    // Normalize variant section headers to canonical names.
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

    // Validate all 3 sections exist with actual content, then recompose cleanly
    const REQUIRED = ["What stood out", "What may be contributing", "One thing to try"];
    const extracted = [];
    for (const header of REQUIRED) {
      const hIdx = content.toLowerCase().indexOf(header.toLowerCase());
      if (hIdx === -1) {
        throw new Error(`LLM output missing section: "${header}"`);
      }
      const afterHeader = content.slice(hIdx + header.length);
      let sectionEnd = afterHeader.length;
      for (const other of REQUIRED) {
        if (other === header) continue;
        const nIdx = afterHeader.toLowerCase().indexOf(other.toLowerCase());
        if (nIdx > 0 && nIdx < sectionEnd) sectionEnd = nIdx;
      }
      const body = afterHeader.slice(0, sectionEnd).replace(/^[\s:\-]*/, "").trim();
      // Truncate at paragraph break to discard trailing hallucinations
      const paraBreak = body.indexOf("\n\n");
      const trimmedBody = paraBreak > 0 ? body.slice(0, paraBreak).trim() : body;
      if (trimmedBody.length < 8) {
        throw new Error(`Section "${header}" has no meaningful content (got: "${trimmedBody}")`);
      }
      extracted.push({ header, body: trimmedBody });
    }

    // Recompose from extracted sections only — discards trailing hallucinations
    content = extracted.map(s => `${s.header}\n${s.body}`).join("\n\n");

    return {
      narrative: content,
      model: `llm-${model}`,
      generatedAt: new Date().toISOString(),
    };
  } finally {
    clearTimeout(timeout);
  }
}
