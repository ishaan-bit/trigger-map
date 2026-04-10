import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { NOTIFICATION_TITLES, NOTIFICATION_TYPES, INACTIVITY_THRESHOLD_DAYS } from "@triggermap/shared/constants/notifications";
import { getLastLoggedAt, getLastOpenedAt } from "./deviceService";

const LAST_PATTERN_ALERT_DATE_KEY = "triggermap.last-pattern-alert-date";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/** Cancel only scheduled notifications matching a specific type */
export async function cancelNotificationsByType(targetType) {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const toCancel = scheduled.filter((n) => n.content.data?.type === targetType);
  for (const n of toCancel) {
    await Notifications.cancelScheduledNotificationAsync(n.identifier);
  }
}

/** Public alias used by _layout.js to dedup server push vs local schedule */
export const cancelScheduledByType = cancelNotificationsByType;

export async function enableWeeklyReminder() {
  await ensureNotificationAccess();
  // Cancel only existing weekly-type notifications, not all
  await cancelNotificationsByType(NOTIFICATION_TYPES.WEEKLY_INSIGHT);

  return scheduleRecurringNotification({
    type: NOTIFICATION_TYPES.WEEKLY_INSIGHT,
    body: "Your weekly patterns are ready — see what stands out this week.",
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
      weekday: 1,
      hour: 19,
      minute: 0,
    },
  });
}

export async function disableWeeklyReminder() {
  return cancelNotificationsByType(NOTIFICATION_TYPES.WEEKLY_INSIGHT);
}

export async function scheduleReflectionReminder() {
  await ensureNotificationAccess();
  await cancelNotificationsByType(NOTIFICATION_TYPES.REFLECTION_REMINDER);

  return scheduleRecurringNotification({
    type: NOTIFICATION_TYPES.REFLECTION_REMINDER,
    body: "How did today feel? A quick log helps your pattern map stay current.",
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: 20,
      minute: 0,
    },
  });
}

export async function disableReflectionReminder() {
  return cancelNotificationsByType(NOTIFICATION_TYPES.REFLECTION_REMINDER);
}

export async function schedulePatternAlert(message) {
  if (!message) return null;

  try {
    await ensureNotificationAccess();
  } catch {
    return null;
  }

  // Rate-limit: max one pattern alert per day
  const today = new Date().toISOString().slice(0, 10);
  const lastAlertDate = await AsyncStorage.getItem(LAST_PATTERN_ALERT_DATE_KEY);
  if (lastAlertDate === today) return null;

  const content = {
    title: NOTIFICATION_TITLES[NOTIFICATION_TYPES.PATTERN_ALERT],
    body: message,
    data: { type: NOTIFICATION_TYPES.PATTERN_ALERT },
  };

  // Fire immediately — user just logged, show it right away
  const id = await Notifications.scheduleNotificationAsync({ content, trigger: null });
  await AsyncStorage.setItem(LAST_PATTERN_ALERT_DATE_KEY, today);
  return id;
}

export async function scheduleWeeklyInsightRelease(message) {
  await ensureNotificationAccess();

  return scheduleRecurringNotification({
    type: NOTIFICATION_TYPES.WEEKLY_INSIGHT,
    body: message,
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
      weekday: 1,
      hour: 19,
      minute: 0,
    },
  });
}

async function ensureNotificationAccess() {
  const permissions = await Notifications.requestPermissionsAsync();
  if (!permissions.granted) {
    throw new Error("Notification permission denied");
  }
  return permissions;
}

async function scheduleImmediateNotification({ type, body }) {
  const content = {
    title: NOTIFICATION_TITLES[type],
    body,
    data: { type },
  };

  return Notifications.scheduleNotificationAsync({ content, trigger: null });
}

/** Schedule a recurring notification (daily/weekly) — bypasses daily rate limit */
async function scheduleRecurringNotification({ type, body, trigger }) {
  const content = {
    title: NOTIFICATION_TITLES[type],
    body,
    data: { type },
  };

  return Notifications.scheduleNotificationAsync({ content, trigger });
}

/** Notify when a rule-based weekly report has been generated */
export async function notifyReportReady() {
  try {
    await ensureNotificationAccess();
  } catch {
    return null;
  }

  return scheduleImmediateNotification({
    type: NOTIFICATION_TYPES.REPORT_READY,
    body: "Your weekly emotional patterns are ready to explore.",
  });
}

/** Notify when a personalized AI (LLM) insight is available */
export async function notifyAiInsightReady() {
  try {
    await ensureNotificationAccess();
  } catch {
    return null;
  }

  return scheduleImmediateNotification({
    type: NOTIFICATION_TYPES.AI_INSIGHT_READY,
    body: "Your personalized TriggerMap insight is ready.",
  });
}

/** Schedule an inactivity nudge — fires next day at 11 AM if user hasn't logged recently */
export async function scheduleInactivityNudge() {
  try {
    await ensureNotificationAccess();
  } catch {
    return null;
  }

  const lastLoggedAt = await getLastLoggedAt();

  if (lastLoggedAt) {
    const daysSinceLog = (Date.now() - new Date(lastLoggedAt).getTime()) / (24 * 60 * 60 * 1000);
    if (daysSinceLog < INACTIVITY_THRESHOLD_DAYS) return null;
  }

  // Cancel any existing nudge before scheduling a new one
  await cancelNotificationsByType(NOTIFICATION_TYPES.INACTIVITY_NUDGE);

  const content = {
    title: NOTIFICATION_TITLES[NOTIFICATION_TYPES.INACTIVITY_NUDGE],
    body: "How has your day been? Log a moment to keep your pattern map current.",
    data: { type: NOTIFICATION_TYPES.INACTIVITY_NUDGE },
  };

  // Schedule for tomorrow at 11 AM instead of firing immediately
  return Notifications.scheduleNotificationAsync({
    content,
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: 11,
      minute: 0,
    },
  });
}

/**
 * Request notification permission and return the Expo push token.
 * Returns null if permission denied or token unavailable.
 */
export async function getExpoPushToken() {
  try {
    const permissions = await Notifications.requestPermissionsAsync();
    if (!permissions.granted) return null;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const tokenData = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    return { token: tokenData.data, platform: Platform.OS };
  } catch (err) {
    console.warn("[push-token] Failed to get Expo push token:", err.message);
    return null;
  }
}