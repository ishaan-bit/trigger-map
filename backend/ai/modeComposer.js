/**
 * Mode Composer — LLM composition engine for adaptive modes.
 *
 * Takes structured inputs (user signals, pattern data, knowledge primitives,
 * user profile, history) and composes mode-specific outputs through the
 * local Ollama LLM.
 *
 * Modes: move (movement), fuel (nourishment), perspective (reframe)
 *
 * Flow: select knowledge items → build structured prompt → LLM composes
 *       contextualised narrative around the items → store output + history.
 */

import { pickMovements, MOVEMENTS } from "../knowledge/movementLibrary.js";
import { pickNourishments, NOURISHMENTS } from "../knowledge/nourishmentLibrary.js";
import {
  getModeProfile,
  getRecentItemIds,
  storeModeOutput,
  appendModeHistory,
} from "../services/modeStore.js";
import { getStoredWeeklyInsight } from "../services/reportStore.js";

const DEFAULT_API_URL = "http://localhost:11434/v1";
const DEFAULT_MODEL = "mistral";
const REQUEST_TIMEOUT_MS = 180_000; // 3 min for mode generation

// ── Signal extraction ──────────────────────────────────────────────────

function extractEmotions(report) {
  const emoFreq = report?.emotionFrequency || {};
  const sorted = Object.entries(emoFreq).sort(([, a], [, b]) => b - a);
  return sorted.slice(0, 5).map(([e]) => e.toLowerCase());
}

function extractBriefContext(report) {
  const lines = [];
  const bm = report?.baselineMetrics;
  if (bm?.baseline?.reliable) {
    lines.push(`Baseline: ${bm.baseline.score.toFixed(1)}/5 (${bm.baseline.label}).`);
    if (bm.drift) lines.push(`Drift: ${bm.drift.label}.`);
    if (bm.stateOfMind) lines.push(`State: ${bm.stateOfMind}.`);
  }
  if (report?.topEmotion) lines.push(`Dominant emotion: ${report.topEmotion}.`);
  if (report?.topTrigger) lines.push(`Top trigger: ${report.topTrigger}.`);
  if (report?.volatilityScore != null) {
    const v = report.volatilityScore;
    lines.push(`Volatility: ${v < 0.5 ? "steady" : v < 1.5 ? "moderate" : "high"}.`);
  }
  return lines.join(" ");
}

// ── Item selection (knowledge → structured picks) ──────────────────────

async function selectMoveItems(ownerId, emotions, profile) {
  const recentIds = await getRecentItemIds(ownerId, "move", 3);
  const env = profile?.environment || undefined;
  const equip = profile?.equipment || undefined;
  const disliked = profile?.dislikedMovements || [];
  const exclude = [...recentIds, ...disliked];
  return pickMovements(emotions, 2, { exclude, environment: env, equipment: equip });
}

async function selectFuelItems(ownerId, emotions, profile) {
  const recentIds = await getRecentItemIds(ownerId, "fuel", 3);
  const diet = profile?.diet || undefined;
  const cuisine = profile?.cuisine || undefined;
  const disliked = profile?.dislikedNourishments || [];
  const exclude = [...recentIds, ...disliked];
  return pickNourishments(emotions, 2, { exclude, diet, cuisine });
}

// ── Prompt builders ────────────────────────────────────────────────────

