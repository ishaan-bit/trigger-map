import enableCors from "@/lib/cors.js";
import { sendError, sendSuccess } from "@/services/response.js";
import { getBearerToken } from "@/services/security.js";
import { validateSession } from "@/services/authService.js";
import { getStoredModeOutput, getModeFeedback } from "@/services/modeStore.js";
import { applyModeFeedbackToResults, buildModeFeedbackMap } from "@/services/modeFeedbackState.js";
import { captureServerError } from "@/services/monitoringService.js";
import { generateRuleBasedModeOutput } from "@/ai/modeComposer.js";

const VALID_MODES = ["move", "fuel", "perspective"];

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
      const output = await getStoredModeOutput(ownerId, requestedMode)
        || await generateRuleBasedModeOutput({ ownerId, mode: requestedMode, lang, persist: false, reason: "empty_cache" });
      const feedbackEntries = await getModeFeedback(ownerId);
      const filtered = applyModeFeedbackToResults({ [requestedMode]: output }, feedbackEntries, [requestedMode]);
      filtered.feedback = buildModeFeedbackMap(filtered, feedbackEntries, [requestedMode]);
      return sendSuccess(res, filtered);
    }

    // Return all three modes + feedback map
    const results = {};
    for (const mode of VALID_MODES) {
      results[mode] = await getStoredModeOutput(ownerId, mode)
        || await generateRuleBasedModeOutput({ ownerId, mode, lang, persist: false, reason: "empty_cache" });
    }

    const feedbackEntries = await getModeFeedback(ownerId);
    const filteredResults = applyModeFeedbackToResults(results, feedbackEntries);
    filteredResults.feedback = buildModeFeedbackMap(filteredResults, feedbackEntries, VALID_MODES);

    const populated = VALID_MODES.filter((m) => filteredResults[m] != null);
    if (!populated.length) {
      console.log(`[modes] All modes empty for ${ownerId.slice(0, 8)}. Run generateAdaptiveModes job.`);
    }
    return sendSuccess(res, filteredResults);
  } catch (error) {
    captureServerError(error, { path: "/api/modes" });
    return sendError(res, 500, "INTERNAL_ERROR", "Something went wrong");
  }
}
