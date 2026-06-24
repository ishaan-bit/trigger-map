import { getWeeklyAggregates, padToDailyWindow } from "@/services/aggregationService.js";
import { computeBaselineMetrics } from "@/services/baselineEngine.js";
import { computeProgressMetrics } from "@/services/progressEngine.js";
import { getActionFeedback } from "@/services/reportStore.js";
import enableCors from "@/lib/cors.js";
import { sendError, sendSuccess } from "@/services/response.js";
import { getBearerToken } from "@/services/security.js";
import { validateSession } from "@/services/authService.js";
import { buildAggregatesFromRawMoments, loadRawMomentEntries, parseRawMomentEntries } from "@/jobs/llmInsightSource.js";

export default async function handler(req, res) {
  if (enableCors(req, res)) return;

  if (req.method !== "GET") {
    return sendError(res, 405, "METHOD_NOT_ALLOWED", "Only GET is supported");
  }

  try {
    const token = getBearerToken(req);
    const user = token ? await validateSession(token).catch(() => null) : null;
    const ownerId = user?.id || req.query.deviceId;

    if (!ownerId) {
      return sendError(res, 400, "MISSING_OWNER", "deviceId is required when unauthenticated");
    }

    // Fetch 45-day aggregates for longitudinal view
    const [allAggregates, actionFeedback] = await Promise.all([
      getWeeklyAggregates(ownerId, 45),
      getActionFeedback(ownerId),
    ]);

    function compute(aggregates) {
      const baselineMetrics = computeBaselineMetrics(aggregates);
      const baselineScore = baselineMetrics?.baseline?.score ?? 3.0;
      return computeProgressMetrics({ aggregates, baselineScore, actionFeedback });
    }

    let progress = compute(allAggregates);

    // Raw-moment fallback: daily aggregate hashes can drift or expire (45-day
    // TTL) or be missing after migration, while the raw timeline persists.
    // If aggregates don't yield progress, rebuild from raw moments so a user
    // who genuinely has 2+ weeks of data isn't told to "keep logging".
    if (!progress) {
      const rawEntries = await loadRawMomentEntries(ownerId);
      if (rawEntries.length) {
        const { moments } = parseRawMomentEntries(rawEntries, { ownerId });
        const rebuilt = padToDailyWindow(buildAggregatesFromRawMoments(moments), 45);
        const rawProgress = compute(rebuilt);
        if (rawProgress) progress = rawProgress;
      }
    }

    if (!progress) {
      return sendSuccess(res, {
        progress: null,
        message: "Not enough data for progress tracking. Keep logging for at least 2 weeks.",
      });
    }

    return sendSuccess(res, { progress });
  } catch (err) {
    console.error("Progress API error:", err);
    return sendError(res, 500, "INTERNAL_ERROR", "Failed to compute progress metrics");
  }
}
