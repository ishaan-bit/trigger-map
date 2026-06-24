import { z } from "zod";
import { getMomentById, updateMoment, deleteMoment } from "@/services/momentService.js";
import enableCors from "@/lib/cors.js";
import { decrementDailyAggregate, repairAggregateForEdit } from "@/services/aggregationService.js";
import { trackServerEvent } from "@/services/analyticsService.js";
import { captureServerError } from "@/services/monitoringService.js";
import { enforceRateLimit } from "@/services/rateLimitService.js";
import { sendError, sendSuccess } from "@/services/response.js";
import { getBearerToken, getClientIp } from "@/services/security.js";
import { validateSession } from "@/services/authService.js";

const editSchema = z.object({
  trigger: z.string().min(1).optional(),
  emotion: z.string().min(1).optional(),
  note: z.string().max(280).optional(),
  deviceId: z.string().optional(),
});

export default async function handler(req, res) {
  const { id: momentId } = req.query;

  if (enableCors(req, res)) {
    return;
  }

  if (!momentId) {
    return sendError(res, 400, "MISSING_ID", "Moment ID is required");
  }

  try {
    // Device-based identity: token optional, fall back to deviceId (body for PUT, query for DELETE).
    const token = getBearerToken(req);
    const user = token ? await validateSession(token).catch(() => null) : null;
    const ownerId = user?.id || req.body?.deviceId || req.query.deviceId;
    if (!ownerId) {
      return sendError(res, 400, "MISSING_OWNER", "deviceId is required");
    }

    if (req.method === "PUT") {
      const allowed = await enforceRateLimit(`edit:${getClientIp(req)}`, 60, 60);
      if (!allowed) {
        return sendError(res, 429, "RATE_LIMITED", "Too many edit requests");
      }

      const result = editSchema.safeParse(req.body);
      if (!result.success) {
        return sendError(res, 400, "INVALID_INPUT", "Request body is invalid", result.error.flatten());
      }

      const editResult = await updateMoment(ownerId, momentId, result.data);
      if (!editResult) {
        return sendError(res, 404, "NOT_FOUND", "Moment not found");
      }

      await repairAggregateForEdit(editResult.original, editResult.updated);
      await trackServerEvent("moment_edited", ownerId, { momentId });

      return sendSuccess(res, { moment: editResult.updated });
    }

    if (req.method === "DELETE") {
      const allowed = await enforceRateLimit(`delete:${getClientIp(req)}`, 30, 60);
      if (!allowed) {
        return sendError(res, 429, "RATE_LIMITED", "Too many delete requests");
      }

      const removed = await deleteMoment(ownerId, momentId);
      if (!removed) {
        return sendError(res, 404, "NOT_FOUND", "Moment not found");
      }

      await decrementDailyAggregate(removed);
      await trackServerEvent("moment_deleted", ownerId, { momentId });

      return sendSuccess(res, { deleted: true });
    }

    return sendError(res, 405, "METHOD_NOT_ALLOWED", "Only PUT and DELETE are supported");
  } catch (error) {
    captureServerError(error, { route: "moment/[id]", momentId });
    return sendError(res, 500, "MOMENT_UPDATE_FAILED", "Unable to update moment");
  }
}
