import { getWeeklyAggregates } from "@/services/aggregationService.js";
import { generateWeeklyReport } from "@/services/patternEngine.js";
import { generateInsight } from "@/ai/generateInsight.js";
import { generateActions } from "@/services/actionEngine.js";
import { sanitizeDeep } from "@/utils/sanitizeOutput.js";
import { phraseText, extractFirstName } from "@/utils/phrasingLayer.js";
import enableCors from "@/lib/cors.js";
import { trackServerEvent } from "@/services/analyticsService.js";
import { captureServerError } from "@/services/monitoringService.js";
import { getStoredLlmInsight, hasFreePass, getActionFeedback } from "@/services/reportStore.js";
import { runGenerateWeeklyReports } from "@/jobs/generateWeeklyReports.js";
import { sendError, sendSuccess } from "@/services/response.js";
import { getBearerToken } from "@/services/security.js";
import { validateSession, getSubscription, isFirstAiFreeAvailable, markFirstAiFreeUsed } from "@/services/authService.js";
import { checkFeatureAccess } from "@/services/premiumService.js";

export default async function handler(req, res) {
  if (enableCors(req, res)) {
    return;
  }

  if (req.method !== "GET") {
    return sendError(res, 405, "METHOD_NOT_ALLOWED", "Only GET is supported");
  }

  try {
    if (req.query.mode === "scheduled") {
      const output = await runGenerateWeeklyReports();
      return sendSuccess(res, output);
    }

    const token = getBearerToken(req);
    const user = token ? await validateSession(token) : null;
    const ownerId = user?.id || req.query.deviceId;

    if (!ownerId) {
      return sendError(res, 400, "MISSING_OWNER", "deviceId is required when unauthenticated");
    }

    const isAuthenticated = Boolean(user);

    // Parallel fetch: aggregates (7d + 45d), subscription, LLM insight, first-free check, free pass, action feedback
    const [aggregates, allAggregates, subscription, llmInsight, firstFreeAvailable, freePass, actionFeedback] = await Promise.all([
      getWeeklyAggregates(ownerId),
      getWeeklyAggregates(ownerId, 45),
      isAuthenticated ? getSubscription(ownerId) : Promise.resolve(null),
      getStoredLlmInsight(ownerId),
      isAuthenticated ? isFirstAiFreeAvailable(ownerId) : Promise.resolve(false),
      isAuthenticated ? hasFreePass(ownerId) : Promise.resolve(false),
      getActionFeedback(ownerId),
    ]);

    const hasPremium = subscription?.status === "active" || subscription?.status === "grace_period";
    const canViewRuleBased = await checkFeatureAccess(ownerId, "aiWeeklySummary", { isAuthenticated, subscription });

    // Previous week aggregates (days 8-14 ago) for delta comparison
    const previousAggregates = allAggregates.length >= 14 ? allAggregates.slice(-14, -7) : null;

    // Always compute the rule-based insight from fresh aggregate data
    // so the summary text matches the live charts.
    // Pass allAggregates (45d) for baseline computation.
    const report = generateWeeklyReport({ aggregates, allAggregates, previousAggregates });
    const firstName = isAuthenticated ? extractFirstName(user?.name) : null;
    if (canViewRuleBased && report.totalMoments) {
      report.aiInsight = await generateInsight(report, { firstName });
    }

    // Attach LLM insight for premium users, first-free eligible, OR free-pass holders
    // For Strava-style gating: non-premium see a truncated teaser
    if (llmInsight) {
      if (hasPremium || (firstFreeAvailable && !hasPremium)) {
        report.llmInsight = llmInsight;
        if (firstFreeAvailable && !hasPremium) {
          report.llmInsight.firstFree = true;
          markFirstAiFreeUsed(ownerId).catch(() => {});
        }
      } else if (freePass && !hasPremium) {
        // Free pass: show full insight (pass auto-expires via TTL)
        report.llmInsight = llmInsight;
        report.llmInsight.freePass = true;
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
          teaser: "Sign in with Google to unlock your pattern insights, free for all accounts.",
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

    // Generate contextual actions from the report
    report.actions = generateActions(report);
    report.actionFeedback = actionFeedback || [];

    // HF phrasing pass on summary + action reasons (1.5s timeout per call, degrades silently)
    if (report.aiInsight?.summary) {
      report.aiInsight.summary = await phraseText(report.aiInsight.summary, { firstName });
      for (const a of report.actions) {
        a.reason = await phraseText(a.reason, { firstName });
      }
    }

    // Strip internal model names from LLM output before sending to client
    if (report.llmInsight) delete report.llmInsight.model;
    if (report.llmTeaser) delete report.llmTeaser.model;

    // Fire-and-forget analytics — don't block the response
    trackServerEvent("weekly_report_viewed", ownerId, { totalMoments: report.totalMoments }).catch(() => {});

    res.setHeader("Cache-Control", "private, max-age=30, stale-while-revalidate=60");
    return sendSuccess(res, { report: sanitizeDeep(report) });
  } catch (error) {
    captureServerError(error, { route: "weeklyReport" });
    return sendError(res, 500, "REPORT_FAILED", "Unable to build weekly report");
  }
}