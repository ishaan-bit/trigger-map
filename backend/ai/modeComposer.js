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
import { retrieveForMode } from "../knowledge/ragEngine.js";
import { emotionSignalKeywords } from "../shared/constants/emotions.js";
import { ollamaChat } from "./ollamaChat.js";
import {
  getModeProfile,
  getModeFeedback,
  getRecentItemIds,
  storeModeOutput,
  appendModeHistory,
} from "../services/modeStore.js";
import { getStoredWeeklyInsight } from "../services/reportStore.js";

const DEFAULT_API_URL = "http://localhost:11434/v1";
const DEFAULT_MODEL = "phi3";
const REQUEST_TIMEOUT_MS = 120_000; // 2 min per mode generation call
const PULL_TIMEOUT_MS = 600_000; // 10 min for model downloads
const RETRY_DELAY_MS = 3_000; // 3 s between retries
const MAX_RETRIES = 1;

// ── Model availability check ──────────────────────────────────────────

async function ensureModelAvailable(ollamaBase, model) {
  const nativeBase = ollamaBase.replace(/\/v1\/?$/, "");
  try {
    const showRes = await fetch(`${nativeBase}/api/show`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: model }),
    });
    if (showRes.ok) return;
  } catch {
    return; // Ollama might not be running — let the main call handle the error
  }

  console.log(`[modeComposer] Model "${model}" not found. Pulling...`);
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
    console.log(`[modeComposer] Model "${model}" pulled successfully.`);
  } catch (err) {
    console.error(`[modeComposer] Model pull failed: ${err.message}`);
  } finally {
    clearTimeout(pullTimeout);
  }
}

// ── Signal extraction ──────────────────────────────────────────────────

function extractEmotions(report) {
  const emoFreq = report?.emotionFrequency || {};
  const sorted = Object.entries(emoFreq).sort(([, a], [, b]) => b - a);
  const discrete = sorted.slice(0, 4).map(([emotion]) => emotion.toLowerCase());

  const centroidKeywords = report?.weeklyCentroid?.count
    ? emotionSignalKeywords(report.weeklyCentroid.valence, report.weeklyCentroid.arousal)
    : [];

  return [...new Set([...discrete, ...centroidKeywords])].slice(0, 6);
}

