import { getSubscription, isFirstAiFreeAvailable, validateSession } from "@/services/authService.js";
import enableCors from "@/lib/cors.js";
import { captureServerError } from "@/services/monitoringService.js";
import { sendError, sendSuccess } from "@/services/response.js";
import { getBearerToken } from "@/services/security.js";

export default async function handler(req, res) {
  if (enableCors(req, res)) {
    return;
  }

  if (req.method !== "GET") {
    return sendError(res, 405, "METHOD_NOT_ALLOWED", "Only GET is supported");
  }

  try {
    const token = getBearerToken(req);
    if (!token) {
      return sendError(res, 401, "UNAUTHORIZED", "Authentication required");
    }

    const user = await validateSession(token);
    const [subscription, firstAiFreeAvailable] = await Promise.all([
      getSubscription(user.id),
      isFirstAiFreeAvailable(user.id),
    ]);
    return sendSuccess(res, { user, subscription, firstAiFreeAvailable });
  } catch (error) {
    captureServerError(error, { route: "me" });
    return sendError(res, 401, "UNAUTHORIZED", "Session is invalid");
  }
}