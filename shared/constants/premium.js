/**
 * Premium entitlement matrix.
 *
 * Each key is a feature slug. The `tier` field defines who can access it.
 * - "free"    — available to everyone
 * - "signed"  — requires sign-in (Google or email) but no payment
 * - "premium" — requires active subscription
 */

export const PREMIUM_FEATURES = {
  coreMomentLogging: { tier: "free", label: "Trigger + emotion logging" },
  timeline: { tier: "free", label: "Timeline review" },
  basicWeeklyReport: { tier: "free", label: "Weekly pattern report" },
  exportLogs: { tier: "free", label: "Export your data" },
  aiWeeklySummary: { tier: "free", label: "Pattern insights (rule-based)" },
  llmPersonalizedInsight: { tier: "premium", label: "AI-powered personalized insight" },
  detailedReportCharts: { tier: "premium", label: "Detailed report charts" },
  momentEditing: { tier: "free", label: "Edit and delete moments" },
};

export const PREMIUM_TIERS = {
  free: "free",
  signed: "signed",
  premium: "premium",
};

export const PREMIUM_PRODUCT_ID = "premium_monthly";

export const PREMIUM_PRICE_LABEL = "₹149/month";

/**
 * Returns true if the given feature requires an active premium subscription.
 */
export function requiresPremium(featureKey) {
  const feature = PREMIUM_FEATURES[featureKey];
  return feature?.tier === "premium";
}

/**
 * Returns true if the given feature requires sign-in (but not premium).
 */
export function requiresSignIn(featureKey) {
  const feature = PREMIUM_FEATURES[featureKey];
  return feature?.tier === "signed";
}

/**
 * Returns true if the owner has access to a feature given their subscription status
 * and authentication state.
 */
export function hasAccess(featureKey, subscriptionStatus, isAuthenticated = false) {
  const feature = PREMIUM_FEATURES[featureKey];
  if (!feature) return false;

  if (feature.tier === "free") return true;

  if (feature.tier === "signed") {
    return isAuthenticated || subscriptionStatus === "active" || subscriptionStatus === "grace_period";
  }

  return subscriptionStatus === "active" || subscriptionStatus === "grace_period";
}
