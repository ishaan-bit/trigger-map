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
const PULL_TIMEOUT_MS = 600_000; // 10 min for model downloads

/**
 * Ensure the requested model is available in Ollama.
 * If not, pull it automatically. Uses the Ollama native API (not /v1).
 */
async function ensureModelAvailable(ollamaBase, model) {
  // ollamaBase is like "http://localhost:11434/v1" — strip /v1 for native API
  const nativeBase = ollamaBase.replace(/\/v1\/?$/, "");

  // Check if model exists
  try {
    const showRes = await fetch(`${nativeBase}/api/show`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: model }),
    });
    if (showRes.ok) return; // model already available
  } catch {
    // Ollama might not be running — let the main call handle the error
    return;
  }

  // Model not found — pull it
  console.log(`[LLM] Model "${model}" not found locally. Pulling from Ollama registry...`);
  const controller = new AbortController();
  const pullTimeout = setTimeout(() => controller.abort(), PULL_TIMEOUT_MS);

  try {
    const pullRes = await fetch(`${nativeBase}/api/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: model, stream: false }),
      signal: controller.signal,
    });

    if (!pullRes.ok) {
      const text = await pullRes.text();
      throw new Error(`Pull failed (${pullRes.status}): ${text}`);
    }

    console.log(`[LLM] Model "${model}" pulled successfully.`);
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error(`Model pull timed out after ${PULL_TIMEOUT_MS / 1000}s. Try pulling "${model}" manually: ollama pull ${model}`);
    }
    throw new Error(`Failed to pull model "${model}": ${err.message}`);
  } finally {
    clearTimeout(pullTimeout);
  }
}

function buildSignals(report, recentNotes, actionFeedback) {
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

  // Recurrence & streak signals (v81)
  if (report.recurrence?.length) {
    const top = report.recurrence.slice(0, 2).map(r => `${r.trigger} + ${r.emotion} (${r.count}x, ${r.label})`);
    lines.push(`Recurring patterns this week: ${top.join("; ")}.`);
  }
  if (report.positiveStreak) {
    lines.push(`Positive streak: ${report.positiveStreak.days} consecutive days of higher energy.`);
  }
  if (report.negativeStreak) {
    lines.push(`Low stretch: ${report.negativeStreak.days} consecutive days of lower energy.`);
  }

  if (report.busiestTime) {
    lines.push(`Busiest time of day: ${report.busiestTime}.`);
  }

  // Baseline & drift signals
  const bm = report.baselineMetrics;
  if (bm?.baseline?.reliable) {
    lines.push(`Personal emotional baseline: ${bm.baseline.score.toFixed(1)}/5 (${bm.baseline.label}), based on ${bm.baseline.daysUsed} days of data.`);
    if (bm.recentAverage !== null) {
      lines.push(`Recent 7-day average: ${bm.recentAverage.toFixed(1)}/5.`);
    }
    if (bm.drift) {
      lines.push(`Emotional drift: ${bm.drift.label} (${bm.drift.value > 0 ? "+" : ""}${bm.drift.value.toFixed(2)} from baseline).`);
    }
    if (bm.stability) {
      lines.push(`Stability: ${bm.stability.label} (${Math.round(bm.stability.score * 100)}% of days within normal range).`);
    }
    if (bm.recoveryLatency) {
      lines.push(`Recovery pattern: ${bm.recoveryLatency.label} (~${bm.recoveryLatency.days} days after dips).`);
    }
    if (bm.stateOfMind) {
      lines.push(`Current state: ${bm.stateOfMind}.`);
    }
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

  // Action feedback signals — what the user tried or skipped
  if (actionFeedback?.length) {
    const tried = actionFeedback.filter(f => f.response === "tried");
    const skipped = actionFeedback.filter(f => f.response === "skipped");
    if (tried.length) {
      lines.push(`Actions the user tried: ${tried.map(f => f.actionId).join(", ")}.`);
    }
    if (skipped.length) {
      lines.push(`Actions the user skipped: ${skipped.map(f => f.actionId).join(", ")}.`);
    }
  }

  if (recentNotes?.length) {
    const noteLines = recentNotes.map(n => `[${n.trigger}/${n.emotion}] "${n.note}"`);
    lines.push(`Recent user notes:\n${noteLines.join("\n")}`);
  }

  return lines.join("\n");
}

function buildPrompt(report, recentNotes, actionFeedback) {
  const signals = buildSignals(report, recentNotes, actionFeedback);
  const sparse = (report.dataQuality?.totalMoments || 0) < 8;
  const hasTags = Object.keys(report.tagFrequency || {}).length > 0;
  const hasPredictions = report.predictionAccuracy && report.predictionAccuracy.daysCompared >= 2;
  const hasNotes = recentNotes?.length > 0;

  const maxWords = parseInt(process.env.LLM_MAX_WORDS, 10) || 150;
  const minWords = Math.round(maxWords * 0.6);
  const hardCap = Math.round(maxWords * 1.1);
  const sentencesPerSection = maxWords <= 100 ? '1-2' : maxWords <= 200 ? '2-3' : '3-4';

  return `Here are structured signals from a user's recent emotional data. Only reference what appears below.

---
${signals}
---

Using ONLY the data above, write EXACTLY three short sections. Use the EXACT format shown in the example below.

EXAMPLE FORMAT (do not copy the content, only mimic the structure):

What stood out
Work-related triggers appeared most often this week, consistently paired with anxiety before deadlines. This pattern was strongest on Monday and Wednesday mornings. Evening entries showed a noticeable shift toward calm once the workday ended.

What may be contributing
The combination of deadline pressure and back-to-back meetings may be amplifying anticipatory stress. Having no buffer time between tasks could make each transition feel more intense.

One thing to try
Before your next presentation, spend five minutes writing down three things you know well about the topic. This small ritual can shift your focus from what might go wrong to what you already have ready.

END OF EXAMPLE. Now write your three sections using the data above.

Rules:
- Start with "What stood out" — no text before it.
- Each header must be alone on its own line, with the body on the next line.
- ${minWords}-${maxWords} words total. Do not exceed ${hardCap} words.
- Do not echo these instructions. Do not add any preamble or closing remarks.
- No em dashes, bullet markers, bold markers, colons in headers, or markdown.${hasTags ? "\n- Weave context tags naturally. Prefer note content over tags." : ""}${hasPredictions ? "\n- Compare expected vs actual emotional patterns from prediction data." : ""}${hasNotes ? "\n- Weave user notes naturally. Priority: notes > tags > predictions." : ""}
- Tone: calm, direct, perceptive.
- If action feedback data is provided, use it: acknowledge actions the user tried and tailor "One thing to try" to avoid suggesting things they already skipped. Build on what they engaged with.
- IMPORTANT: Only describe emotions and patterns that appear in the data. If the user logged mostly calm or neutral moments, reflect that positively. Never invent problems. If baseline/drift data is provided, reference it naturally.
- Use correct English spelling and grammar. No typos, no random numbers or characters.
- Each section body must be ${sentencesPerSection} sentences.${sparse ? "\n- Limited data. Be honest about what you can and cannot see." : ""}`;
}

/**
 * Trim trailing incomplete sentence — finds the last sentence-ending
 * punctuation (.!?) and drops everything after it.
 */
function trimIncomplete(text) {
  // Find the last sentence terminator (.!?) that is followed by a space,
  // newline, or end-of-string (avoids matching decimals like "0.5").
  const match = text.match(/^([\s\S]*[.!?])(?:\s|$)/);
  if (match) return match[1].trim();
  // No sentence-ending punctuation at all — return as-is (don't destroy everything)
  return text;
}

export async function generateLlmInsight({ weeklyReport, recentNotes = [], actionFeedback = [] }) {
  const apiUrl = process.env.LLM_API_URL || DEFAULT_API_URL;
  const model = process.env.LLM_MODEL || DEFAULT_MODEL;
  const maxWords = parseInt(process.env.LLM_MAX_WORDS, 10) || 150;

  // Auto-pull model if not available locally
  await ensureModelAvailable(apiUrl, model);

  const prompt = buildPrompt(weeklyReport, recentNotes, actionFeedback);

  // Scale max_tokens generously so the model never hits the ceiling mid-sentence.
  // The prompt word-limit is the real constraint; tokens are just a safety net.
  const maxTokens = Math.max(400, Math.round(maxWords * 3.5));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${apiUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "You are a concise emotional pattern analyst. Write plain, grammatically correct English sentences. No em dashes, bullet points, numbered lists, markdown, or special characters. Never repeat the prompt. Never invent data not provided. CRITICAL: Do not fabricate negative emotions, diagnoses, or weaknesses that are not explicitly present in the data. If the data shows calm, neutral, or positive emotions, reflect that honestly and positively. Never ascribe low confidence, depression, or negative traits unless the data clearly shows repeated negative emotion patterns. Be balanced and grounded. When data is positive or neutral, say so clearly. Default to a supportive, encouraging tone. If a user had a brief rough stretch but overall positive data, emphasize resilience and the positive majority." },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
        max_tokens: maxTokens,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`LLM API returned ${response.status}: ${text}`);
    }

    const data = await response.json();
    let content = data.choices?.[0]?.message?.content?.trim();
    const finishReason = data.choices?.[0]?.finish_reason;

    if (!content) {
      throw new Error("LLM returned empty response");
    }

    // If the model hit the token limit, the last sentence is likely incomplete.
    // Trim back to the last sentence-ending punctuation.
    if (finishReason === 'length') {
      content = trimIncomplete(content);
    }

    // Clean up formatting artifacts the model may produce
    content = content
      .replace(/\u2014/g, ", ")
      .replace(/\u2013/g, ", ")
      .replace(/\u2018|\u2019/g, "'")   // smart quotes to straight
      .replace(/\u201c|\u201d/g, '"')   // smart double quotes
      .replace(/\*\*/g, "")          // strip markdown bold
      .replace(/^[-*]\s+/gm, "")     // strip bullet markers
      .replace(/#{1,3}\s*/g, "")     // strip markdown headers
      .replace(/\n{3,}/g, "\n\n")    // collapse excess newlines
      .replace(/[\u200b-\u200f\ufeff]/g, "") // strip zero-width chars
      .replace(/(?:^|\n)\s*\d+\.\s*/g, "\n") // strip numbered list prefixes (1. 2. 3.)
      .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "") // strip control chars
      .replace(/\b(?:END OF (?:ANSWER|RESPONSE|OUTPUT)|<\/?(?:answer|response|output)>)\s*/gi, "") // strip end markers
      .replace(/\bthis user\b/gi, "you")  // convert 3rd person to 2nd person
      .replace(/\bthe user\b/gi, "you")
      .replace(/\btheir (?=emotion|trigger|pattern|mood|feeling|week|day|log)/gi, "your ")
      .trim();

    // Strip prompt echo lines the model may repeat back
    content = content
      .replace(/^.*(?:you are (?:a|the)\s+(?:\w+\s+)*(?:pattern|behavioral)|write concise|plain sentences only|never repeat|emotional pattern observations).*$/gmi, "")
      .replace(/^.*(?:structured signals|only reference what|using only the data|do not echo|do not repeat).*$/gmi, "")
      .replace(/^.*(?:section \d (?:header|content)|IMPORTANT|EXAMPLE FORMAT|END OF EXAMPLE|now write your).*$/gmi, "")
      .replace(/^.*(?:em dashes|bullet (?:markers|points)|numbered lists|bold markers|no markdown).*$/gmi, "")
      .replace(/^.*(?:total length|do not exceed \d+ words|60.*90 words|each header must be alone).*$/gmi, "")
      .replace(/^.*(?:do not copy the content|only mimic the structure|Rules:).*$/gmi, "")
      .trim();

    // Strip format-description echoes the model may copy as content prefixes
    content = content
      .replace(/one or two sentences about the most notable (?:pattern|shift)[:\s.]*/gi, "")
      .replace(/one sentence connecting a trigger[- ]emotion pairing to a possible cause[:\s.]*/gi, "")
      .replace(/a single concrete,? small experiment for next week[^.]*?[:\s.]*/gi, "")
      .replace(/be specific to the data\.?\s*/gi, "")
      .trim();

    // Normalize variant section headers to canonical names.
    // Handle numbered variants (e.g., "1. What stood out:", "Section 1: What stood out")
    content = content
      .replace(/^[ \t]*(?:\d+[.)]\s*)?(?:section\s*\d+[:\s]*)?(?:most\s+)?notable\s+pattern[s]?[ \t]*:?[ \t]*/gmi, "What stood out\n")
      .replace(/^[ \t]*(?:\d+[.)]\s*)?(?:section\s*\d+[:\s]*)?what\s+(?:stood|stands)\s+out[ \t]*:?[ \t]*/gmi, "What stood out\n")
      .replace(/^[ \t]*(?:\d+[.)]\s*)?(?:section\s*\d+[:\s]*)?(?:possible|potential|likely)\s+(?:cause|contributing(?:\s+factor)?)[s]?[ \t]*:?[ \t]*/gmi, "What may be contributing\n")
      .replace(/^[ \t]*(?:\d+[.)]\s*)?(?:section\s*\d+[:\s]*)?what\s+may\s+be\s+contributing[ \t]*:?[ \t]*/gmi, "What may be contributing\n")
      .replace(/^[ \t]*(?:\d+[.)]\s*)?(?:section\s*\d+[:\s]*)?(?:one\s+thing\s+to\s+try|something\s+to\s+try|try\s+this|suggestion|action\s*(?:item|step))[ \t]*:?[ \t]*/gmi, "One thing to try\n")
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

    // Validate sections exist with actual content, then recompose cleanly
    const REQUIRED = ["What stood out", "What may be contributing", "One thing to try"];
    const extracted = [];
    for (const header of REQUIRED) {
      const hIdx = content.toLowerCase().indexOf(header.toLowerCase());
      if (hIdx === -1) continue;
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
      let trimmedBody = paraBreak > 0 ? body.slice(0, paraBreak).trim() : body;
      // Trim any incomplete sentence at the end of the section
      trimmedBody = trimIncomplete(trimmedBody);
      // Clean stray LLM artifacts from section body
      trimmedBody = trimmedBody
        .replace(/^\d+[.)]\s*/gm, "")           // stray numbered prefixes
        .replace(/\s{2,}/g, " ")                 // collapse double spaces
        .replace(/([a-z])\s*\n\s*([a-z])/g, "$1 $2") // join broken sentences
        .replace(/[^\x20-\x7E\u00C0-\u024F',.\-!?()\n]/g, "") // strip non-printable/non-latin junk
        .trim();
      if (trimmedBody.length >= 8) {
        extracted.push({ header, body: trimmedBody });
      }
    }

    // Need at least 2 sections to accept the output
    if (extracted.length < 2) {
      const found = extracted.map(s => s.header).join(", ") || "none";
      throw new Error(`LLM output only had ${extracted.length} valid section(s) (${found})`);
    }

    // Recompose from extracted sections only — discards trailing hallucinations
    content = extracted.map(s => `${s.header}\n${s.body}`).join("\n\n");

    return {
      narrative: content,
      sectionCount: extracted.length,
      model: `llm-${model}`,
      generatedAt: new Date().toISOString(),
    };
  } finally {
    clearTimeout(timeout);
  }
}
