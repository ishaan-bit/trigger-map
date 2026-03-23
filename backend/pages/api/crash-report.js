import enableCors from "@/lib/cors.js";
import { redis, redisKey } from "@/services/redisClient.js";
import { sendError, sendSuccess } from "@/services/response.js";

const MAX_CRASH_LOGS = 500;
const CRASH_TTL = 60 * 60 * 24 * 30; // 30 days

export default async function handler(req, res) {
  if (enableCors(req, res)) return;

  if (req.method !== "POST") {
    return sendError(res, 405, "METHOD_NOT_ALLOWED", "Only POST is supported");
  }

  try {
    const { message, stack, componentStack, appVersion, platform, deviceId, screen, extra } = req.body || {};

    if (!message || typeof message !== "string") {
      return sendError(res, 400, "INVALID_PAYLOAD", "message is required");
    }

    const entry = {
      message: message.slice(0, 1000),
      stack: typeof stack === "string" ? stack.slice(0, 4000) : null,
      componentStack: typeof componentStack === "string" ? componentStack.slice(0, 2000) : null,
      appVersion: typeof appVersion === "string" ? appVersion.slice(0, 20) : null,
      platform: typeof platform === "string" ? platform.slice(0, 20) : null,
      deviceId: typeof deviceId === "string" ? deviceId.slice(0, 64) : null,
      screen: typeof screen === "string" ? screen.slice(0, 100) : null,
      extra: extra && typeof extra === "object" ? JSON.stringify(extra).slice(0, 1000) : null,
      timestamp: new Date().toISOString(),
    };

    const key = redisKey("crash_logs");
    await redis(["LPUSH", key, JSON.stringify(entry)]);
    await redis(["LTRIM", key, "0", String(MAX_CRASH_LOGS - 1)]);
    await redis(["EXPIRE", key, String(CRASH_TTL)]);

    return sendSuccess(res, { ok: true });
  } catch (err) {
    console.error("Crash report storage error:", err);
    return sendError(res, 500, "INTERNAL_ERROR", "Failed to store crash report");
  }
}
