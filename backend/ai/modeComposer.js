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
import { getStylePrompt } from "./styleProfiles.js";

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
    if (bm.drift) {
      const dir = bm.drift.value > 0.15 ? "improving" : bm.drift.value < -0.15 ? "declining" : "stable";
      lines.push(`Trend: ${dir} (drift ${bm.drift.label}).`);
    }
    if (bm.stateOfMind) lines.push(`State: ${bm.stateOfMind}.`);
  }
  if (report?.topEmotion) lines.push(`Dominant emotion: ${report.topEmotion}.`);
  if (report?.topTrigger) lines.push(`Top trigger: ${report.topTrigger}.`);

  // Emotional trajectory direction (this week)
  const traj = report?.weeklyEmotionTrajectory || [];
  if (traj.length >= 3) {
    const recent = traj.slice(-7);
    const diff = recent[recent.length - 1].score - recent[0].score;
    if (diff <= -0.5) lines.push("This week's trajectory: declining — they've been sliding downward.");
    else if (diff >= 0.5) lines.push("This week's trajectory: rising — things are getting better for them.");
    else lines.push("This week's trajectory: steady.");
  }

  if (report?.volatilityScore != null) {
    const v = report.volatilityScore;
    lines.push(`Volatility: ${v < 0.5 ? "steady" : v < 1.5 ? "moderate swings" : "high emotional swings"}.`);
  }

  // Recurring emotion patterns for deeper personalisation
  const freq = report?.emotionFrequency || {};
  const topEmotions = Object.entries(freq).sort(([, a], [, b]) => b - a).slice(0, 3);
  if (topEmotions.length > 1) {
    lines.push(`Recurring emotions: ${topEmotions.map(([e, c]) => `${e} (${c}x)`).join(", ")}.`);
  }

  // Friction zones — what triggers negative patterns
  const friction = report?.frictionZones || [];
  if (friction.length > 0) {
    const topFric = friction.slice(0, 2).map((f) => `${f.trigger}→${f.emotion}`);
    lines.push(`Pain points: ${topFric.join(", ")}.`);
  }

  // Regulators — what helps them feel better
  const regs = report?.regulators || [];
  if (regs.length > 0) {
    const topRegs = regs.slice(0, 2).map((r) => `${r.trigger}→${r.emotion}`);
    lines.push(`What helps them: ${topRegs.join(", ")}.`);
  }

  return lines.join(" ");
}

// ── Feedback context for HiTL personalisation ──────────────────────────

function buildFeedbackContext(feedback, mode, items, lang) {
  if (!feedback || feedback.length === 0) return "";

  // Only consider recent feedback (last 30 days) — preferences change over time
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const modeFb = feedback.filter((f) => f.mode === mode && (f.timestamp || 0) >= thirtyDaysAgo);
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
  return pickMovements(emotions, 12, { exclude, boost: liked, environment: env, equipment: equip });
}

async function selectFuelItems(ownerId, emotions, profile) {
  const recentIds = await getRecentItemIds(ownerId, "fuel", 3);
  const diet = profile?.diet || undefined;
  const cuisine = profile?.cuisine || undefined;
  const disliked = profile?.dislikedNourishments || [];
  const liked = profile?.likedNourishments || [];
  const exclude = [...recentIds, ...disliked];
  return pickNourishments(emotions, 15, { exclude, boost: liked, diet, cuisine });
}

// ── Prompt builders ────────────────────────────────────────────────────

