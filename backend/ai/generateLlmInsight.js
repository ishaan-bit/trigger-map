/**
 * LLM-based premium insight generator.
 *
 * Runs against a local OpenAI-compatible API (Ollama, llama.cpp, LM Studio).
 * Receives structured signals from the rebuilt patternEngine — never raw JSON dumps.
 *
 * Output: 1 compact paragraph OR 3 sharp bullets + 1 micro-experiment.
 * Tone: calm, observant, grounded. No essays, no fake-therapeutic language.
 */

import { getStylePrompt } from "./styleProfiles.js";
import { buildSignalProfile, buildSignalConstraints, rankSignals, detectRelationship } from "./signalProfile.js";
import { retrieveForLLM } from "../knowledge/ragEngine.js";
import { ollamaChat } from "./ollamaChat.js";

const DEFAULT_API_URL = "http://localhost:11434/v1";
const DEFAULT_MODEL = "phi3";
const REQUEST_TIMEOUT_MS = 600_000;
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

  // Silence signal: user returned after a gap
  if (dq.isSilent) {
    lines.push(`SILENCE CONTEXT: The user has not logged for ${dq.daysSinceLastLog} days. Last log was on ${dq.lastLogDate}. The data below is from their last active period, not the current week. Frame observations as "from your last active period" and gently encourage them to log again. Do NOT assume they are currently experiencing these patterns.`);
  }

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

  // Within-week trajectory slope (last 7 entries = this week's window)
  const traj = report.weeklyEmotionTrajectory || [];
  if (traj.length >= 3) {
    const recent = traj.slice(-7);
    const firstScore = recent[0].score;
    const lastScore = recent[recent.length - 1].score;
    const diff = lastScore - firstScore;
    if (Math.abs(diff) >= 0.3) {
      lines.push(`Within-week trajectory slope: ${diff > 0 ? '+' : ''}${diff.toFixed(1)} (from ${firstScore.toFixed(1)} on ${recent[0].date} to ${lastScore.toFixed(1)} on ${recent[recent.length - 1].date}).`);
    }
  }

  // Neutral dominance
  const emoFreq = report.emotionFrequency || {};
  const totalEmo = Object.values(emoFreq).reduce((s, v) => s + v, 0);
  const neutralPct = totalEmo > 0 ? Math.round((emoFreq.neutral || 0) / totalEmo * 100) : 0;
  if (neutralPct >= 40) {
    lines.push(`Neutral dominance: ${neutralPct}% of emotions logged were neutral.`);
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

  // Invoked metrics (computational behavioral model)
  const im = report.invokedMetrics;
  const cp = report.compoundPatterns;
  if (im) {
    lines.push(`Vacuum state (emotional ground truth with trigger influence removed): ${im.currentVacuum.toFixed(2)}/5, drift from baseline: ${im.vacuumDrift > 0 ? "+" : ""}${im.vacuumDrift.toFixed(2)}.`);
    lines.push(`Masking coefficient: ${im.weeklyMasking.coefficient.toFixed(2)} (${im.weeklyMasking.level}). ${im.weeklyMasking.alert ? "ALERT: behavioral patterns diverge from reported stability." : ""}`);
    if (im.contamination?.length) {
      const hotspots = im.contamination.map(c => `${c.sourceTrigger} → ${c.affectedTriggers.join(", ")}`);
      lines.push(`Context contamination: emotions from ${hotspots.join("; ")} bleed across contexts.`);
    }
    if (cp?.falseRecovery) {
      lines.push("FALSE RECOVERY detected: surface scores near baseline but underlying emotional state remains depressed.");
    }
    if (cp?.crashRisk) {
      lines.push("CRASH RISK detected: sustained positive surface with declining underlying state and elevated masking.");
    }
  }

  // Continuous emotion centroid signals
  const wc = report.weeklyCentroid;
  if (wc && wc.count > 0) {
    lines.push(`Emotional centroid (valence/arousal average): valence ${wc.valence.toFixed(2)}, arousal ${wc.arousal.toFixed(2)} — "${wc.label}" (based on ${wc.count} continuous entries).`);
  }
  const cDrift = report.centroidDrift;
  if (cDrift && (Math.abs(cDrift.valence) > 0.05 || Math.abs(cDrift.arousal) > 0.05)) {
    lines.push(`Centroid drift (start-of-week to end): valence ${cDrift.valence > 0 ? "+" : ""}${cDrift.valence.toFixed(2)}, arousal ${cDrift.arousal > 0 ? "+" : ""}${cDrift.arousal.toFixed(2)}.`);
  }
  const dc = report.dailyCentroids;
  if (dc?.length >= 3) {
    const trail = dc.map(d => `${d.date}: v${d.valence.toFixed(2)}/a${d.arousal.toFixed(2)}`);
    lines.push(`Daily centroid trail: ${trail.join(", ")}.`);
  }

  if (recentNotes?.length) {
    // Cap notes to prevent prompt from exceeding context window (VRAM-limited GPUs)
    const cappedNotes = recentNotes.slice(0, 8);
    const noteLines = cappedNotes.map(n => `[${n.trigger}/${n.emotion}] "${(n.note || "").slice(0, 120)}"`);
    lines.push(`Recent user notes:\n${noteLines.join("\n")}`);
  }

  // Signal profile constraints
  const sp = buildSignalProfile(report);
  const ranked = rankSignals(report, sp);
  const rel = detectRelationship(ranked);
  lines.push('');
  lines.push(buildSignalConstraints(sp));
  lines.push('');
  lines.push(`SIGNAL PRIORITY: Primary signal = ${ranked.primary?.type || 'none'} (${ranked.primary?.label || '-'}). Secondary signal = ${ranked.secondary?.type || 'none'} (${ranked.secondary?.label || '-'}).`);
  lines.push(`SIGNAL RELATIONSHIP: ${rel}. ${rel === 'contrast' ? 'These signals point in different directions. Describe the surface state, then reveal the underlying tension or shift.' : 'These signals reinforce each other. Describe what they consistently show.'}`);

  return lines.join("\n");
}

