import { getWeeklyAggregates } from "@/services/aggregationService.js";
import { generateWeeklyReport } from "@/services/patternEngine.js";
import { generateInsight } from "@/ai/generateInsight.js";
import enableCors from "@/lib/cors.js";
import { trackServerEvent } from "@/services/analyticsService.js";
import { captureServerError } from "@/services/monitoringService.js";
import { getStoredLlmInsight } from "@/services/reportStore.js";
import { runGenerateWeeklyReports } from "@/jobs/generateWeeklyReports.js";
import { sendError, sendSuccess } from "@/services/response.js";
import { getBearerToken } from "@/services/security.js";
import { validateSession, isFirstAiFreeAvailable, markFirstAiFreeUsed } from "@/services/authService.js";
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

    const aggregates = await getWeeklyAggregates(ownerId);

    const isAuthenticated = Boolean(user);
    const canViewRuleBased = await checkFeatureAccess(ownerId, "aiWeeklySummary", { isAuthenticated });
    const hasPremium = isAuthenticated ? await isPremiumActive(ownerId) : false;

    // Always compute the rule-based insight from fresh aggregate data
    // so the summary text matches the live charts.
    const report = generateWeeklyReport({ aggregates });
    if (canViewRuleBased && report.totalMoments) {
      report.aiInsight = await generateInsight(report);
    }

    // Attach LLM insight for premium users OR first-free eligible users
    // For Strava-style gating: non-premium see a truncated teaser
    const firstFreeAvailable = isAuthenticated && !hasPremium ? await isFirstAiFreeAvailable(ownerId) : false;
    const llmInsight = await getStoredLlmInsight(ownerId);
    if (llmInsight) {
      if (hasPremium || firstFreeAvailable) {
        report.llmInsight = llmInsight;
        if (firstFreeAvailable) {
          report.llmInsight.firstFree = true;
          await markFirstAiFreeUsed(ownerId);
        }
      } else if (isAuthenticated) {
        // Teaser: extract first section ("What stood out") for curiosity-driven preview
        const narrative = llmInsight.narrative || "";
        const headerRe = /(?:what stood out|what may be contributing|one thing to try)/gi;
        const hits = [];
        let hm;
        while ((hm = headerRe.exec(narrative)) !== null) hits.push(hm.index);
        // Take text between first and second header, or first 2 sentences
        let teaser;
        if (hits.length >= 2) {
          teaser = narrative.slice(hits[0], hits[1]).replace(/^what stood out[:\s-]*/i, "").trim();
        } else {
          const sentences = narrative.split(/(?<=[.!?])\s+/).filter(Boolean);
          teaser = sentences.slice(0, 2).join(" ");
        }
        report.llmTeaser = {
          narrative: teaser,
          truncated: true,
          model: llmInsight.model,
          generatedAt: llmInsight.generatedAt,
        };
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