import { z } from "zod";
import { appendMoment, createMomentPayload } from "@/services/momentService.js";
import enableCors from "@/lib/cors.js";
import { trackServerEvent } from "@/services/analyticsService.js";
import { generateImmediateFeedback } from "@/services/feedbackService.js";
import { captureServerError } from "@/services/monitoringService.js";
import { enforceRateLimit, incrementCounter, touchDailyActive } from "@/services/rateLimitService.js";
import { redis, redisKey } from "@/services/redisClient.js";
import { sendError, sendSuccess } from "@/services/response.js";
import { getBearerToken, getClientIp } from "@/services/security.js";
import { validateSession } from "@/services/authService.js";
import { getWeeklyAggregates } from "@/services/aggregationService.js";
import { generateWeeklyReport } from "@/services/patternEngine.js";
import { generateInsight } from "@/ai/generateInsight.js";
import { storeWeeklyInsight } from "@/services/reportStore.js";
import { generateRuleBasedModeOutput } from "@/ai/modeComposer.js";
import { getStoredModeOutput } from "@/services/modeStore.js";
import { isRuleBasedModeOutput } from "@/services/modeFeedbackState.js";

const schema = z.object({
  deviceId: z.string().min(1).optional(),
  momentId: z.string().uuid().optional(),
  trigger: z.string().min(1).optional(),
  emotion: z.string().min(1).optional(),
  valence: z.number().min(-1).max(1).optional(),
  arousal: z.number().min(-1).max(1).optional(),
  emotionPoint: z.object({
    valence: z.number().min(-1).max(1).optional(),
    arousal: z.number().min(-1).max(1).optional(),
    x: z.number().min(-1).max(1).optional(),
    y: z.number().min(-1).max(1).optional(),
  }).optional(),
  emotionLabel: z.string().min(1).max(80).optional(),
  emotionSubtitle: z.string().min(1).max(120).optional(),
  emotionQuadrant: z.string().min(1).max(80).optional(),
  emotionIntensity: z.string().min(1).max(40).optional(),
  intensity: z.number().min(0).max(1).optional(),
  note: z.string().max(280).optional(),
  notes: z.string().max(280).optional(),
  occurredAt: z.string().optional(),
  timestamp: z.string().optional(),
  tags: z.array(z.string().min(1).max(40)).max(3).optional(),
  contributionTags: z.array(z.string().min(1).max(60)).max(6).optional(),
  contributionTagMeta: z.array(z.object({
    id: z.string().min(1).max(80),
    label: z.string().min(1).max(60),
    family: z.string().min(1).max(40),
    quadrant: z.string().min(1).max(80).optional(),
    intensityBand: z.string().min(1).max(40).optional(),
    source: z.enum(["dynamic-emotion-map", "user-added", "legacy"]).optional(),
  })).max(6).optional(),
  lang: z.enum(["en", "hi"]).optional(),
});

async function refreshWeeklyInsight(ownerId, lang) {
  const aggregates = await getWeeklyAggregates(ownerId);
  const report = generateWeeklyReport({ aggregates });
  if (!report.totalMoments) return;
  const insight = await generateInsight(report, { lang });
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

  await Promise.all(["move", "fuel"].map(async (mode) => {
    const existing = await getStoredModeOutput(ownerId, mode).catch(() => null);
    if (existing && !isRuleBasedModeOutput(existing)) return;
    await generateRuleBasedModeOutput({
      ownerId,
      mode,
      lang,
      persist: true,
      reason: "moment_logged",
    });
  }));
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
      id: result.data.momentId,
      trigger: result.data.trigger,
      emotion: result.data.emotion,
      valence: result.data.valence ?? result.data.emotionPoint?.valence ?? result.data.emotionPoint?.x,
      arousal: result.data.arousal ?? result.data.emotionPoint?.arousal ?? result.data.emotionPoint?.y,
      intensity: result.data.intensity,
      emotionPoint: result.data.emotionPoint,
      emotionLabel: result.data.emotionLabel,
      emotionSubtitle: result.data.emotionSubtitle,
      emotionQuadrant: result.data.emotionQuadrant,
      emotionIntensity: result.data.emotionIntensity,
      note: result.data.notes ?? result.data.note,
      occurredAt: result.data.timestamp ?? result.data.occurredAt,
      isAnonymous: !user,
      tags: result.data.tags,
      contributionTags: result.data.contributionTags,
      contributionTagMeta: result.data.contributionTagMeta,
    });

    await appendMoment(moment);

    // Ensure anonymous owners have a user hash with createdAt for ops tracking
    if (!user) {
      await redis(["HSETNX", redisKey("user", ownerId), "createdAt", new Date().toISOString()]);
    }

    const feedback = await generateImmediateFeedback(ownerId, moment, result.data.lang);
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
    refreshWeeklyInsight(ownerId, result.data.lang).catch(() => {});

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