function buildPrompt(report, recentNotes, actionFeedback, lang = "en") {
  const signals = buildSignals(report, recentNotes, actionFeedback);
  let ragContext = "";
  try { ragContext = retrieveForLLM(report, 6) || ""; } catch (e) { console.error("[RAG] retrieveForLLM failed:", e.message); }
  const sparse = (report.dataQuality?.totalMoments || 0) < 8;
  const hasTags = Object.keys(report.tagFrequency || {}).length > 0;
  const hasPredictions = report.predictionAccuracy && report.predictionAccuracy.daysCompared >= 2;
  const hasNotes = recentNotes?.length > 0;
  const hi = lang === "hi";

  const maxWords = parseInt(process.env.LLM_MAX_WORDS, 10) || 150;
  const minWords = Math.round(maxWords * 0.6);
  const hardCap = Math.round(maxWords * 1.1);
  const sentencesPerSection = maxWords <= 100 ? '1-2' : maxWords <= 200 ? '2-3' : '3-4';

  const headerStoodOut = hi ? "क्या ख़ास रहा" : "What stood out";
  const headerContributing = hi ? "क्या कारण हो सकता है" : "What may be contributing";
  const headerTry = hi ? "एक बात आज़माएँ" : "One thing to try";

  const langRule = hi
    ? `\n- LANGUAGE: Write ENTIRELY in Hindi (Devanagari script). No English words, no Hinglish. Use natural conversational Hindi. Use 'आप' and 'आपका/आपकी' to address the user.`
    : "";

  return `Here are structured signals from a user's recent emotional data. Only reference what appears below.

---
${signals}
---${ragContext ? `\n\n${ragContext}` : ''}

Using ONLY the data above, write EXACTLY three short sections. Use the EXACT format shown in the example below.

EXAMPLE FORMAT (do not copy the content or themes, only mimic the structure):

${headerStoodOut}
${hi ? "इस हफ़्ते दोस्त आपका सबसे आम ट्रिगर रहा, और ख़ुशी सबसे ज़्यादा आने वाली भावना रही। हालाँकि वीकेंड पर ऊर्जा गिरी और लगातार दो बार थकान लॉग हुई।" : "Friends showed up as your most common trigger this week, and happy was the feeling that came with it most often. On the weekend though, your energy dipped and you logged a couple of tired entries back to back."}

${headerContributing}
${hi ? "सामाजिक समय मूड को ऊपर उठाता लगता है, लेकिन शनिवार तक शायद थकान हावी हो गई। हफ़्ते के अंत में गिरावट कम सामाजिक एंट्रीज़ के साथ दिखी।" : "The social time seems to lift your mood reliably, but by Saturday the pace may have caught up with you. The drop at the end of the week lined up with fewer social entries."}

${headerTry}
${hi ? "अगले वीकेंड एक शाम खाली रखें। सामाजिक समय और नए हफ़्ते के बीच अंतर रखने से ऊर्जा बनी रह सकती है।" : "Next weekend, try leaving one evening unplanned. Giving yourself a gap between social time and the start of the new week could help you hold on to more of that energy."}

END OF EXAMPLE. Now write your three sections using the data above.

CRITICAL RULES (must follow):
- ONLY describe emotions, triggers, and patterns that appear in the data above. Do not invent deadlines, meetings, mornings, evenings, or any context not present.
- Do NOT reference specific days of the week (Monday, Tuesday, etc.) unless they appear literally in the user's notes above. Never fabricate day references.
- If the SIGNAL PROFILE says FLATTENING DETECTED, the central story MUST be about emotional range narrowing toward neutral. Do not describe this as positive stability.
- If the data shows a Within-week trajectory decline, acknowledge the drop. Do not call the week stable or even.
- Never reference the user by name. Only use "${hi ? "आप" : "you"}" and "${hi ? "आपका" : "your"}".
- Never speculate about psychological states or coping ability. Only describe patterns visible in the data.
- Do NOT use words from the SIGNAL PROFILE labels (like "signal profile", "confidence", "volatility score", "drift", "alignment", "contrast") in your output. Describe patterns in plain everyday language.${langRule}

Format rules:
- Start with "${headerStoodOut}" — no text before it.
- Each header must be alone on its own line, with the body on the next line.
- ${minWords}-${maxWords} words total. HARD LIMIT: stop at ${hardCap} words. Write SHORT, crisp sentences.
- Do not echo these instructions. Do not add any preamble or closing remarks.
- No em dashes, bullet markers, bold markers, colons in headers, or markdown.${hasTags ? "\n- Weave context tags naturally. Prefer note content over tags." : ""}${hasPredictions ? "\n- Compare expected vs actual emotional patterns from prediction data." : ""}${hasNotes ? "\n- Weave user notes naturally. Priority: notes > tags > predictions." : ""}
- Tone: calm, direct, perceptive. Use simple everyday words. Avoid uncommon or technical vocabulary.
- Do NOT describe signals independently. Look for contrast (stable surface + subtle drift, active trigger + flat emotion) or alignment between signals. If contrasting, use structures like "${hi ? "जबकि X दिखता है..., Y बताता है..." : "While X appears..., Y suggests..."}" or "${hi ? "ऊपर से..., लेकिन अंदर..." : "On the surface..., but underneath..."}".
- Prioritize the most important 1-2 signals rather than listing everything.
- If action feedback data is provided, use it: acknowledge actions the user tried and tailor "${headerTry}" to avoid suggesting things they already skipped. Build on what they engaged with.${hi ? "" : "\n- Always use \"Your\" as the possessive form. Never write \"You's\" which is not valid English."}
- Each section body must be ${sentencesPerSection} sentences.
- Match language intensity to the SIGNAL PROFILE section. If it says subtle or weak, use restrained observational language.
- "${headerTry}" must be specific to the dominant pattern. If neutral-dominance and flattening are present, the suggestion should be about reintroducing variety or noticing more nuance, not about generic reflection or journaling.${sparse ? (hi ? "\n- सीमित डेटा। जो दिख रहा है और जो नहीं दिख रहा, उसके बारे में ईमानदार रहें।" : "\n- Limited data. Be honest about what you can and cannot see.") : ""}`;
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

export async function generateLlmInsight({ weeklyReport, recentNotes = [], actionFeedback = [], lang = "en" }) {
  const apiUrl = process.env.LLM_API_URL || DEFAULT_API_URL;
  const model = process.env.LLM_MODEL || DEFAULT_MODEL;
  const maxWords = parseInt(process.env.LLM_MAX_WORDS, 10) || 150;

  // Auto-pull model if not available locally
  await ensureModelAvailable(apiUrl, model);

const prompt = buildPrompt(weeklyReport, recentNotes, actionFeedback, lang);

    // Scale max_tokens — tight enough to discourage verbosity but with headroom
    // for the model to complete sentences. Roughly 1.5 tokens per word.
    // Hindi Devanagari tokens are larger — allow more headroom.
    const tokenMultiplier = lang === "hi" ? 3.5 : 2.5;
    const maxTokens = Math.max(300, Math.round(maxWords * tokenMultiplier));

    const systemBase = lang === "hi"
      ? "You are a concise emotional pattern analyst. Write in natural conversational Hindi (Devanagari script). No Hinglish or transliteration — use pure Hindi. Write plain, grammatically correct Hindi sentences. No em dashes, bullet points, numbered lists, markdown, or special characters. Never repeat the prompt. Never invent data not provided. Use 'आप' and 'आपका/आपकी' for addressing the user. Do not mix English words into Hindi text. CRITICAL: Do not fabricate negative emotions, diagnoses, or weaknesses that are not explicitly present in the data. If the data shows calm, neutral, or positive emotions, reflect that honestly and positively. Be balanced and grounded. Match language intensity to signal strength. Use simple everyday Hindi."
      : "You are a concise emotional pattern analyst. Write plain, grammatically correct English sentences. No em dashes, bullet points, numbered lists, markdown, or special characters. Never repeat the prompt. Never invent data not provided. Use lowercase 'you' and 'your' mid-sentence. Only capitalize them at the start of a sentence. Never write 'You's' which is not valid English. Do not mix digits or random characters into words. CRITICAL: Do not fabricate negative emotions, diagnoses, or weaknesses that are not explicitly present in the data. If the data shows calm, neutral, or positive emotions, reflect that honestly and positively. Never ascribe low confidence, depression, or negative traits unless the data clearly shows repeated negative emotion patterns. Be balanced and grounded. When data is positive or neutral, say so clearly. Default to a supportive, encouraging tone. If a user had a brief rough stretch but overall positive data, emphasize resilience and the positive majority. Match language intensity to signal strength. When patterns are weak or subtle, use observational restrained language. Do not dramatize or exaggerate weak patterns. Use simple everyday English. Never use uncommon or technical words like exergy, entropy, amplify, optimize, dichotomy, juxtaposition, modulate, ameliorate, paradigm, or trajectory. Prefer words like energy, shift, change, pattern, steady, and subtle. Avoid generic filler phrases like 'overall consistency is present' or 'it appears that'. Be specific, not vague. NEVER reference the user by name. Always say 'you' or 'your', never a person's name. NEVER speculate about the user's psychological state, coping ability, or personality. Only describe observable patterns in the data. If the SIGNAL PROFILE section contains a FLATTENING DETECTED or Within-week trajectory constraint, those MUST be the central theme of your response. Do not ignore them.";

  try {
    const sysContent = systemBase + getStylePrompt(process.env.LLM_STYLE);
    const result = await ollamaChat({
      apiUrl,
      model,
      messages: [
        { role: "system", content: sysContent },
        { role: "user", content: prompt },
      ],
      temperature: 0.15,
      maxTokens,
      timeoutMs: REQUEST_TIMEOUT_MS,
    });

    let content = result.content;
    const finishReason = result.finishReason;

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
      .replace(/\s{2,}(?!\n)/g, " ")         // collapse double spaces (preserve newlines)
      .replace(/\b(?:END OF (?:ANSWER|RESPONSE|OUTPUT)|<\/?(?:answer|response|output)>)\s*/gi, "") // strip end markers
      .trim();

    // English-specific pronoun and grammar fixes (skip for Hindi)
    if (lang !== "hi") {
      content = content
        .replace(/\bthis user\b/gi, "you")
        .replace(/\bthe user\b/gi, "you")
        .replace(/\btheir (?=emotion|trigger|pattern|mood|feeling|week|day|log)/gi, "your ")
        .replace(/\bYou's\b/g, "Your")
        .replace(/\byou's\b/g, "your")
        .replace(/([a-z,;:)'"] )You(r?)\b/g, "$1you$2")
        .trim();
    }

    // Strip prompt echo lines the model may repeat back (English patterns only)
    if (lang !== "hi") {
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
        // Strip leaked signal-profile / constraint labels
        .replace(/\b(?:given|based on|considering|due to|as (?:per|indicated|suggested|noted|seen|observed|evident|shown)(?: (?:by|in|from))?) (?:the )?(?:subtle |moderate |strong )?(?:signal profile|flattening detected|within-week trajectory)[,.]?\s*/gi, "")
        .replace(/\b(?:signal profile|volatility score|confidence level|drift (?:direction|level)|within-week trajectory slope)\b/gi, "data")
        .trim();
    }

    // Normalize variant section headers to canonical names.
    // Handle numbered variants (e.g., "1. What stood out:", "Section 1: What stood out")
    // Support Hindi headers when lang=hi
    const isHi = lang === "hi";
    const H_STOOD = isHi ? "क्या ख़ास रहा" : "What stood out";
    const H_CONTRIBUTING = isHi ? "क्या कारण हो सकता है" : "What may be contributing";
    const H_TRY = isHi ? "एक बात आज़माएँ" : "One thing to try";

    if (!isHi) {
      content = content
        .replace(/^[ \t]*(?:\d+[.)]\s*)?(?:section\s*\d+[:\s]*)?(?:most\s+)?notable\s+pattern[s]?[ \t]*:?[ \t]*/gmi, "What stood out\n")
        .replace(/^[ \t]*(?:\d+[.)]\s*)?(?:section\s*\d+[:\s]*)?what\s+(?:stood|stands)\s+out[ \t]*:?[ \t]*/gmi, "What stood out\n")
        .replace(/^[ \t]*(?:\d+[.)]\s*)?(?:section\s*\d+[:\s]*)?(?:possible|potential|likely)\s+(?:cause|contributing(?:\s+factor)?)[s]?[ \t]*:?[ \t]*/gmi, "What may be contributing\n")
        .replace(/^[ \t]*(?:\d+[.)]\s*)?(?:section\s*\d+[:\s]*)?what\s+may\s+be\s+contributing[ \t]*:?[ \t]*/gmi, "What may be contributing\n")
        .replace(/^[ \t]*(?:\d+[.)]\s*)?(?:section\s*\d+[:\s]*)?(?:one\s+thing\s+to\s+try|something\s+to\s+try|try\s+this|suggestion|action\s*(?:item|step))[ \t]*:?[ \t]*/gmi, "One thing to try\n")
        .replace(/\n{3,}/g, "\n\n");
    } else {
      // Normalize Hindi headers
      content = content
        .replace(/^[ \t]*(?:\d+[.)]\s*)?क्या ख़ास रहा[ \t]*:?[ \t]*/gm, "क्या ख़ास रहा\n")
        .replace(/^[ \t]*(?:\d+[.)]\s*)?क्या कारण हो सकता है[ \t]*:?[ \t]*/gm, "क्या कारण हो सकता है\n")
        .replace(/^[ \t]*(?:\d+[.)]\s*)?एक बात आज़माएँ[ \t]*:?[ \t]*/gm, "एक बात आज़माएँ\n")
        .replace(/\n{3,}/g, "\n\n");
    }

    // Strip any preamble text before the first recognized section header
    const firstHeaderRe = isHi
      ? /^(?:क्या ख़ास रहा|क्या कारण हो सकता है|एक बात आज़माएँ)/mi
      : /^What stood out|^What may be contributing|^One thing to try/mi;
    const firstHeaderMatch = content.match(firstHeaderRe);
    if (firstHeaderMatch) {
      content = content.slice(firstHeaderMatch.index).trim();
    }

    // Truncate after the first complete 3-section set (some models repeat sections)
    const sectionHeaders = isHi
      ? /(?:क्या ख़ास रहा|क्या कारण हो सकता है|एक बात आज़माएँ)/gi
      : /(?:what stood out|what may be contributing|one thing to try)/gi;
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
    const REQUIRED = [H_STOOD, H_CONTRIBUTING, H_TRY];
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
        .replace(/\b[a-zA-Z]+\d+[a-zA-Z]+\b/g, "")  // garbled tokens: letters+digits+letters (e.g. "exer0376fing")
        .replace(/\b[a-zA-Z]{2,}\d{3,}\b/g, "")      // garbled tokens: letters then 3+ random digits
        .replace(/\bYou's\b/g, "Your")          // broken possessive (final pass)
        .replace(/\byou's\b/g, "your")
        .replace(/([a-z,;:)'"] )You(r?)\b/g, "$1you$2") // lowercase mid-sentence You/Your
        .replace(/\s{2,}/g, " ")                 // collapse double spaces
        .replace(/([a-z])\s*\n\s*([a-z])/g, "$1 $2") // join broken sentences
        .replace(isHi ? /[\x00-\x08\x0b\x0c\x0e-\x1f]/g : /[^\x20-\x7E\u00C0-\u024F',.\-!?()\n]/g, "") // strip junk (preserve Devanagari for Hindi)
        .trim();
      // Capitalize the first letter of the section body
      if (trimmedBody.length > 0) {
        trimmedBody = trimmedBody[0].toUpperCase() + trimmedBody.slice(1);
      }
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

    // Hard word-count enforcement: trim each section at sentence boundary if over limit
    const hardWordCap = Math.round(maxWords * 1.35);
    const totalWords = content.split(/\s+/).filter(w => w.length > 0).length;
    if (totalWords > hardWordCap) {
      const maxPerSection = Math.floor(hardWordCap / extracted.length);
      for (const sec of extracted) {
        const words = sec.body.split(/\s+/).filter(w => w.length > 0);
        if (words.length > maxPerSection) {
          // Walk backward from maxPerSection to find sentence boundary
          const partial = words.slice(0, maxPerSection).join(" ");
          sec.body = trimIncomplete(partial);
          // Re-capitalize after truncation
          if (sec.body.length > 0) {
            sec.body = sec.body[0].toUpperCase() + sec.body.slice(1);
          }
        }
      }
      content = extracted.map(s => `${s.header}\n${s.body}`).join("\n\n");
    }

    // Strip fabricated day-of-week references not present in source notes
    const notesText = (recentNotes || []).map(n => (n.note || "").toLowerCase()).join(" ");
    content = content.replace(/\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/gi, (match) => {
      return notesText.includes(match.toLowerCase()) ? match : "";
    }).replace(/ {2,}/g, " ").replace(/ ([.,;:])/g, "$1").trim();

    return {
      narrative: content,
      sectionCount: extracted.length,
      model: `llm-${model}`,
      generatedAt: new Date().toISOString(),
    };
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error(`LLM request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`);
    }
    throw err;
  }
}
