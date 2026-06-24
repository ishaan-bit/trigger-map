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
    // Device-based identity: a token is optional. Fall back to the deviceId so
    // anonymous owners can hydrate their subscription / first-AI-free state.
    const token = getBearerToken(req);
    const user = token ? await validateSession(token).catch(() => null) : null;
    const ownerId = user?.id || req.query.deviceId;
    if (!ownerId) {
      return sendError(res, 400, "MISSING_OWNER", "deviceId is required");
    }

    const [subscription, firstAiFreeAvailable] = await Promise.all([
      getSubscription(ownerId),
      isFirstAiFreeAvailable(ownerId),
    ]);
    return sendSuccess(res, {
      user: user || { id: ownerId, anonymous: true },
      subscription,
      firstAiFreeAvailable,
    });
  } catch (error) {
    captureServerError(error, { route: "me" });
    return sendError(res, 500, "ME_FAILED", "Unable to load account");
  }
}