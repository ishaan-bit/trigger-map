import { validateSession } from "@/services/authService.js";
import enableCors from "@/lib/cors.js";
import { captureServerError } from "@/services/monitoringService.js";
import { sendError, sendSuccess } from "@/services/response.js";
import { getBearerToken } from "@/services/security.js";
import { redis, redisKey } from "@/services/redisClient.js";

/**
 * GET  /api/notification-prefs — read prefs
 * POST /api/notification-prefs — save prefs
 *
 * Body (POST): { daily: bool, weekly: bool, nudge: bool, deviceId?: string }
 * Stored in Redis: notification_prefs:<ownerId> → JSON
 *
 * ownerId = user.id when signed in, else the anonymous deviceId. This mirrors
 * push-token.js so anonymous (sign-in-free) users can persist their opt-outs and
 * push-cron honors them — it already reads notification_prefs:<ownerId> generically.
 */
export default async function handler(req, res) {
  if (enableCors(req, res)) return;

  if (req.method !== "GET" && req.method !== "POST") {
    return sendError(res, 405, "METHOD_NOT_ALLOWED", "Only GET/POST supported");
  }

  try {
    const bearerToken = getBearerToken(req);
    const user = bearerToken ? await validateSession(bearerToken).catch(() => null) : null;
    const deviceId = req.body?.deviceId || req.query.deviceId;
    const ownerId = user?.id || deviceId;

    if (!ownerId) {
      return sendError(res, 400, "MISSING_OWNER", "deviceId or authentication required");
    }

    const key = redisKey("notification_prefs", ownerId);

    if (req.method === "GET") {
      const raw = await redis(["GET", key]);
      const prefs = raw ? JSON.parse(raw) : { daily: true, weekly: true, nudge: true };
      return sendSuccess(res, { prefs });
    }

    // POST — merge with existing prefs (partial updates supported)
    const body = req.body || {};
    const existingRaw = await redis(["GET", key]);
    const existing = existingRaw ? JSON.parse(existingRaw) : { daily: true, weekly: true, nudge: true };

    const prefs = {
      daily: body.daily !== undefined ? body.daily : existing.daily,
      weekly: body.weekly !== undefined ? body.weekly : existing.weekly,
      nudge: body.nudge !== undefined ? body.nudge : existing.nudge,
      updatedAt: new Date().toISOString(),
    };

    await redis(["SET", key, JSON.stringify(prefs)]);
    console.log(`[notification-prefs] saved owner=${String(ownerId).slice(0, 8)}… daily=${prefs.daily} weekly=${prefs.weekly} nudge=${prefs.nudge}`);
    return sendSuccess(res, { prefs });
  } catch (error) {
    captureServerError(error, { route: "notification-prefs" });
    return sendError(res, 500, "PREFS_FAILED", "Unable to update notification preferences");
  }
}
