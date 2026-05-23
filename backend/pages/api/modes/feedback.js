import enableCors from "@/lib/cors.js";
import { sendError, sendSuccess } from "@/services/response.js";
import { getBearerToken } from "@/services/security.js";
import { validateSession } from "@/services/authService.js";
import { storeModeFeedback, applyModeFeedbackToProfile } from "@/services/modeStore.js";
import { captureServerError } from "@/services/monitoringService.js";

const VALID_MODES = ["move", "fuel", "perspective"];
const VALID_RESPONSES = ["helpful", "not_helpful", "tried", "skipped", "too_hard", "not_relevant"];

function normalizeResponse(response) {
  if (response === "tried") return "helpful";
  if (response === "skipped" || response === "too_hard" || response === "not_relevant") return "not_helpful";
  return response;
}

/**
 * POST /api/modes/feedback
 * Body: { mode, itemId, response, deviceId? }
 * Also accepts aliases: { section, suggestionId, feedback }.
 *
 * Records HiTL feedback on a mode output item and auto-adjusts profile.
 */
export default async function handler(req, res) {
  if (enableCors(req, res)) return;

  if (req.method !== "POST") {
    return sendError(res, 405, "METHOD_NOT_ALLOWED", "POST only");
  }

  try {
    const token = getBearerToken(req);
    const user = token ? await validateSession(token).catch(() => null) : null;
    const ownerId = user?.id || req.body?.deviceId || req.query.deviceId;

    if (!ownerId || typeof ownerId !== "string") {
      return sendError(res, 400, "MISSING_OWNER", "deviceId is required when unauthenticated");
    }

    const body = req.body || {};
    const mode = body.mode || body.section;
    const itemId = body.itemId || body.suggestionId;
    const response = body.response || body.feedback;
    const normalized = normalizeResponse(response);

    if (!VALID_MODES.includes(mode)) {
      return sendError(res, 400, "INVALID_MODE", `mode must be one of: ${VALID_MODES.join(", ")}`);
    }
    if (!itemId || typeof itemId !== "string") {
      return sendError(res, 400, "INVALID_ITEM", "itemId is required");
    }
    if (!VALID_RESPONSES.includes(response)) {
      return sendError(res, 400, "INVALID_RESPONSE", `response must be one of: ${VALID_RESPONSES.join(", ")}`);
    }

    const source = typeof body.source === "string" ? body.source : undefined;
    const reason = typeof body.reason === "string" ? body.reason : undefined;
    await storeModeFeedback(ownerId, mode, itemId, normalized, {
      ...(response !== normalized ? { rawResponse: response } : {}),
      ...(source ? { source } : {}),
      ...(reason ? { reason } : {}),
      ownerType: user ? "user" : "device",
    });

    // Auto-adjust profile if mode is move or fuel
    if (mode === "move" || mode === "fuel") {
      await applyModeFeedbackToProfile(ownerId, mode, itemId, normalized);
    }

    return sendSuccess(res, { stored: true, response: normalized });
  } catch (error) {
    captureServerError(error, { path: "/api/modes/feedback" });
    return sendError(res, 500, "INTERNAL_ERROR", "Something went wrong");
  }
}
