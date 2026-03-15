import { exportMoments } from "@/services/momentService.js";
import enableCors from "@/lib/cors.js";
import { captureServerError } from "@/services/monitoringService.js";
import { sendError } from "@/services/response.js";
import { getBearerToken } from "@/services/security.js";
import { validateSession } from "@/services/authService.js";

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

    const moments = await exportMoments(ownerId);
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", "attachment; filename=triggermap-export.json");
    return res.status(200).send(JSON.stringify({ exportedAt: new Date().toISOString(), moments }, null, 2));
  } catch (error) {
    captureServerError(error, { route: "export" });
    return sendError(res, 500, "EXPORT_FAILED", "Unable to export logs");
  }
}