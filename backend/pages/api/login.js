import { z } from "zod";
import { loginEmailUser, loginGoogleUser, createSession, linkDeviceToUser } from "@/services/authService.js";
import enableCors from "@/lib/cors.js";
import { migrateMoments } from "@/services/momentService.js";
import { trackServerEvent } from "@/services/analyticsService.js";
import { captureServerError } from "@/services/monitoringService.js";
import { enforceRateLimit } from "@/services/rateLimitService.js";
import { sendError, sendSuccess } from "@/services/response.js";
import { getClientIp } from "@/services/security.js";

// NOTE: The mobile app no longer ships sign-in (it is fully device-based). This
// route is kept FUNCTIONAL — not disabled — so that already-installed older app
// builds (the live app) can still authenticate during rollout. It can be retired
// once the device-only build is fully adopted.
const schema = z.discriminatedUnion("provider", [
  z.object({
    provider: z.literal("email"),
    email: z.string().email(),
    password: z.string().min(8),
    deviceId: z.string().optional(),
  }),
  z.object({
    provider: z.literal("google"),
    idToken: z.string().min(1),
    deviceId: z.string().optional(),
  }),
]);

export default async function handler(req, res) {
  if (enableCors(req, res)) {
    return;
  }

  if (req.method !== "POST") {
    return sendError(res, 405, "METHOD_NOT_ALLOWED", "Only POST is supported");
  }

  try {
    const allowed = await enforceRateLimit(`login:${getClientIp(req)}`, 20, 60);
    if (!allowed) {
      return sendError(res, 429, "RATE_LIMITED", "Too many login attempts");
    }

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 400, "INVALID_INPUT", "Request body is invalid", parsed.error.flatten());
    }

    const user = parsed.data.provider === "email"
      ? await loginEmailUser(parsed.data)
      : await loginGoogleUser(parsed.data);

    const [tokenResult, migration] = await Promise.all([
      createSession(user),
      migrateMoments(parsed.data.deviceId, user.id),
    ]);
    // Correlate this device with the account (cross-device sync, premium restore, ops)
    linkDeviceToUser(parsed.data.deviceId, user.id).catch(() => {});
    // Fire-and-forget analytics
    trackServerEvent("login_completed", user.id, { provider: parsed.data.provider, migrated: migration.migrated }).catch(() => {});

    return sendSuccess(res, {
      token: tokenResult,
      user,
      migratedMoments: migration.migrated,
    });
  } catch (error) {
    captureServerError(error, { route: "login" });

    if (error.message === "INVALID_CREDENTIALS" || error.message === "INVALID_GOOGLE_TOKEN") {
      return sendError(res, 401, error.message, "Authentication failed");
    }

    if (error.message === "GOOGLE_AUTH_NOT_CONFIGURED") {
      return sendError(res, 503, error.message, "Google login is not configured on the server");
    }

    return sendError(res, 500, "LOGIN_FAILED", "Unable to sign in");
  }
}
