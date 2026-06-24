import { z } from "zod";
import enableCors from "@/lib/cors.js";
import { validateSession } from "@/services/authService.js";
import { trackServerEvent } from "@/services/analyticsService.js";
import { captureServerError } from "@/services/monitoringService.js";
import { sendError, sendSuccess } from "@/services/response.js";
import { getBearerToken } from "@/services/security.js";
import { verifyAndStoreSubscription, grantGracePeriodFallback } from "@/services/subscriptionService.js";

const schema = z.object({
  subscriptionId: z.string().min(1),
  purchaseToken: z.string().min(1),
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
    // Device-based identity: subscriptions are keyed by ownerId (deviceId when anonymous).
    const token = getBearerToken(req);
    const user = token ? await validateSession(token).catch(() => null) : null;

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 400, "INVALID_INPUT", "Request body is invalid", parsed.error.flatten());
    }

    const ownerId = user?.id || parsed.data.deviceId;
    if (!ownerId) {
      return sendError(res, 400, "MISSING_OWNER", "deviceId is required");
    }

    const subscription = await verifyAndStoreSubscription({
      userId: ownerId,
      subscriptionId: parsed.data.subscriptionId,
      purchaseToken: parsed.data.purchaseToken,
    });

    await trackServerEvent(
      subscription.status === "active" ? "subscription_started" : "subscription_cancelled",
      ownerId,
      subscription
    );

    return sendSuccess(res, { subscription });
  } catch (error) {
    captureServerError(error, { route: "subscriptionVerify" });

    if (error.message?.includes("not configured")) {
      return sendError(res, 503, "SUBSCRIPTION_UNAVAILABLE", "Your transaction cannot be completed. Please try again later.");
    }

    // Google API verification failed but user has a purchase token — grant grace period
    // so they get immediate access while API permissions are resolved
    try {
      const fbToken = getBearerToken(req);
      const fbUser = fbToken ? await validateSession(fbToken).catch(() => null) : null;
      const parsed = schema.safeParse(req.body);
      const ownerId = fbUser?.id || parsed.data?.deviceId;
      if (ownerId && parsed.success) {
        const fallback = await grantGracePeriodFallback({
          userId: ownerId,
          subscriptionId: parsed.data.subscriptionId,
          purchaseToken: parsed.data.purchaseToken,
        });
        captureServerError(new Error(`Subscription granted via fallback — Google API failed: ${error.message}`), {
          route: "subscriptionVerify",
          ownerId,
          fallback: true,
        });
        await trackServerEvent("subscription_started", ownerId, { ...fallback, fallback: true });
        return sendSuccess(res, { subscription: fallback });
      }
    } catch (fallbackErr) {
      captureServerError(fallbackErr, { route: "subscriptionVerify", phase: "fallback" });
    }

    return sendError(res, 500, "SUBSCRIPTION_VERIFY_FAILED", "Unable to verify subscription");
  }
}