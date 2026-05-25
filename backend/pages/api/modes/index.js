import enableCors from "@/lib/cors.js";
import { sendError, sendSuccess } from "@/services/response.js";
import { getBearerToken } from "@/services/security.js";
import { validateSession } from "@/services/authService.js";
import { getStoredModeOutput, getModeFeedback } from "@/services/modeStore.js";
import { applyModeFeedbackToResults, buildModeFeedbackByMode, buildModeFeedbackMap } from "@/services/modeFeedbackState.js";
import { captureServerError } from "@/services/monitoringService.js";
import { generateRuleBasedModeOutput } from "@/ai/modeComposer.js";

const VALID_MODES = ["move", "fuel", "perspective"];

function hasUsableItems(output) {
  return output && Array.isArray(output.items) && output.items.some((item) => item?.id);
}

async function readModeOrRuleFallback({ ownerId, mode, lang }) {
  const stored = await getStoredModeOutput(ownerId, mode);
  if (hasUsableItems(stored) || (mode === "perspective" && stored?.narrative)) {
    console.log(`[modes] selected ${mode} source=${stored.source || stored.model || "unknown"} owner=${ownerId.slice(0, 8)} items=${stored.items?.length || 0}`);
    return stored;
  }

  const fallback = await generateRuleBasedModeOutput({ ownerId, mode, lang, persist: false, reason: stored ? "invalid_cache" : "empty_cache" });
  console.log(`[modes] selected ${mode} source=${fallback.source || "rule"} owner=${ownerId.slice(0, 8)} reason=${fallback.fallbackReason}`);
  return fallback;
}

async function ensureVisibleFallbacks({ ownerId, lang, results, feedbackEntries, modes }) {
  const filtered = applyModeFeedbackToResults(results, feedbackEntries, modes);

  for (const mode of modes) {
    if (mode !== "move" && mode !== "fuel") continue;
    if (filtered[mode]?.items?.length) continue;

    const fallback = await generateRuleBasedModeOutput({
      ownerId,
      mode,
      lang,
      persist: false,
      reason: "feedback_filtered",
    });
    fallback.source = "fallback";

    const filteredFallback = applyModeFeedbackToResults({ [mode]: fallback }, feedbackEntries, [mode])[mode];
    filtered[mode] = filteredFallback?.items?.length ? filteredFallback : fallback;
    console.log(`[modes] ${mode} visible list backfilled owner=${ownerId.slice(0, 8)} items=${filtered[mode]?.items?.length || 0}`);
  }

  return filtered;
}

/**
 * GET /api/modes?mode=move — fetch latest cached mode output
 * GET /api/modes — fetch all three modes
 *
 * Returns cached LLM/HITL output when available, with rule-based fallback.
 */
export default async function handler(req, res) {
  if (enableCors(req, res)) return;

  if (req.method !== "GET") {
    return sendError(res, 405, "METHOD_NOT_ALLOWED", "GET only");
  }

  try {
    const token = getBearerToken(req);
    const user = token ? await validateSession(token).catch(() => null) : null;
    const ownerId = user?.id || req.query.deviceId;
    if (!ownerId || typeof ownerId !== "string") {
      return sendError(res, 400, "MISSING_OWNER", "deviceId is required when unauthenticated");
    }

    const lang = typeof req.query.lang === "string" ? req.query.lang : "en";
    const requestedMode = req.query.mode;

    if (requestedMode) {
      if (!VALID_MODES.includes(requestedMode)) {
        return sendError(res, 400, "INVALID_MODE", `mode must be one of: ${VALID_MODES.join(", ")}`);
      }
      const output = await readModeOrRuleFallback({ ownerId, mode: requestedMode, lang });
      const feedbackEntries = await getModeFeedback(ownerId);
      const filtered = await ensureVisibleFallbacks({ ownerId, lang, results: { [requestedMode]: output }, feedbackEntries, modes: [requestedMode] });
      filtered.feedback = buildModeFeedbackMap(filtered, feedbackEntries, [requestedMode]);
      filtered.feedbackByMode = buildModeFeedbackByMode(filtered, feedbackEntries, [requestedMode]);
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      return sendSuccess(res, filtered);
    }

    // Return all three modes + feedback map
    const results = {};
    for (const mode of VALID_MODES) {
      results[mode] = await readModeOrRuleFallback({ ownerId, mode, lang });
    }

    const feedbackEntries = await getModeFeedback(ownerId);
    const filteredResults = await ensureVisibleFallbacks({ ownerId, lang, results, feedbackEntries, modes: VALID_MODES });
    filteredResults.feedback = buildModeFeedbackMap(filteredResults, feedbackEntries, VALID_MODES);
    filteredResults.feedbackByMode = buildModeFeedbackByMode(filteredResults, feedbackEntries, VALID_MODES);

    const populated = VALID_MODES.filter((m) => filteredResults[m] != null);
    if (!populated.length) {
      console.log(`[modes] All modes empty for ${ownerId.slice(0, 8)}. Run generateAdaptiveModes job.`);
    }
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    return sendSuccess(res, filteredResults);
  } catch (error) {
    captureServerError(error, { path: "/api/modes" });
    return sendError(res, 500, "INTERNAL_ERROR", "Something went wrong");
  }
}
