import enableCors from "@/lib/cors.js";
import { sendError, sendSuccess } from "@/services/response.js";
import { getBearerToken, getClientIp } from "@/services/security.js";
import { enforceRateLimit } from "@/services/rateLimitService.js";
import { captureServerError } from "@/services/monitoringService.js";
import { recoverDeviceIfNeeded } from "@/services/dataMigration.js";

// App-facing one-time recovery. Called by the device-based app on first launch
// after updating from a signed-in build, to pull its stranded account data back
// onto its deviceId. The account is derived server-side from the (optional) legacy
// session token or the device→account link — never from a client-supplied userId.
export default async function handler(req, res) {
  if (enableCors(req, res)) {
    return;
  }

  if (req.method !== "POST") {
    return sendError(res, 405, "METHOD_NOT_ALLOWED", "Only POST is supported");
  }

  try {
    const deviceId = req.body?.deviceId || req.query.deviceId;
    if (!deviceId) {
      return sendError(res, 400, "MISSING_OWNER", "deviceId is required");
    }

    const allowed = await enforceRateLimit(`recover:${getClientIp(req)}`, 10, 60);
    if (!allowed) {
      return sendError(res, 429, "RATE_LIMITED", "Too many recovery requests");
    }

    // Legacy session token left over in SecureStore from the old signed-in build.
    const token = getBearerToken(req);
    const result = await recoverDeviceIfNeeded(deviceId, token);
    return sendSuccess(res, result);
  } catch (error) {
    captureServerError(error, { route: "recover" });
    return sendError(res, 500, "RECOVER_FAILED", "Unable to recover data");
  }
}
