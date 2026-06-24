import { z } from "zod";
import { createSession, registerEmailUser, linkDeviceToUser } from "@/services/authService.js";
import enableCors from "@/lib/cors.js";
import { migrateMoments } from "@/services/momentService.js";
import { trackServerEvent } from "@/services/analyticsService.js";
import { captureServerError } from "@/services/monitoringService.js";
import { enforceRateLimit } from "@/services/rateLimitService.js";
import { sendError, sendSuccess } from "@/services/response.js";
import { sanitizeText, getClientIp } from "@/services/security.js";

// NOTE: Kept FUNCTIONAL (not disabled) so already-installed older app builds (the
// live app) can still create accounts during rollout. The device-only build does
// not call this; it can be retired once the old builds age out.
const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2).max(80),
  deviceId: z.string().optional(),
});

export default async function handler(req, res) {
  if (enableCors(req, res)) {
    return;
  }

  if (req.method !== "POST") {
    return sendError(res, 405, "METHOD_NOT_ALLOWED", "Only POST is supported");
  }

  try {
    const allowed = await enforceRateLimit(`register:${getClientIp(req)}`, 10, 60);
    if (!allowed) {
      return sendError(res, 429, "RATE_LIMITED", "Too many registration attempts");
    }

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 400, "INVALID_INPUT", "Request body is invalid", parsed.error.flatten());
    }

    const user = await registerEmailUser({
      ...parsed.data,
      name: sanitizeText(parsed.data.name),
    });
    const token = await createSession(user);
    const migration = await migrateMoments(parsed.data.deviceId, user.id);
    // Correlate this device with the account (cross-device sync, premium restore, ops)
    linkDeviceToUser(parsed.data.deviceId, user.id).catch(() => {});

    await trackServerEvent("register_completed", user.id, { migrated: migration.migrated });

    return sendSuccess(res, {
      token,
      user,
      migratedMoments: migration.migrated,
    }, 201);
  } catch (error) {
    captureServerError(error, { route: "register" });

    if (error.message === "EMAIL_EXISTS") {
      return sendError(res, 409, "EMAIL_EXISTS", "An account with this email already exists");
    }

    return sendError(res, 500, "REGISTER_FAILED", "Unable to create account");
  }
}
