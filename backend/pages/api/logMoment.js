import { z } from "zod";
import { appendMoment, createMomentPayload } from "@/services/momentService.js";
import enableCors from "@/lib/cors.js";
import { trackServerEvent } from "@/services/analyticsService.js";
import { generateImmediateFeedback } from "@/services/feedbackService.js";
import { captureServerError } from "@/services/monitoringService.js";
import { enforceRateLimit, incrementCounter, touchDailyActive } from "@/services/rateLimitService.js";
import { sendError, sendSuccess } from "@/services/response.js";
import { getBearerToken, getClientIp } from "@/services/security.js";
import { validateSession } from "@/services/authService.js";
import { getWeeklyAggregates } from "@/services/aggregationService.js";
import { generateWeeklyReport } from "@/services/patternEngine.js";
import { generateInsight } from "@/ai/generateInsight.js";
import { storeWeeklyInsight } from "@/services/reportStore.js";

const schema = z.object({
  deviceId: z.string().min(1).optional(),
  trigger: z.string().min(1).optional(),
  emotion: z.string().min(1),
  note: z.string().max(280).optional(),
  notes: z.string().max(280).optional(),
  occurredAt: z.string().optional(),
  timestamp: z.string().optional(),
  prediction: z.string().min(1).max(30).optional(),
  tags: z.array(z.string().min(1).max(40)).max(3).optional(),
});

async function refreshWeeklyInsight(ownerId) {
  const aggregates = await getWeeklyAggregates(ownerId);
  const report = generateWeeklyReport({ aggregates });
  if (!report.totalMoments) return;
  const insight = await generateInsight(report);
  await storeWeeklyInsight(ownerId, {
    windowEnd: new Date().toISOString().slice(0, 10),
    summary: insight.summary,
    microExperiment: insight.microExperiment || null,
    whatWorking: insight.whatWorking || null,
    whereToFocus: insight.whereToFocus || null,
    stateOfMind: insight.stateOfMind || null,
    baselineSummary: insight.baselineSummary || null,
    confidence: insight.confidence,
    model: insight.model,
    generatedAt: insight.generatedAt,
  });
}

export default async function handler(req, res) {
  if (enableCors(req, res)) {
    return;
  }

  if (req.method !== "POST") {
    return sendError(res, 405, "METHOD_NOT_ALLOWED", "Only POST is supported");
  }

  try {
    const allowed = await enforceRateLimit(`log:${getClientIp(req)}`, 120, 60);
    if (!allowed) {
      return sendError(res, 429, "RATE_LIMITED", "Too many logging requests");
    }

    const result = schema.safeParse(req.body);
    if (!result.success) {
      return sendError(res, 400, "INVALID_INPUT", "Request body is invalid", result.error.flatten());
    }

    const token = getBearerToken(req);
    const user = token ? await validateSession(token) : null;
    const ownerId = user?.id || result.data.deviceId;
    if (!ownerId) {
      return sendError(res, 400, "MISSING_OWNER", "deviceId is required for anonymous logging");
    }

    const moment = createMomentPayload({
      ownerId,
      trigger: result.data.trigger,
      emotion: result.data.emotion,
      note: result.data.notes ?? result.data.note,
      occurredAt: result.data.timestamp ?? result.data.occurredAt,
      isAnonymous: !user,
      prediction: result.data.prediction,
      tags: result.data.tags,
    });

    await appendMoment(moment);
    const feedback = await generateImmediateFeedback(ownerId, moment);
    await Promise.all([
      touchDailyActive(ownerId),
      incrementCounter("moment_logged"),
      trackServerEvent("moment_logged", ownerId, {
        trigger: moment.trigger,
        emotion: moment.emotion,
        isAnonymous: moment.isAnonymous,
      }),
    ]);

    // Fire-and-forget: regenerate rule-based weekly insight so report is fresh
    refreshWeeklyInsight(ownerId).catch(() => {});

    return sendSuccess(res, {
      moment,
      patternFeedback: feedback.patternFeedback,
      smartReflectionPrompt: feedback.smartReflectionPrompt,
      pairCount: feedback.pairCount,
    }, 201);
  } catch (error) {
    captureServerError(error, { route: "logMoment" });
    return sendError(res, 500, "LOG_MOMENT_FAILED", "Unable to save moment");
  }
}