function buildMovePrompt(items, context, lang) {
  const hi = lang === "hi";
  const itemBlock = items.map((m) => {
    const name = hi ? m.nameHi : m.name;
    const desc = hi ? m.descriptionHi : m.description;
    return `- ${name}: ${desc} (${m.intensity}, ~${m.durationMin} min)`;
  }).join("\n");

  return hi
    ? `उपयोगकर्ता की हालिया भावनात्मक स्थिति:
${context}

ये दो शारीरिक गतिविधियां चुनी गई हैं:
${itemBlock}

इन दोनों गतिविधियों को 3-4 वाक्यों में समझाएं। बताएं कि ये भावनात्मक स्थिति के लिए क्यों उपयुक्त हैं। सीधे और गर्म स्वर में लिखें। तकनीकी शब्द न इस्तेमाल करें। कोई नई गतिविधि न जोड़ें।`
    : `User's recent emotional context:
${context}

These two movement activities were selected:
${itemBlock}

In 3-4 sentences, explain why these two activities suit the user's current emotional state. Be warm, direct, and specific. Do not use technical jargon. Do not suggest additional activities beyond the two listed.`;
}

function buildFuelPrompt(items, context, lang) {
  const hi = lang === "hi";
  const itemBlock = items.map((n) => {
    const name = hi ? n.nameHi : n.name;
    const desc = hi ? n.descriptionHi : n.description;
    return `- ${name}: ${desc} (${n.nutrientFocus})`;
  }).join("\n");

  return hi
    ? `उपयोगकर्ता की हालिया भावनात्मक स्थिति:
${context}

ये दो पोषण सुझाव चुने गए हैं:
${itemBlock}

इन दोनों सुझावों को 3-4 वाक्यों में समझाएं। बताएं कि ये भावनात्मक स्थिति के लिए कैसे मदद कर सकते हैं। सरल और गर्म भाषा में लिखें। नया खाना न जोड़ें।`
    : `User's recent emotional context:
${context}

These two nourishment suggestions were selected:
${itemBlock}

In 3-4 sentences, explain why these two suggestions suit the user's current emotional state. Be warm, direct, and specific. Focus on how they connect to mood and energy, not clinical nutrition facts. Do not suggest additional items beyond the two listed.`;
}

function buildPerspectivePrompt(context, lang) {
  const hi = lang === "hi";
  return hi
    ? `उपयोगकर्ता की हालिया भावनात्मक स्थिति:
${context}

इस स्थिति को देखने का एक नया नज़रिया 3-4 वाक्यों में दें। यह सुझाव या सलाह नहीं — बस एक अलग तरीके से देखने का तरीका। शांत, सौम्य और ज़मीनी स्वर में लिखें। कोई निदान या मनोवैज्ञानिक शब्दावली न इस्तेमाल करें।`
    : `User's recent emotional context:
${context}

Offer one fresh perspective on this emotional pattern in 3-4 sentences. This is not advice or a suggestion to act — it is a different way of seeing what is happening. Be calm, gentle, and grounded. Do not diagnose or use psychological terminology.`;
}

// ── System prompts (mode-specific) ─────────────────────────────────────

function getSystemPrompt(mode, lang) {
  const hi = lang === "hi";

  const base = {
    move: hi
      ? "आप एक शांत, सहानुभूतिपूर्ण शारीरिक गतिविधि मार्गदर्शक हैं। आप भावनात्मक डेटा के आधार पर गतिविधि की सिफारिश समझाते हैं। सीधे, गर्म और संक्षिप्त रहें।"
      : "You are a calm, empathetic movement guide. You explain why specific physical activities suit someone's current emotional state. Be direct, warm, and brief.",
    fuel: hi
      ? "आप एक शांत, सहानुभूतिपूर्ण पोषण मार्गदर्शक हैं। आप भावनात्मक डेटा के आधार पर खाने के सुझाव समझाते हैं। सरल भाषा में, बिना चिकित्सकीय शब्दों के।"
      : "You are a calm, empathetic nourishment guide. You explain why specific food suggestions suit someone's emotional state. Use simple language, avoid clinical nutrition terms.",
    perspective: hi
      ? "आप एक सौम्य, विचारशील दृष्टिकोण देने वाले हैं। आप भावनात्मक पैटर्न को नई नज़र से देखने में मदद करते हैं। निदान मत करें, सलाह मत दें — बस एक अलग नज़रिया दें।"
      : "You are a gentle, thoughtful perspective-giver. You help people see emotional patterns from a different angle. Do not diagnose, do not advise action — just offer a different way of seeing.",
  };

  const langRule = hi
    ? " पूरी तरह हिंदी (देवनागरी) में लिखें। कोई अंग्रेज़ी शब्द नहीं।"
    : "";

  return (base[mode] || base.perspective) + langRule;
}