function buildMovePrompt(items, context, lang) {
  const hi = lang === "hi";
  const itemBlock = items.slice(0, 8).map((m, i) => {
    const name = hi ? m.nameHi : m.name;
    return `${i + 1}. ${name} (${m.intensity}, ~${m.durationMin} min)`;
  }).join("\n");

  return hi
    ? `उपयोगकर्ता का भावनात्मक संदर्भ:
${context}

इनके लिए चुनी गई गतिविधियां:
${itemBlock}

इस प्रारूप में JSON लौटाएं (कोई अतिरिक्त पाठ नहीं):
{
  "opening": "2-3 वाक्य — उपयोगकर्ता से सीधे बात करें ('तुम/आप'), उनकी भावनात्मक स्थिति को स्वीकार करें, बताएं कि आज का चयन उनके लिए क्यों खास है",
  "reasons": ["गतिविधि 1 के लिए 1 वाक्य — तुम्हारे लिए यह क्यों, सामान्य व्याख्या नहीं", "गतिविधि 2 ...", ...]
}
reasons उसी क्रम में हों। हर reason व्यक्तिगत हो — 'इससे आपको X में मदद मिलेगी क्योंकि आप Y महसूस कर रहे हैं'। कोई नई गतिविधि न जोड़ें।`
    : `User's emotional context:
${context}

Activities selected for them:
${itemBlock}

Return JSON in this exact format (no extra text):
{
  "opening": "2-3 sentences — speak directly to the user ('you/your'), acknowledge what they're going through, explain why today's selection is tailored for them specifically",
  "reasons": ["1 sentence for activity 1 — why THIS for YOU right now, not a generic explanation", "activity 2 ...", ...]
}
reasons must be in the same order as activities above. Each reason must feel personal — 'This will help you with X because you've been feeling Y'. Do not add new activities. Do not explain what the exercise is — explain why it's right for THIS person right now.`;
}

