export const NOTIFICATION_TYPES = {
  REFLECTION_REMINDER: "reflection_reminder",
  PATTERN_ALERT: "pattern_alert",
  WEEKLY_INSIGHT: "weekly_insight",
  REPORT_READY: "report_ready",
  AI_INSIGHT_READY: "ai_insight_ready",
  INACTIVITY_NUDGE: "inactivity_nudge",
};

export const NOTIFICATION_TITLES = {
  [NOTIFICATION_TYPES.REFLECTION_REMINDER]: "Time to reflect",
  [NOTIFICATION_TYPES.PATTERN_ALERT]: "Pattern noticed",
  [NOTIFICATION_TYPES.WEEKLY_INSIGHT]: "Your weekly patterns are ready",
  [NOTIFICATION_TYPES.REPORT_READY]: "Your weekly report is ready",
  [NOTIFICATION_TYPES.AI_INSIGHT_READY]: "New personalized insight",
  [NOTIFICATION_TYPES.INACTIVITY_NUDGE]: "How has your week been?",
};

export const INACTIVITY_THRESHOLD_DAYS = 3;