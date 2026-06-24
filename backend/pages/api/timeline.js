import { getTimeline } from "@/services/momentService.js";
import enableCors from "@/lib/cors.js";
import { captureServerError } from "@/services/monitoringService.js";
import { sendError, sendSuccess } from "@/services/response.js";
import { getBearerToken } from "@/services/security.js";
import { validateSession } from "@/services/authService.js";
import { recoverDeviceIfNeeded } from "@/services/dataMigration.js";

function groupMomentsByDay(moments) {
  return moments.reduce((accumulator, moment) => {
    const day = new Date(moment.timestamp).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      weekday: "long",
    });
    accumulator[day] = accumulator[day] || [];
    accumulator[day].push(moment);
    return accumulator;
  }, {});
}

export default async function handler(req, res) {
  if (enableCors(req, res)) {
    return;
  }

  if (req.method !== "GET") {
    return sendError(res, 405, "METHOD_NOT_ALLOWED", "Only GET is supported");
  }

  try {
    const token = getBearerToken(req);
    const user = token ? await validateSession(token) : null;
    const ownerId = user?.id || req.query.deviceId;

    if (!ownerId) {
      return sendError(res, 400, "MISSING_OWNER", "deviceId is required when unauthenticated");
    }

    // Self-healing recovery: if this device updated from a signed-in build, copy
    // its stranded account data back onto the deviceId (once). No-op afterwards.
    if (!user) {
      await recoverDeviceIfNeeded(ownerId).catch(() => null);
    }

    const moments = await getTimeline(ownerId);
    res.setHeader("Cache-Control", "private, no-cache, no-store, must-revalidate");
    return sendSuccess(res, {
      moments,
      grouped: groupMomentsByDay(moments),
    });
  } catch (error) {
    captureServerError(error, { route: "timeline" });
    return sendError(res, 500, "TIMELINE_FAILED", "Unable to load timeline");
  }
}