function buildFuelPrompt(items, context, lang) {
  const hi = lang === "hi";
  const itemBlock = items.slice(0, 8).map((n, i) => {
    const name = hi ? n.nameHi : n.name;
    return `${i + 1}. ${name} (${n.type}, ${n.nutrientFocus})`;
  }).join("\n");

  return hi
    ? `उपयोगकर्ता का भावनात्मक संदर्भ:
${context}

इनके लिए चुने गए भोजन/पेय:
${itemBlock}

इस प्रारूप में JSON लौटाएं (कोई अतिरिक्त पाठ नहीं):
{
  "opening": "2-3 वाक्य — उपयोगकर्ता से सीधे बात करें ('तुम/आप'), बताएं कि आज का भोजन चयन उनकी भावनात्मक स्थिति से कैसे जुड़ा है",
  "reasons": ["भोजन 1 के लिए 1 वाक्य — तुम्हारे शरीर को अभी यह क्यों चाहिए", "भोजन 2 ...", ...]
}
reasons उसी क्रम में हों। हर reason व्यक्तिगत हो — 'यह तुम्हारे X को ठीक करेगा क्योंकि Y'। पोषण विज्ञान मत बताओ — बताओ कि यह इस व्यक्ति को अभी कैसे ठीक करेगा।`
    : `User's emotional context:
${context}

Foods/drinks selected for them:
${itemBlock}

Return JSON in this exact format (no extra text):
{
  "opening": "2-3 sentences — speak directly to the user ('you/your'), connect today's nourishment choices to what their body and mind need right now based on their emotional state",
  "reasons": ["1 sentence for item 1 — why your body needs THIS right now, not nutrition facts", "item 2 ...", ...]
}
reasons must be in the same order as items above. Each reason must feel personal — 'Your body is asking for X because you've been feeling Y'. Do not list nutrition science — explain how each choice will support THIS person right now.`;
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
      ? "आप एक व्यक्तिगत मूवमेंट गाइड हैं जो इस विशेष व्यक्ति को उनकी भावनात्मक यात्रा के आधार पर जानते हैं। आप सीधे उनसे बात करते हैं ('तुम/आप')। आप JSON प्रारूप में जवाब देते हैं। गर्म, संक्षिप्त, और व्यक्तिगत रहें — जैसे कोई जानकार मार्गदर्शक बात कर रहा हो।"
      : "You are a personal movement guide who knows THIS specific person through their emotional patterns. You speak directly to them ('you/your'). You respond in JSON format. Be warm, brief, and deeply personal — like a trusted guide who understands their journey, not a fitness app.",
    fuel: hi
      ? "आप एक व्यक्तिगत पोषण मार्गदर्शक हैं जो इस व्यक्ति को उनकी भावनात्मक यात्रा के आधार पर जानते हैं। आप सीधे उनसे बात करते हैं ('तुम/आप')। आप JSON प्रारूप में जवाब देते हैं। गर्म और व्यक्तिगत — यह डाइट प्लान नहीं, भावनात्मक पोषण है।"
      : "You are a personal nourishment guide who knows THIS specific person through their emotional patterns. You speak directly to them ('you/your'). You respond in JSON format. Be warm and personal — this is emotional nourishment, not a diet plan.",
    perspective: hi
      ? "आप एक सौम्य, विचारशील दृष्टिकोण देने वाले हैं। आप भावनात्मक पैटर्न को नई नज़र से देखने में मदद करते हैं। निदान मत करें, सलाह मत दें — बस एक अलग नज़रिया दें।"
      : "You are a gentle, thoughtful perspective-giver. You help people see emotional patterns from a different angle. Do not diagnose, do not advise action — just offer a different way of seeing.",
  };

  const langRule = hi
    ? " पूरी तरह हिंदी (देवनागरी) में लिखें। कोई अंग्रेज़ी शब्द नहीं।"
    : "";

  return (base[mode] || base.perspective) + langRule + getStylePrompt(process.env.LLM_STYLE);
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
  // More tokens needed for JSON with per-item reasons
  const reasonBudget = (mode === "move" || mode === "fuel") ? Math.max(items.length * 25, 120) : maxWords;
  const maxTokens = Math.max(300, Math.round(reasonBudget * tokenMultiplier));

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

      // ── Post-processing: fix common LLM garbling ──
      const garbleMap = [
        [/\boverwhinely\b/gi, "overwhelmed"],
        [/\boverwhselming\b/gi, "overwhelming"],
        [/\boverwhinishing\b/gi, "overwhelming"],
        [/\boverwhinished\b/gi, "overwhelmed"],
        [/\boverwhelmfully\b/gi, "overwhelmingly"],
        [/\boverwhfully\b/gi, "overwhelmingly"],
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

      const cleanLlmText = (text) => {
        let t = text;
        for (const [pattern, fix] of garbleMap) { t = t.replace(pattern, fix); }
        return t
          .replace(/\*\*/g, "")
          .replace(/#{1,3}\s+/g, "")
          .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "")
          .replace(/[\u200b-\u200f\ufeff]/g, "")
          .replace(/ {2,}/g, " ")
          .trim();
      };

      // ── Parse structured JSON for move/fuel, plain text for perspective ──
      let parsedReasons = [];
      let parsedOpening = "";

      if (mode === "move" || mode === "fuel") {
        try {
          // Extract JSON from LLM response (may have wrapping text)
          const jsonMatch = narrative.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            parsedOpening = cleanLlmText(parsed.opening || "");
            parsedReasons = (parsed.reasons || []).map((r) => cleanLlmText(r));
          }
        } catch (e) {
          console.warn(`[modeComposer] JSON parse failed for ${mode}, using raw narrative: ${e.message}`);
          parsedOpening = cleanLlmText(narrative);
        }
        narrative = parsedOpening || cleanLlmText(narrative);
      } else {
        // Trim incomplete sentence if token-limited
        if (result.finishReason === "length") {
          const match = narrative.match(/^([\s\S]*[.!?])(?:\s|$)/);
          if (match) narrative = match[1].trim();
        }
        narrative = cleanLlmText(narrative);
      }

      const itemIds = items.map((i) => i.id);
      const itemSummaries = items.map((i, idx) => ({
        id: i.id,
        name: lang === "hi" ? i.nameHi : i.name,
        description: lang === "hi" ? i.descriptionHi : i.description,
        ...(parsedReasons[idx] ? { reason: parsedReasons[idx] } : {}),
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
