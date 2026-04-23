import { randomUUID } from "crypto";
import enableCors from "@/lib/cors.js";
import { sendError, sendSuccess } from "@/services/response.js";
import { getBearerToken } from "@/services/security.js";
import { validateSession } from "@/services/authService.js";
import { redis, redisKey } from "@/services/redisClient.js";
import { getStoredWeeklyInsight, getStoredLlmInsight } from "@/services/reportStore.js";
import { getWeeklyAggregates } from "@/services/aggregationService.js";
import { generateWeeklyReport } from "@/services/patternEngine.js";
import { getTimeline } from "@/services/momentService.js";
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

      // Build the full report on-demand from live aggregates — mirrors weeklyReport.js.
      // The cached `weekly_report:<id>` payload only stores the AI summary fields,
      // not the structured stats (totalMoments, topEmotion, dataQuality, etc.) that
      // the share page renders, so we cannot read it directly.
      const [aggregates, allAggregates, allMoments, storedSummary, llmInsight] = await Promise.all([
        getWeeklyAggregates(user.id),
        getWeeklyAggregates(user.id, 45),
        getTimeline(user.id),
        getStoredWeeklyInsight(user.id),
        getStoredLlmInsight(user.id),
      ]);

      // Match the silence-window sliding logic used by weeklyReport.js so
      // a user who logged 3 days ago still gets a populated snapshot.
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      let recentMoments = (allMoments || []).filter((m) => m.timestamp >= sevenDaysAgo);
      const lifetimeMoments = (allMoments || []).length;
      const lastMomentTimestamp = allMoments?.[0]?.timestamp;
      const daysSinceLastLog = lastMomentTimestamp
        ? Math.floor((Date.now() - new Date(lastMomentTimestamp).getTime()) / 86400000)
        : null;
      const isSilent = recentMoments.length === 0 && lifetimeMoments >= 3 && daysSinceLastLog >= 1;

      let effectiveAggregates = aggregates;
      let effectivePreviousAggregates = allAggregates.length >= 14 ? allAggregates.slice(-14, -7) : null;
      let silenceWindow = null;

      if (isSilent) {
        const activeDays = allAggregates.filter((a) => Number(a.total || 0) > 0);
        effectiveAggregates = activeDays.slice(-7);
        effectivePreviousAggregates = activeDays.length > 7 ? activeDays.slice(-14, -7) : null;
        if (effectiveAggregates.length) {
          const ws = effectiveAggregates[0].date;
          const we = effectiveAggregates[effectiveAggregates.length - 1].date;
          recentMoments = (allMoments || []).filter((m) => {
            const d = new Date(m.timestamp).toISOString().slice(0, 10);
            return d >= ws && d <= we;
          });
        }
        silenceWindow = { isSilent: true, daysSinceLastLog, totalLifetimeMoments: lifetimeMoments };
      }

      const report = generateWeeklyReport({
        aggregates: effectiveAggregates,
        allAggregates,
        previousAggregates: effectivePreviousAggregates,
        moments: recentMoments,
        silenceWindow,
      });

      if (!report || !report.totalMoments) {
        return sendError(res, 404, "NO_REPORT", "No weekly data to share yet");
      }

      // Build a sanitised snapshot — no notes, no raw moments, no PII
      const snapshot = buildSnapshot(report, user, { storedSummary, llmInsight });
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

function buildSnapshot(report, user, { storedSummary, llmInsight } = {}) {
  const dq = report.dataQuality || {};
  const bm = report.baselineMetrics || {};
  const insight = report.aiInsight || {};

  // Signature loop: most repeated trigger → emotion combo
  const signatureLoop = report.topPair
    ? { trigger: report.topPair.trigger, emotion: report.topPair.emotion, count: report.topPair.count }
    : null;

  // Top regulator (what helped this week)
  const helped = (report.regulators || [])[0]
    ? {
        trigger: report.regulators[0].trigger,
        emotion: report.regulators[0].emotion,
      }
    : null;

  // Top friction zone (what added strain)
  const friction = (report.frictionZones || [])[0]
    ? {
        trigger: report.frictionZones[0].trigger,
        emotion: report.frictionZones[0].emotion,
      }
    : null;

  return {
    sharedAt: new Date().toISOString(),
    firstName: user.firstName || (user.name ? String(user.name).split(/\s+/)[0] : null),
    weekLabel: report.weekLabel || null,
    totalMoments: report.totalMoments || 0,
    daysLogged: dq.daysLogged || 0,
    topEmotion: report.topEmotion || null,
    topTrigger: report.topTrigger || null,
    confidence: dq.confidence || "too_early",
    stateOfMind: bm.stateOfMind || null,
    drift: bm.drift?.label || null,
    stability: bm.stability?.label || null,
    weeklyEmotionTrajectory: (report.weeklyEmotionTrajectory || []).map((d) => ({
      date: d.date,
      score: d.score,
    })),
    // Signature behavioural loop
    signatureLoop,
    // What helped vs added friction
    helped,
    friction,
    // Insight headline (prefer LLM-rewritten cached summary, then computed insight)
    insightSummary: storedSummary?.summary || insight.summary || null,
    llmHighlight: llmInsight?.sections?.stoodOut || null,
    // Top action (just one — the page is a teaser, not the full report)
    topActions: (report.actions || []).slice(0, 2).map((a) => ({
      text: a.text,
      trigger: a.trigger,
    })),
  };
}
