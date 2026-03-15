import { getWeeklyAggregates } from "@/services/aggregationService.js";
import { generateWeeklyReport } from "@/services/patternEngine.js";
import enableCors from "@/lib/cors.js";
import { trackServerEvent } from "@/services/analyticsService.js";
import { captureServerError } from "@/services/monitoringService.js";
import { getStoredWeeklyInsight, getStoredLlmInsight } from "@/services/reportStore.js";
import { runGenerateWeeklyReports } from "@/jobs/generateWeeklyReports.js";
import { sendError, sendSuccess } from "@/services/response.js";
import { getBearerToken } from "@/services/security.js";
import { validateSession } from "@/services/authService.js";
import { checkFeatureAccess, isPremiumActive } from "@/services/premiumService.js";

export default async function handler(req, res) {
  if (enableCors(req, res)) {
    return;
  }

  if (req.method !== "GET") {
    return sendError(res, 405, "METHOD_NOT_ALLOWED", "Only GET is supported");
  }

  try {
    if (req.query.mode === "scheduled") {
      const results = await runGenerateWeeklyReports();
      return sendSuccess(res, {
        generated: results.filter((entry) => entry.report).length,
        skipped: results.filter((entry) => entry.skipped).length,
        results,
      });
    }

    const token = getBearerToken(req);
    const user = token ? await validateSession(token) : null;
    const ownerId = user?.id || req.query.deviceId;

    if (!ownerId) {
      return sendError(res, 400, "MISSING_OWNER", "deviceId is required when unauthenticated");
    }

    const [aggregates, aiInsight] = await Promise.all([
      getWeeklyAggregates(ownerId),
      getStoredWeeklyInsight(ownerId),
    ]);

    const isAuthenticated = Boolean(user);
    const canViewRuleBased = await checkFeatureAccess(ownerId, "aiWeeklySummary", { isAuthenticated });
    const hasPremium = isAuthenticated ? await isPremiumActive(ownerId) : false;
    const report = generateWeeklyReport({ aggregates, aiInsight: canViewRuleBased ? aiInsight : null });

    // Attach LLM insight for premium users
    if (hasPremium) {
      const llmInsight = await getStoredLlmInsight(ownerId);
      if (llmInsight) {
        report.llmInsight = llmInsight;
      }
    }

    if (report.totalMoments >= 3) {
      if (!isAuthenticated) {
        // Anonymous → prompt sign-in for free rule-based insights
        report.aiPreview = {
          available: true,
          teaser: "Sign in with Google to unlock your pattern insights — free for all accounts.",
          action: "sign-in",
        };
      } else if (!hasPremium) {
        // Signed-in free → tease upcoming LLM personalized insight
        report.llmPreview = {
          available: false,
          teaser: "Personalized AI insights are coming soon. Upgrade to Premium to be first in line.",
          action: "upgrade",
        };
      }
    }

    await trackServerEvent("weekly_report_viewed", ownerId, { totalMoments: report.totalMoments });

    return sendSuccess(res, { report });
  } catch (error) {
    captureServerError(error, { route: "weeklyReport" });
    return sendError(res, 500, "REPORT_FAILED", "Unable to build weekly report");
  }
}