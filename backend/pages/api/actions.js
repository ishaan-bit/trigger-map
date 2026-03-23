import enableCors from "@/lib/cors.js";
import { sendError, sendSuccess } from "@/services/response.js";
import { getBearerToken } from "@/services/security.js";
import { validateSession } from "@/services/authService.js";
import { storeActionFeedback, getActionFeedback } from "@/services/reportStore.js";
import { captureServerError } from "@/services/monitoringService.js";

export default async function handler(req, res) {
  if (enableCors(req, res)) return;

  try {
    const token = getBearerToken(req);
    const user = token ? await validateSession(token) : null;
    const ownerId = user?.id || req.query.deviceId || (req.body && req.body.deviceId);

    if (!ownerId) {
      return sendError(res, 400, "MISSING_OWNER", "deviceId is required when unauthenticated");
    }

    if (req.method === "POST") {
      const { actionId, response } = req.body || {};
      if (!actionId || typeof actionId !== "string") {
        return sendError(res, 400, "INVALID_FEEDBACK", "actionId is required");
      }
      if (!["tried", "skipped"].includes(response)) {
        return sendError(res, 400, "INVALID_FEEDBACK", "response must be 'tried' or 'skipped'");
      }
      await storeActionFeedback(ownerId, actionId, response);
      return sendSuccess(res, { stored: true });
    }

    if (req.method === "GET") {
      const feedback = await getActionFeedback(ownerId);
      return sendSuccess(res, { feedback });
    }

    return sendError(res, 405, "METHOD_NOT_ALLOWED", "GET or POST only");
  } catch (error) {
    captureServerError(error, { path: "/api/actions" });
    return sendError(res, 500, "INTERNAL_ERROR", "Something went wrong");
  }
}
