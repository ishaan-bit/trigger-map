import { validateSession } from "@/services/authService.js";
import enableCors from "@/lib/cors.js";
import { captureServerError } from "@/services/monitoringService.js";
import { sendError, sendSuccess } from "@/services/response.js";
import { getBearerToken } from "@/services/security.js";
import { redis, redisKey } from "@/services/redisClient.js";

/**
 * POST /api/push-token
 *
 * Register or unregister a device push token.
 * Authenticated users use their userId; anonymous users use their deviceId as ownerId.
 * Tokens are stored per-device so multi-device users get notifications on all active devices.
 *
 * Body:
 *   { action: "register", deviceId, token, platform? }
 *   { action: "unregister", deviceId }
 */
export default async function handler(req, res) {
  if (enableCors(req, res)) return;

  if (req.method !== "POST") {
    return sendError(res, 405, "METHOD_NOT_ALLOWED", "Only POST is supported");
  }

  try {
    const bearerToken = getBearerToken(req);
    const user = bearerToken ? await validateSession(bearerToken).catch(() => null) : null;

    const { action, deviceId, token, platform } = req.body || {};

    if (!deviceId || typeof deviceId !== "string") {
      return sendError(res, 400, "INVALID_INPUT", "deviceId is required");
    }

    // Authenticated users store under userId; anonymous under deviceId
    const ownerId = user?.id || deviceId;
    const key = redisKey("push_tokens", ownerId);

    if (action === "register") {
      if (!token || typeof token !== "string") {
        return sendError(res, 400, "INVALID_INPUT", "token is required for register");
      }

      const entry = JSON.stringify({
        token,
        platform: platform || "unknown",
        updatedAt: new Date().toISOString(),
      });

      await redis(["HSET", key, deviceId, entry]);

      console.log(`[push-token] registered device=${deviceId.slice(0, 8)}… owner=${ownerId.slice(0, 8)}…`);
      return sendSuccess(res, { registered: true });
    }

    if (action === "unregister") {
      await redis(["HDEL", key, deviceId]);

      console.log(`[push-token] unregistered device=${deviceId.slice(0, 8)}… owner=${ownerId.slice(0, 8)}…`);
      return sendSuccess(res, { unregistered: true });
    }

    return sendError(res, 400, "INVALID_INPUT", "action must be 'register' or 'unregister'");
  } catch (error) {
    captureServerError(error, { route: "push-token" });
    return sendError(res, 500, "PUSH_TOKEN_FAILED", "Unable to process push token");
  }
}
