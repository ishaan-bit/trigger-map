import enableCors from "@/lib/cors.js";
import { validateSession } from "@/services/authService.js";
import { trackServerEvent } from "@/services/analyticsService.js";
import { captureServerError } from "@/services/monitoringService.js";
import { sendError, sendSuccess } from "@/services/response.js";
import { getBearerToken } from "@/services/security.js";
import { grantProvisionalSubscription } from "@/services/subscriptionService.js";

export default async function handler(req, res) {
  if (enableCors(req, res)) {
    return;
  }

  if (req.method !== "POST") {
    return sendError(res, 405, "METHOD_NOT_ALLOWED", "Only POST is supported");
  }

  try {
    const token = getBearerToken(req);
    if (!token) {
      return sendError(res, 401, "UNAUTHORIZED", "Authentication required");
    }

    const user = await validateSession(token);
    const subscription = await grantProvisionalSubscription(user.id);

    await trackServerEvent("subscription_provisional_granted", user.id, subscription);

    return sendSuccess(res, { subscription });
  } catch (error) {
    captureServerError(error, { route: "subscriptionGrantProvisional" });
    return sendError(res, 500, "GRANT_FAILED", "Unable to grant provisional access");
  }
}
