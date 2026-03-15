import { hasAccess } from "@triggermap/shared/constants/premium";
import { getSubscription } from "./authService.js";

export async function getSubscriptionStatus(userId) {
  if (!userId) {
    return "none";
  }

  const subscription = await getSubscription(userId);
  return subscription?.status || "none";
}

export async function checkFeatureAccess(userId, featureKey, { isAuthenticated = false } = {}) {
  const status = await getSubscriptionStatus(userId);
  return hasAccess(featureKey, status, isAuthenticated);
}

export async function isPremiumActive(userId) {
  const status = await getSubscriptionStatus(userId);
  return status === "active" || status === "grace_period";
}
