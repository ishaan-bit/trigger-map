import { validateSession } from "@/services/authService.js";
import enableCors from "@/lib/cors.js";
import { captureServerError } from "@/services/monitoringService.js";
import { sendError, sendSuccess } from "@/services/response.js";
import { getBearerToken } from "@/services/security.js";
import { redis, redisKey } from "@/services/redisClient.js";
import { getMomentsKey } from "@/services/momentService.js";
import { getWeeklyReportKey } from "@/services/reportStore.js";
import { formatAggregateDate, getDailyAggregateKey } from "@/services/aggregationService.js";

export default async function handler(req, res) {
  if (enableCors(req, res)) {
    return;
  }

  if (req.method !== "DELETE") {
    return sendError(res, 405, "METHOD_NOT_ALLOWED", "Only DELETE is supported");
  }

  try {
    // Device-based identity: a token is optional. Anonymous owners delete by deviceId.
    const token = getBearerToken(req);
    const user = token ? await validateSession(token).catch(() => null) : null;
    const ownerId = user?.id || req.query.deviceId;
    if (!ownerId) {
      return sendError(res, 400, "MISSING_OWNER", "deviceId is required");
    }

    // Collect all known user-scoped keys
    const keysToDelete = [
      getMomentsKey(ownerId),
      getWeeklyReportKey(ownerId),
      redisKey("llm_insight", ownerId),
      redisKey("subscription", ownerId),
    ];

    // Delete recent daily aggregates (last 45 days)
    const today = new Date();
    for (let i = 0; i < 45; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      keysToDelete.push(getDailyAggregateKey(ownerId, formatAggregateDate(date)));
    }

    // Delete all keys (ignore keys that don't exist)
    for (const key of keysToDelete) {
      await redis(["DEL", key]);
    }

    return sendSuccess(res, { deleted: true });
  } catch (error) {
    captureServerError(error, { route: "deleteData" });
    return sendError(res, 500, "DELETE_FAILED", "Unable to delete data");
  }
}
