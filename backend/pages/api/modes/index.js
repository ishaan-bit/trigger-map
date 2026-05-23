import enableCors from "@/lib/cors.js";
import { sendError, sendSuccess } from "@/services/response.js";
import { getBearerToken } from "@/services/security.js";
import { validateSession } from "@/services/authService.js";
import { getStoredModeOutput, getModeFeedback } from "@/services/modeStore.js";
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
      return sendSuccess(res, { [requestedMode]: output });
    }

    // Return all three modes + feedback map
    const results = {};
    for (const mode of VALID_MODES) {
      results[mode] = await getStoredModeOutput(ownerId, mode)
        || await generateRuleBasedModeOutput({ ownerId, mode, lang, persist: false, reason: "empty_cache" });
    }

    // Include feedback state so the client can restore thumbs
    // Only return feedback given AFTER the current generation — don't treat old feedback as eternal
    const feedbackEntries = await getModeFeedback(ownerId);
    const feedbackMap = {};
    // Collect per-mode generatedAt so we can filter stale feedback
    const generatedAtMap = {};
    for (const mode of VALID_MODES) {
      if (results[mode]?.generatedAt) generatedAtMap[mode] = new Date(results[mode].generatedAt).getTime();
    }
    // Build set of current item IDs per mode for fast lookup
    const currentItemsByMode = {};
    for (const mode of VALID_MODES) {
      currentItemsByMode[mode] = new Set((results[mode]?.items || []).map((i) => i.id));
    }
    for (const entry of feedbackEntries) {
      const genAt = generatedAtMap[entry.mode];
      // Only include feedback that was given after the current output was generated
      // AND the item is in the current output (not a stale reappearance)
      if (genAt && entry.timestamp >= genAt && currentItemsByMode[entry.mode]?.has(entry.itemId)) {
        feedbackMap[entry.itemId] = entry.response;
      }
    }
    results.feedback = feedbackMap;

    const populated = VALID_MODES.filter((m) => results[m] != null);
    if (!populated.length) {
      console.log(`[modes] All modes empty for ${ownerId.slice(0, 8)}. Run generateAdaptiveModes job.`);
    }
    return sendSuccess(res, results);
  } catch (error) {
    captureServerError(error, { path: "/api/modes" });
    return sendError(res, 500, "INTERNAL_ERROR", "Something went wrong");
  }
}
