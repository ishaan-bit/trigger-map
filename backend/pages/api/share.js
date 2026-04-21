import { randomUUID } from "crypto";
import enableCors from "@/lib/cors.js";
import { sendError, sendSuccess } from "@/services/response.js";
import { getBearerToken } from "@/services/security.js";
import { validateSession } from "@/services/authService.js";
import { redis, redisKey } from "@/services/redisClient.js";
import { getStoredWeeklyInsight } from "@/services/reportStore.js";
import { captureServerError } from "@/services/monitoringService.js";

const SHARE_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

/**
 * POST /api/share — create a shareable snapshot token (auth required)
 * GET  /api/share?token=<uuid> — fetch snapshot by token (public, no auth)
 */
export default async function handler(req, res) {
  if (enableCors(req, res)) return;

  try {
    if (req.method === "POST") {
      const token = getBearerToken(req);
      if (!token) return sendError(res, 401, "AUTH_REQUIRED", "Sign in to share your snapshot");

      const user = await validateSession(token).catch(() => null);
      if (!user) return sendError(res, 401, "AUTH_REQUIRED", "Invalid session");

      const report = await getStoredWeeklyInsight(user.id);
      if (!report) return sendError(res, 404, "NO_REPORT", "No weekly report to share yet");

      // Build a sanitised snapshot — no notes, no raw moments, no PII
      const snapshot = buildSnapshot(report, user);
      const shareToken = randomUUID();
      const key = redisKey("share", shareToken);

      await redis(["SET", key, JSON.stringify(snapshot), "EX", String(SHARE_TTL_SECONDS)]);

      return sendSuccess(res, { token: shareToken, expiresIn: "7 days" });
    }

    if (req.method === "GET") {
      const { token: shareToken } = req.query;
      if (!shareToken || typeof shareToken !== "string" || !/^[0-9a-f-]{36}$/.test(shareToken)) {
        return sendError(res, 400, "INVALID_TOKEN", "Invalid share token");
      }

      const key = redisKey("share", shareToken);
      const raw = await redis(["GET", key]);
      if (!raw) return sendError(res, 404, "NOT_FOUND", "This link has expired or doesn't exist");

      const snapshot = JSON.parse(raw);
      return sendSuccess(res, snapshot);
    }

    return sendError(res, 405, "METHOD_NOT_ALLOWED", "Only GET and POST are supported");
  } catch (err) {
    captureServerError(err, req);
    return sendError(res, 500, "INTERNAL_ERROR", "Something went wrong");
  }
}

function buildSnapshot(report, user) {
  const dq = report.dataQuality || {};
  const bm = report.baselineMetrics || {};
  const insight = report.aiInsight || {};

  return {
    sharedAt: new Date().toISOString(),
    firstName: user.firstName || null,
    weekLabel: report.weekLabel || null,
    totalMoments: report.totalMoments || 0,
    daysLogged: dq.daysLogged || 0,
    topEmotion: report.topEmotion || null,
    topTrigger: report.topTrigger || null,
    confidence: dq.confidence || "too_early",
    stateOfMind: bm.stateOfMind || null,
    drift: bm.drift?.label || null,
    weeklyEmotionTrajectory: (report.weeklyEmotionTrajectory || []).map((d) => ({
      date: d.date,
      score: d.score,
    })),
    // Only the "stood out" section of LLM insight — not the full narrative
    llmHighlight: report.llmInsight?.sections?.stoodOut || null,
    // Action recommendations without personalised detail
    topActions: (report.actions || []).slice(0, 2).map((a) => ({
      text: a.text,
      trigger: a.trigger,
    })),
  };
}
