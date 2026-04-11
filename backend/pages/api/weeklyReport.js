import { getWeeklyAggregates } from "@/services/aggregationService.js";
import { generateWeeklyReport } from "@/services/patternEngine.js";
import { generateInsight } from "@/ai/generateInsight.js";
import { generateActions } from "@/services/actionEngine.js";
import { sanitizeDeep } from "@/utils/sanitizeOutput.js";
import { phraseText, extractFirstName } from "@/utils/phrasingLayer.js";
import enableCors from "@/lib/cors.js";
import { trackServerEvent } from "@/services/analyticsService.js";
import { captureServerError } from "@/services/monitoringService.js";
import { getStoredWeeklyInsight, getStoredLlmInsight, hasFreePass, getActionFeedback, getActionPrefs, getLlmInsightHistory } from "@/services/reportStore.js";
import { runGenerateWeeklyReports } from "@/jobs/generateWeeklyReports.js";
import { sendError, sendSuccess } from "@/services/response.js";
import { getBearerToken } from "@/services/security.js";
import { validateSession, getSubscription, isFirstAiFreeAvailable, markFirstAiFreeUsed } from "@/services/authService.js";
import { checkFeatureAccess } from "@/services/premiumService.js";
import { getTimeline } from "@/services/momentService.js";

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
    const user = token ? await validateSession(token).catch(() => null) : null;
    const ownerId = user?.id || req.query.deviceId;
    const lang = req.query.lang || "en";

    if (!ownerId) {
      return sendError(res, 400, "MISSING_OWNER", "deviceId is required when unauthenticated");
    }

    const isAuthenticated = Boolean(user);

    // Parallel fetch: aggregates (7d + 45d), moments, subscription, LLM insight, stored report, first-free check, free pass, action feedback
    const [aggregates, allAggregates, allMoments, subscription, llmInsight, storedReport, firstFreeAvailable, freePass, actionFeedback, actionPrefs, insightHistory] = await Promise.all([
      getWeeklyAggregates(ownerId),
      getWeeklyAggregates(ownerId, 45),
      getTimeline(ownerId),
      isAuthenticated ? getSubscription(ownerId) : Promise.resolve(null),
      getStoredLlmInsight(ownerId),
      getStoredWeeklyInsight(ownerId),
      isAuthenticated ? isFirstAiFreeAvailable(ownerId) : Promise.resolve(false),
      isAuthenticated ? hasFreePass(ownerId) : Promise.resolve(false),
      getActionFeedback(ownerId),
      getActionPrefs(ownerId),
      isAuthenticated ? getLlmInsightHistory(ownerId) : Promise.resolve([]),
    ]);

    // Filter moments to last 7 days for invoked metrics computation
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    let recentMoments = (allMoments || []).filter(m => m.timestamp >= sevenDaysAgo);

    // ── Silence detection ──────────────────────────────────────────────
    // If the user has historical data but nothing in the last 7 days,
    // slide the data window to their last active period so insights,
    // actions, and premium sections stay populated instead of vanishing.
    const lifetimeMoments = (allMoments || []).length;
    const lastMomentTimestamp = allMoments?.[0]?.timestamp; // sorted DESC by momentService
    const daysSinceLastLog = lastMomentTimestamp
      ? Math.floor((Date.now() - new Date(lastMomentTimestamp).getTime()) / 86400000)
      : null;
    const isSilent = recentMoments.length === 0 && lifetimeMoments >= 3 && daysSinceLastLog >= 1;

    let silenceWindow = null;
    let effectiveAggregates = aggregates;
    let effectivePreviousAggregates;

    if (isSilent) {
      silenceWindow = {
        isSilent: true,
        daysSinceLastLog,
        lastLogDate: new Date(lastMomentTimestamp).toISOString().slice(0, 10),
        totalLifetimeMoments: lifetimeMoments,
      };

      // Slide aggregate window: use the most recent 7 days that had data
      const activeDays = allAggregates.filter(a => Number(a.total || 0) > 0);
      effectiveAggregates = activeDays.slice(-7);

      // Recompute previous aggregates relative to the last active window
      const lastActiveDate = effectiveAggregates[0]?.date;
      if (lastActiveDate && activeDays.length > 7) {
        effectivePreviousAggregates = activeDays.slice(-14, -7);
      } else {
        effectivePreviousAggregates = null;
      }

      // Recompute recentMoments to match the last active window
      if (effectiveAggregates.length) {
        const windowStart = effectiveAggregates[0].date;
        const windowEnd = effectiveAggregates[effectiveAggregates.length - 1].date;
        recentMoments = (allMoments || []).filter(m => {
          const d = new Date(m.timestamp).toISOString().slice(0, 10);
          return d >= windowStart && d <= windowEnd;
        });
      }

      console.log(`[weeklyReport] ${ownerId.slice(0, 8)}: SILENCE detected — ${daysSinceLastLog}d since last log, sliding to ${effectiveAggregates.length} active days`);
    } else {
      effectivePreviousAggregates = allAggregates.length >= 14 ? allAggregates.slice(-14, -7) : null;
    }

    const hasPremium = subscription?.status === "active" || subscription?.status === "grace_period";
    const canViewRuleBased = await checkFeatureAccess(ownerId, "aiWeeklySummary", { isAuthenticated, subscription });

    // Always compute the rule-based insight from fresh aggregate data
    // so the summary text matches the live charts.
    // Pass allAggregates (45d) for baseline computation.
    const report = generateWeeklyReport({ aggregates: effectiveAggregates, allAggregates, previousAggregates: effectivePreviousAggregates, moments: recentMoments, silenceWindow });
    report.lifetimeMoments = (allMoments || []).length;
    console.log(`[weeklyReport] ${ownerId.slice(0, 8)}: moments=${recentMoments.length}, lifetime=${report.lifetimeMoments}, correlations=${Object.keys(report.correlations || {}).length}, invokedMetrics=${report.invokedMetrics != null}, compound=${report.compoundPatterns != null}`);
    const firstName = isAuthenticated ? extractFirstName(user?.name) : null;
    if (canViewRuleBased && (report.totalMoments || silenceWindow)) {
      report.aiInsight = await generateInsight(report, { firstName, lang });

      // Use LLM-rewritten summary if available (from rewriteSummaries job)
      if (report.aiInsight && storedReport?.rewrittenBy && storedReport.summary) {
        report.aiInsight.summary = storedReport.summary;
      }
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
        const headerRe = /(?:what stood out|what may be contributing|one thing to try|क्या ख़ास रहा|क्या कारण हो सकता है|एक बात आज़माएँ)/gi;
        const hits = [];
        let hm;
        while ((hm = headerRe.exec(narrative)) !== null) hits.push(hm.index);
        // Take text between first and second header, or first 2 sentences
        let teaser;
        if (hits.length >= 2) {
          teaser = narrative.slice(hits[0], hits[1]).replace(/^(?:what stood out|क्या ख़ास रहा)[:\s-]*/i, "").trim();
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

    // Attach insight history for premium / free-pass / first-free users
    if (insightHistory.length && (hasPremium || freePass || firstFreeAvailable)) {
      report.insightHistory = insightHistory;
    }

    if (report.totalMoments >= 3) {
      if (!isAuthenticated) {
        // Anonymous → prompt sign-in for free rule-based insights
        report.aiPreview = {
          available: true,
          teaser: lang === "hi"
            ? "Google से साइन इन करें और अपने पैटर्न इनसाइट्स अनलॉक करें - सभी अकाउंट्स के लिए मुफ़्त।"
            : "Sign in with Google to unlock your pattern insights, free for all accounts.",
          action: "sign-in",
        };
      } else if (!hasPremium) {
        // Signed-in free → tease upcoming LLM personalized insight
        report.llmPreview = {
          available: false,
          teaser: lang === "hi"
            ? "व्यक्तिगत AI इनसाइट्स जल्द आ रहे हैं। Premium में अपग्रेड करें।"
            : "Personalized AI insights are coming soon. Upgrade to Premium to be first in line.",
          action: "upgrade",
        };
      }
    }

    // Generate contextual actions from the report (feedback-aware)
    report.actions = generateActions(report, actionFeedback || [], actionPrefs, lang);
    report.actionFeedback = actionFeedback || [];

    // Attach silence metadata so the client can render a "welcome back" banner
    if (silenceWindow) {
      report.silenceWindow = silenceWindow;
    }

    // Local text polish on summary + action reasons (fast, no external API)
    // Skip English lint for Hindi — Hindi text is pre-composed
    if (lang !== "hi" && report.aiInsight?.summary) {
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