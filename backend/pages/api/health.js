import { redis, redisKey } from "@/services/redisClient.js";
import enableCors from "@/lib/cors.js";
import { captureServerError } from "@/services/monitoringService.js";
import { sendError } from "@/services/response.js";

export default async function handler(req, res) {
  if (enableCors(req, res)) {
    return;
  }

  if (req.method !== "GET") {
    return sendError(res, 405, "METHOD_NOT_ALLOWED", "Only GET is supported");
  }

  try {
    const env = {
      redisConfigured: Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN),
      jwtConfigured: Boolean(process.env.JWT_SECRET),
      googleConfigured: Boolean(process.env.GOOGLE_CLIENT_ID),
      appBaseUrlConfigured: Boolean(process.env.APP_BASE_URL),
    };

    const healthKey = redisKey("health");
    await redis(["SET", healthKey, new Date().toISOString(), "EX", "60"]);
    const redisEcho = await redis(["GET", healthKey]);

    if (!redisEcho) {
      throw new Error("Redis healthcheck failed");
    }

    return res.status(200).json({
      status: "ok",
      service: "triggermap-backend",
      checkedAt: new Date().toISOString(),
      env,
    });
  } catch (error) {
    captureServerError(error, { route: "health" });
    return sendError(res, 500, "HEALTHCHECK_FAILED", "Backend healthcheck failed");
  }
}