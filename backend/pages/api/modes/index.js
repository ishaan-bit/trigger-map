import enableCors from "@/lib/cors.js";
import { sendError, sendSuccess } from "@/services/response.js";
import { getBearerToken } from "@/services/security.js";
import { validateSession } from "@/services/authService.js";
import { getStoredModeOutput } from "@/services/modeStore.js";
import { captureServerError } from "@/services/monitoringService.js";

const VALID_MODES = ["move", "fuel", "perspective"];

/**
 * GET /api/modes?mode=move — fetch latest cached mode output
 * GET /api/modes — fetch all three modes
 *
 * Premium-only endpoint.
 */
export default async function handler(req, res) {
  if (enableCors(req, res)) return;

  if (req.method !== "GET") {
    return sendError(res, 405, "METHOD_NOT_ALLOWED", "GET only");
  }

  try {
    const token = getBearerToken(req);
    const user = token ? await validateSession(token).catch(() => null) : null;
    if (!user) {
      return sendError(res, 401, "AUTH_REQUIRED", "Sign in to access adaptive modes");
    }

    const ownerId = user.id;
    const requestedMode = req.query.mode;

    if (requestedMode) {
      if (!VALID_MODES.includes(requestedMode)) {
        return sendError(res, 400, "INVALID_MODE", `mode must be one of: ${VALID_MODES.join(", ")}`);
      }
      const output = await getStoredModeOutput(ownerId, requestedMode);
      return sendSuccess(res, { [requestedMode]: output });
    }

    // Return all three modes
    const results = {};
    for (const mode of VALID_MODES) {
      results[mode] = await getStoredModeOutput(ownerId, mode);
    }
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
