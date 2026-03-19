import { hasAccess } from "@triggermap/shared/constants/premium";
import { getSubscription } from "./authService.js";

export async function getSubscriptionStatus(userId, preloadedSubscription) {
  if (!userId) {
    return "none";
  }

  const subscription = preloadedSubscription ?? await getSubscription(userId);
  return subscription?.status || "none";
}

export async function checkFeatureAccess(userId, featureKey, { isAuthenticated = false, subscription } = {}) {
  const status = await getSubscriptionStatus(userId, subscription);
  return hasAccess(featureKey, status, isAuthenticated);
}

export async function isPremiumActive(userId, preloadedSubscription) {
  const status = await getSubscriptionStatus(userId, preloadedSubscription);
  return status === "active" || status === "grace_period";
}
