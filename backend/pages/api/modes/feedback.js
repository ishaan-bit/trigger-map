import enableCors from "@/lib/cors.js";
import { sendError, sendSuccess } from "@/services/response.js";
import { getBearerToken } from "@/services/security.js";
import { validateSession } from "@/services/authService.js";
import { storeModeFeedback, applyModeFeedbackToProfile } from "@/services/modeStore.js";
import { captureServerError } from "@/services/monitoringService.js";

const VALID_MODES = ["move", "fuel", "perspective"];
const VALID_RESPONSES = ["helpful", "not_helpful"];

/**
 * POST /api/modes/feedback
 * Body: { mode, itemId, response }
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
    const user = token ? await validateSession(token) : null;
    if (!user) {
      return sendError(res, 401, "AUTH_REQUIRED", "Sign in to submit feedback");
    }

    const { mode, itemId, response } = req.body || {};

    if (!VALID_MODES.includes(mode)) {
      return sendError(res, 400, "INVALID_MODE", `mode must be one of: ${VALID_MODES.join(", ")}`);
    }
    if (!itemId || typeof itemId !== "string") {
      return sendError(res, 400, "INVALID_ITEM", "itemId is required");
    }
    if (!VALID_RESPONSES.includes(response)) {
      return sendError(res, 400, "INVALID_RESPONSE", `response must be 'helpful' or 'not_helpful'`);
    }

    const ownerId = user.id;
    await storeModeFeedback(ownerId, mode, itemId, response);

    // Auto-adjust profile if mode is move or fuel
    if (mode === "move" || mode === "fuel") {
      await applyModeFeedbackToProfile(ownerId, mode, itemId, response);
    }

    return sendSuccess(res, { stored: true });
  } catch (error) {
    captureServerError(error, { path: "/api/modes/feedback" });
    return sendError(res, 500, "INTERNAL_ERROR", "Something went wrong");
  }
}
