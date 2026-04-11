import enableCors from "@/lib/cors.js";
import { sendError, sendSuccess } from "@/services/response.js";
import { getBearerToken } from "@/services/security.js";
import { validateSession, getSubscription } from "@/services/authService.js";
import { generateAllModes } from "@/ai/modeComposer.js";
import { STYLE_IDS } from "@/ai/styleProfiles.js";
import { captureServerError } from "@/services/monitoringService.js";
import { enforceRateLimit } from "@/services/rateLimitService.js";

const ALLOWED_MODELS = ["phi3", "mistral", "llama3", "llama2", "gemma", "gemma4", "qwen2"];

/**
 * POST /api/modes/regenerate
 * Body: { lang?, model?, maxWords?, style? }
 * Regenerates all three adaptive modes for the authenticated premium user.
 */
export default async function handler(req, res) {
  if (enableCors(req, res)) return;

  if (req.method !== "POST") {
    return sendError(res, 405, "METHOD_NOT_ALLOWED", "POST only");
  }

  try {
    const token = getBearerToken(req);
    const user = token ? await validateSession(token).catch(() => null) : null;
    if (!user) {
      return sendError(res, 401, "AUTH_REQUIRED", "Sign in required");
    }

    const sub = await getSubscription(user.id);
    if (sub?.status !== "active" && sub?.status !== "grace_period") {
      return sendError(res, 403, "PREMIUM_REQUIRED", "Premium subscription required");
    }

    // Rate limit: max 3 regenerations per hour
    const allowed = await enforceRateLimit(`regen:${user.id}`, 3, 3600);
    if (!allowed) {
      return sendError(res, 429, "RATE_LIMITED", "Too many regenerations. Try again later.");
    }

    const { lang, model, maxWords, style } = req.body || {};

    const safeLang = (typeof lang === "string" && ["en", "hi"].includes(lang)) ? lang : "en";
    const safeModel = (typeof model === "string" && ALLOWED_MODELS.includes(model)) ? model : undefined;
    const safeMaxWords = (typeof maxWords === "number" && maxWords >= 50 && maxWords <= 300) ? maxWords : 100;
    const safeStyle = (typeof style === "string" && STYLE_IDS.includes(style)) ? style : undefined;

    const results = await generateAllModes({
      ownerId: user.id,
      lang: safeLang,
      model: safeModel,
      maxWords: safeMaxWords,
      style: safeStyle,
    });

    return sendSuccess(res, results);
  } catch (error) {
    captureServerError(error, { path: "/api/modes/regenerate" });
    return sendError(res, 500, "INTERNAL_ERROR", "Regeneration failed");
  }
}
