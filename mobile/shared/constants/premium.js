/**
 * Premium entitlement matrix.
 *
 * Each key is a feature slug. The `tier` field defines who can access it.
 * - "free"    - available to everyone
 * - "premium" - requires active subscription
 */

export const PREMIUM_FEATURES = {
  coreMomentLogging: { tier: "free", label: "Trigger + emotion logging" },
  timeline: { tier: "free", label: "Timeline review" },
  basicWeeklyReport: { tier: "free", label: "Weekly pattern report" },
  exportLogs: { tier: "free", label: "Export your data" },
  aiWeeklySummary: { tier: "premium", label: "AI-powered weekly insight" },
  detailedReportCharts: { tier: "premium", label: "Detailed report charts" },
  momentEditing: { tier: "free", label: "Edit and delete moments" },
};

export const PREMIUM_TIERS = {
  free: "free",
  premium: "premium",
};

export const PREMIUM_PRODUCT_ID = "premium_monthly";

export const PREMIUM_PRICE_LABEL = "INR 149/month";

export function requiresPremium(featureKey) {
  const feature = PREMIUM_FEATURES[featureKey];
  return feature?.tier === "premium";
}

export function hasAccess(featureKey, subscriptionStatus) {
  if (!requiresPremium(featureKey)) {
    return true;
  }
  return subscriptionStatus === "active" || subscriptionStatus === "grace_period";
}