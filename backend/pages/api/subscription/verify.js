import { z } from "zod";
import enableCors from "@/lib/cors.js";
import { validateSession } from "@/services/authService.js";
import { trackServerEvent } from "@/services/analyticsService.js";
import { captureServerError } from "@/services/monitoringService.js";
import { sendError, sendSuccess } from "@/services/response.js";
import { getBearerToken } from "@/services/security.js";
import { verifyAndStoreSubscription } from "@/services/subscriptionService.js";

const schema = z.object({
  subscriptionId: z.string().min(1),
  purchaseToken: z.string().min(1),
});

export default async function handler(req, res) {
  if (enableCors(req, res)) {
    return;
  }

  if (req.method !== "POST") {
    return sendError(res, 405, "METHOD_NOT_ALLOWED", "Only POST is supported");
  }

  try {
    const token = getBearerToken(req);
    if (!token) {
      return sendError(res, 401, "UNAUTHORIZED", "Authentication required");
    }

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 400, "INVALID_INPUT", "Request body is invalid", parsed.error.flatten());
    }

    const user = await validateSession(token);
    const subscription = await verifyAndStoreSubscription({
      userId: user.id,
      subscriptionId: parsed.data.subscriptionId,
      purchaseToken: parsed.data.purchaseToken,
    });

    await trackServerEvent(
      subscription.status === "active" ? "subscription_started" : "subscription_cancelled",
      user.id,
      subscription
    );

    return sendSuccess(res, { subscription });
  } catch (error) {
    captureServerError(error, { route: "subscriptionVerify" });
    return sendError(res, 500, "SUBSCRIPTION_VERIFY_FAILED", "Unable to verify subscription");
  }
}