// ── Main generation function ───────────────────────────────────────────

/**
 * Generate adaptive mode output.
 *
 * @param {object} options
 * @param {string} options.ownerId – user's owner ID
 * @param {"move"|"fuel"|"perspective"} options.mode – which mode to generate
 * @param {string} [options.lang="en"] – language
 * @param {string} [options.model] – override LLM model
 * @param {number} [options.maxWords=100] – word budget
 * @returns {Promise<{mode, items, narrative, generatedAt, model}>}
 */
export async function generateModeOutput({ ownerId, mode, lang = "en", model: modelOverride, maxWords = 100 }) {
  const apiUrl = process.env.LLM_API_URL || DEFAULT_API_URL;
  const model = modelOverride || process.env.LLM_MODEL || DEFAULT_MODEL;
  const report = await getStoredWeeklyInsight(ownerId);
  const emotions = extractEmotions(report);
  const context = extractBriefContext(report);
  const profile = await getModeProfile(ownerId);

  let items = [];
  let prompt;

  if (mode === "move") {
    items = await selectMoveItems(ownerId, emotions, profile);
    prompt = buildMovePrompt(items, context, lang);
  } else if (mode === "fuel") {
    items = await selectFuelItems(ownerId, emotions, profile);
    prompt = buildFuelPrompt(items, context, lang);
  } else {
    // perspective — no knowledge items, LLM composes freely
    prompt = buildPerspectivePrompt(context, lang);
  }

  const tokenMultiplier = lang === "hi" ? 3.5 : 2.5;
  const maxTokens = Math.max(200, Math.round(maxWords * tokenMultiplier));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${apiUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: getSystemPrompt(mode, lang) },
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
        max_tokens: maxTokens,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`LLM API returned ${response.status}: ${text}`);
    }

    const data = await response.json();
    let narrative = data.choices?.[0]?.message?.content?.trim();
    if (!narrative) throw new Error("LLM returned empty response for mode " + mode);

    // Trim incomplete sentence if token-limited
    if (data.choices?.[0]?.finish_reason === "length") {
      const match = narrative.match(/^([\s\S]*[.!?])(?:\s|$)/);
      if (match) narrative = match[1].trim();
    }

    const itemIds = items.map((i) => i.id);
    const itemSummaries = items.map((i) => ({
      id: i.id,
      name: lang === "hi" ? i.nameHi : i.name,
      description: lang === "hi" ? i.descriptionHi : i.description,
      ...(i.intensity ? { intensity: i.intensity } : {}),
      ...(i.durationMin ? { durationMin: i.durationMin } : {}),
      ...(i.type ? { type: i.type } : {}),
      ...(i.nutrientFocus ? { nutrientFocus: i.nutrientFocus } : {}),
    }));

    // Persist
    const output = { mode, items: itemSummaries, narrative, model };
    await storeModeOutput(ownerId, mode, output);
    await appendModeHistory(ownerId, mode, itemIds);

    return output;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Generate all three modes at once for a user.
 * Returns { move, fuel, perspective } — each a mode output or null on error.
 */
export async function generateAllModes({ ownerId, lang = "en", model, maxWords = 100 }) {
  const modes = ["move", "fuel", "perspective"];
  const results = {};
  for (const mode of modes) {
    try {
      results[mode] = await generateModeOutput({ ownerId, mode, lang, model, maxWords });
    } catch (err) {
      console.error(`Mode ${mode} generation failed for ${ownerId}:`, err.message);
      results[mode] = null;
    }
  }
  return results;
}