function extractBriefContext(report) {
  const lines = [];
  const dq = report?.dataQuality;

  // Silence signal: data is from a past active period, not current week
  if (dq?.isSilent) {
    lines.push(`SILENCE: user last logged ${dq.daysSinceLastLog} days ago (${dq.lastLogDate}). Data below is from their last active period. Suggest gentle re-engagement, not new demands.`);
  }

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

// ── Feedback context for HiTL personalisation ──────────────────────────

function buildFeedbackContext(feedback, mode, items, lang) {
  if (!feedback || feedback.length === 0) return "";

  const modeFb = feedback.filter((f) => f.mode === mode);
  if (modeFb.length === 0) return "";

  // Build liked / disliked item ID lists from recent feedback
  const liked = modeFb.filter((f) => f.response === "helpful").map((f) => f.itemId);
  const disliked = modeFb.filter((f) => f.response === "not_helpful").map((f) => f.itemId);

  // Resolve names from the full library for richer context
  const allItems = items; // full library passed in
  const nameOf = (id) => {
    const item = allItems.find((i) => i.id === id);
    return item ? (lang === "hi" ? item.nameHi : item.name) : id;
  };

  const lines = [];
  const hi = lang === "hi";

  if (liked.length) {
    const uniqueLiked = [...new Set(liked)].slice(0, 6);
    lines.push(
      hi
        ? `उपयोगकर्ता ने पहले ये पसंद किये: ${uniqueLiked.map(nameOf).join(", ")}। इन जैसे विकल्प पसंद करें।`
        : `The user previously liked: ${uniqueLiked.map(nameOf).join(", ")}. Favour similar approaches.`
    );
  }
  if (disliked.length) {
    const uniqueDisliked = [...new Set(disliked)].slice(0, 6);
    lines.push(
      hi
        ? `उपयोगकर्ता ने ये नापसंद किये: ${uniqueDisliked.map(nameOf).join(", ")}। अलग तरीका अपनाएं।`
        : `The user disliked: ${uniqueDisliked.map(nameOf).join(", ")}. Take a different approach.`
    );
  }

  return lines.join("\n");
}

// ── Item selection (knowledge → structured picks) ──────────────────────

async function selectMoveItems(ownerId, emotions, profile) {
  const recentIds = await getRecentItemIds(ownerId, "move", 3);
  const env = profile?.environment || undefined;
  const equip = profile?.equipment || undefined;
  const disliked = profile?.dislikedMovements || [];
  const liked = profile?.likedMovements || [];
  const exclude = [...recentIds, ...disliked];
  return pickMovements(emotions, 8, { exclude, boost: liked, environment: env, equipment: equip });
}

async function selectFuelItems(ownerId, emotions, profile) {
  const recentIds = await getRecentItemIds(ownerId, "fuel", 3);
  const diet = profile?.diet || undefined;
  const cuisine = profile?.cuisine || undefined;
  const disliked = profile?.dislikedNourishments || [];
  const liked = profile?.likedNourishments || [];
  const exclude = [...recentIds, ...disliked];
  return pickNourishments(emotions, 10, { exclude, boost: liked, diet, cuisine });
}

// ── Prompt builders ────────────────────────────────────────────────────

function buildMovePrompt(items, context, lang) {
  const hi = lang === "hi";
  const top = items.slice(0, 3);
  const itemBlock = top.map((m) => {
    const name = hi ? m.nameHi : m.name;
    const desc = hi ? m.descriptionHi : m.description;
    return `- ${name}: ${desc} (${m.intensity}, ~${m.durationMin} min)`;
  }).join("\n");

  return hi
    ? `उपयोगकर्ता की हालिया भावनात्मक स्थिति:
${context}

ये शारीरिक गतिविधियां चुनी गई हैं:
${itemBlock}

इन गतिविधियों को 3-4 वाक्यों में समझाएं। बताएं कि ये भावनात्मक स्थिति के लिए क्यों उपयुक्त हैं। सीधे और गर्म स्वर में लिखें। तकनीकी शब्द न इस्तेमाल करें। कोई नई गतिविधि न जोड़ें।`
    : `User's recent emotional context:
${context}

These movement activities were selected for the user:
${itemBlock}

In 3-4 sentences, explain why these activities suit the user's current emotional state. Be warm, direct, and specific. Do not use technical jargon. Do not suggest additional activities beyond those listed.`;
}

function buildFuelPrompt(items, context, lang) {
  const hi = lang === "hi";
  const top = items.slice(0, 3);
  const itemBlock = top.map((n) => {
    const name = hi ? n.nameHi : n.name;
    const desc = hi ? n.descriptionHi : n.description;
    return `- ${name}: ${desc} (${n.nutrientFocus})`;
  }).join("\n");

  return hi
    ? `उपयोगकर्ता की हालिया भावनात्मक स्थिति:
${context}

ये पोषण सुझाव चुने गए हैं:
${itemBlock}

इन सुझावों को 3-4 वाक्यों में समझाएं। बताएं कि ये भावनात्मक स्थिति के लिए कैसे मदद कर सकते हैं। सरल और गर्म भाषा में लिखें। नया खाना न जोड़ें।`
    : `User's recent emotional context:
${context}

These nourishment suggestions were selected for the user:
${itemBlock}

In 3-4 sentences, explain why these suggestions suit the user's current emotional state. Be warm, direct, and specific. Focus on how they connect to mood and energy, not clinical nutrition facts. Do not suggest additional items beyond those listed.`;
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

  // Pre-check: ensure model is available in Ollama (auto-pull if missing)
  await ensureModelAvailable(apiUrl, model);

  const report = await getStoredWeeklyInsight(ownerId);
  const emotions = extractEmotions(report);
  const baseContext = extractBriefContext(report);
  let ragContext = "";
  try { if (report) ragContext = retrieveForMode(report, 3) || ""; } catch (e) { console.error("[RAG] retrieveForMode failed:", e.message); }
  const context = ragContext ? `${baseContext}\n${ragContext}` : baseContext;
  const profile = await getModeProfile(ownerId);

  // HiTL: fetch user's past feedback for personalisation
  let feedback = [];
  try { feedback = await getModeFeedback(ownerId); } catch (e) { console.error("[modeComposer] getModeFeedback failed:", e.message); }

  let items = [];
  let prompt;
  let feedbackCtx = "";

  if (mode === "move") {
    items = await selectMoveItems(ownerId, emotions, profile);
    feedbackCtx = buildFeedbackContext(feedback, "move", MOVEMENTS, lang);
    prompt = buildMovePrompt(items, feedbackCtx ? `${context}\n\n${feedbackCtx}` : context, lang);
  } else if (mode === "fuel") {
    items = await selectFuelItems(ownerId, emotions, profile);
    feedbackCtx = buildFeedbackContext(feedback, "fuel", NOURISHMENTS, lang);
    prompt = buildFuelPrompt(items, feedbackCtx ? `${context}\n\n${feedbackCtx}` : context, lang);
  } else {
    // perspective — no knowledge items, LLM composes freely
    prompt = buildPerspectivePrompt(context, lang);
  }

  const tokenMultiplier = lang === "hi" ? 3.5 : 2.5;
  const maxTokens = Math.max(200, Math.round(maxWords * tokenMultiplier));

  const chatMessages = [
    { role: "system", content: getSystemPrompt(mode, lang) },
    { role: "user", content: prompt },
  ];

  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      console.log(`[modeComposer] Retry ${attempt}/${MAX_RETRIES} for ${mode} (${ownerId.slice(0, 8)})...`);
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }

    try {
      const result = await ollamaChat({
        apiUrl,
        model,
        messages: chatMessages,
        temperature: 0.2,
        maxTokens,
        timeoutMs: REQUEST_TIMEOUT_MS,
      });

      let narrative = result.content;
      if (!narrative) throw new Error("LLM returned empty response for mode " + mode);

      // Trim incomplete sentence if token-limited
      if (result.finishReason === "length") {
        const match = narrative.match(/^([\s\S]*[.!?])(?:\s|$)/);
        if (match) narrative = match[1].trim();
      }

      // ── Post-processing: fix common LLM garbling ──
      // phi3 consistently misspells words and produces broken contractions.
      // Fix known garbles before storing.
      const garbleMap = [
        [/\boverwhinely\b/gi, "overwhelmed"],
        [/\boverwhselming\b/gi, "overwhelming"],
        [/\boverwhinishing\b/gi, "overwhelming"],
        [/\boverwhinished\b/gi, "overwhelmed"],
        [/\boverwhelmfully\b/gi, "overwhelmingly"],
        [/\boverwhfully\b/gi, "overwhelmingly"],
        [/\boverwhinely\b/gi, "overwhelmed"],
        [/\boverwh[a-z]*ly\b/gi, "overwhelmingly"],
        [/\bexercuries\b/gi, "exercises"],
        [/\bstayring\b/gi, "staying"],
        [/\blet'gedo\b/gi, "let's"],
        [/\bit'in\b/gi, "it's"],
        [/\bit'selfthey\b/gi, "it's okay, they"],
        [/\btryptophan'increasing\b/gi, "tryptophan, increasing"],
        [/\blife' endless\b/gi, "life's endless"],
        [/\bIt'd\b/g, "It would"],
        [/\bt'these\b/gi, "these"],
        [/\b[a-z]'[a-z]{4,}\b/gi, (m) => m.replace(/'/, "")],
      ];
      for (const [pattern, fix] of garbleMap) {
        narrative = narrative.replace(pattern, fix);
      }
      // Strip markdown artifacts, control chars, excessive whitespace
      narrative = narrative
        .replace(/\*\*/g, "")
        .replace(/#{1,3}\s+/g, "")
        .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "")
        .replace(/[\u200b-\u200f\ufeff]/g, "")
        .replace(/ {2,}/g, " ")
        .trim();

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
    } catch (err) {
      lastError = err;
      console.error(`[modeComposer] ${mode} attempt ${attempt} failed for ${ownerId.slice(0, 8)}: ${err.message}`);
    }
  }

  throw lastError;
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
