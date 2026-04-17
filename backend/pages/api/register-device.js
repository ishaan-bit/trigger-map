import enableCors from "@/lib/cors.js";
import { enforceRateLimit, touchDailyActive } from "@/services/rateLimitService.js";
import { sendError, sendSuccess } from "@/services/response.js";
import { getClientIp } from "@/services/security.js";
import { redis, redisKey } from "@/services/redisClient.js";

/**
 * POST /api/register-device
 *
 * Lightweight anonymous device registration.
 * Called at app bootstrap so every install is discoverable in ops console
 * immediately — independent of push permission or moment logging.
 *
 * Body: { deviceId: string }
 */
export default async function handler(req, res) {
  if (enableCors(req, res)) return;

  if (req.method !== "POST") {
    return sendError(res, 405, "METHOD_NOT_ALLOWED", "Only POST is supported");
  }

  const { deviceId } = req.body || {};

  if (!deviceId || typeof deviceId !== "string" || deviceId.length < 8 || deviceId.length > 128) {
    return sendError(res, 400, "INVALID_INPUT", "deviceId is required");
  }

  try {
    const ip = getClientIp(req);
    const allowed = await enforceRateLimit(`register-device:${ip}`, 10, 60);
    if (!allowed) {
      return sendError(res, 429, "RATE_LIMITED", "Too many requests");
    }

    // Idempotent: SADD is a no-op if already present; HSETNX only sets if key doesn't exist
    await Promise.all([
      redis(["SADD", redisKey("owners"), deviceId]),
      redis(["HSETNX", redisKey("user", deviceId), "createdAt", new Date().toISOString()]),
    ]);

    await touchDailyActive(deviceId);

    return sendSuccess(res, { registered: true });
  } catch (err) {
    // Non-critical path — log but don't surface to client
    console.error("[register-device] error:", err.message);
    return sendSuccess(res, { registered: false });
  }
}
