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

    if (error.message?.includes("not configured")) {
      return sendError(res, 503, "SUBSCRIPTION_UNAVAILABLE", "Your transaction cannot be completed. Please try again later.");
    }

    // Google API verification failed but user has a purchase token — grant grace period
    // so they get immediate access while API permissions are resolved
    try {
      const user = await validateSession(getBearerToken(req));
      const parsed = schema.safeParse(req.body);
      if (user && parsed.success) {
        const fallback = await grantGracePeriodFallback({
          userId: user.id,
          subscriptionId: parsed.data.subscriptionId,
          purchaseToken: parsed.data.purchaseToken,
        });
        captureServerError(new Error(`Subscription granted via fallback — Google API failed: ${error.message}`), {
          route: "subscriptionVerify",
          userId: user.id,
          fallback: true,
        });
        await trackServerEvent("subscription_started", user.id, { ...fallback, fallback: true });
        return sendSuccess(res, { subscription: fallback });
      }
    } catch (fallbackErr) {
      captureServerError(fallbackErr, { route: "subscriptionVerify", phase: "fallback" });
    }

    return sendError(res, 500, "SUBSCRIPTION_VERIFY_FAILED", "Unable to verify subscription");
  }
}