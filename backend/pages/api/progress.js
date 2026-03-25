import { getWeeklyAggregates } from "@/services/aggregationService.js";
import { computeBaselineMetrics } from "@/services/baselineEngine.js";
import { computeProgressMetrics } from "@/services/progressEngine.js";
import { getActionFeedback } from "@/services/reportStore.js";
import enableCors from "@/lib/cors.js";
import { sendError, sendSuccess } from "@/services/response.js";
import { getBearerToken } from "@/services/security.js";
import { validateSession } from "@/services/authService.js";

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

    // Compute baseline from full window
    const baselineMetrics = computeBaselineMetrics(allAggregates);
    const baselineScore = baselineMetrics?.baseline?.score ?? 3.0;

    // Compute progress metrics
    const progress = computeProgressMetrics({
      aggregates: allAggregates,
      baselineScore,
      actionFeedback,
    });

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
