import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { NOTIFICATION_TITLES, NOTIFICATION_TYPES, INACTIVITY_THRESHOLD_DAYS } from "@triggermap/shared/constants/notifications";
import { getLastLoggedAt, getLastOpenedAt } from "./deviceService";

const LAST_NOTIFICATION_DATE_KEY = "triggermap.last-notification-date";
const RECENT_OPEN_WINDOW_MS = 45 * 60 * 1000;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function enableWeeklyReminder() {
  await ensureNotificationAccess();
  await Notifications.cancelAllScheduledNotificationsAsync();

  return scheduleWeeklyInsightRelease("Your latest TriggerMap report is ready to review.");
}

export async function disableWeeklyReminder() {
  return Notifications.cancelAllScheduledNotificationsAsync();
}

export async function scheduleReflectionReminder() {
  const shouldNotify = await canSendNotificationToday();
  if (!shouldNotify) {
    return null;
  }

  return scheduleNotification({
    type: NOTIFICATION_TYPES.REFLECTION_REMINDER,
    body: "How did today feel? A quick log helps your pattern map stay current.",
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: 20,
      minute: 0,
    },
  });
}

export async function schedulePatternAlert(message) {
  const shouldNotify = await canSendNotificationToday();
  if (!shouldNotify) {
    return null;
  }

  return scheduleNotification({
    type: NOTIFICATION_TYPES.PATTERN_ALERT,
    body: message,
    trigger: null,
  });
}

export async function scheduleWeeklyInsightRelease(message) {
  const shouldNotify = await canSendNotificationToday();
  if (!shouldNotify) {
    return null;
  }

  return scheduleNotification({
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

async function canSendNotificationToday() {
  await ensureNotificationAccess();

  const today = new Date().toISOString().slice(0, 10);
  const [lastSentDate, lastOpenedAt, lastLoggedAt] = await Promise.all([
    AsyncStorage.getItem(LAST_NOTIFICATION_DATE_KEY),
    getLastOpenedAt(),
    getLastLoggedAt(),
  ]);

  if (lastSentDate === today) {
    return false;
  }

  if (lastLoggedAt?.slice(0, 10) === today) {
    return false;
  }

  if (lastOpenedAt && Date.now() - new Date(lastOpenedAt).getTime() <= RECENT_OPEN_WINDOW_MS) {
    return false;
  }

  return true;
}

async function scheduleNotification({ type, body, trigger }) {
  const content = {
    title: NOTIFICATION_TITLES[type],
    body,
    data: { type },
  };

  const notificationId = await Notifications.scheduleNotificationAsync({ content, trigger });
  await AsyncStorage.setItem(LAST_NOTIFICATION_DATE_KEY, new Date().toISOString().slice(0, 10));
  return notificationId;
}

/** Notify when a rule-based weekly report has been generated */
export async function notifyReportReady() {
  const shouldNotify = await canSendNotificationToday();
  if (!shouldNotify) return null;

  return scheduleNotification({
    type: NOTIFICATION_TYPES.REPORT_READY,
    body: "Your weekly emotional patterns are ready to explore.",
    trigger: null,
  });
}

/** Notify when a personalized AI (LLM) insight is available */
export async function notifyAiInsightReady() {
  const shouldNotify = await canSendNotificationToday();
  if (!shouldNotify) return null;

  return scheduleNotification({
    type: NOTIFICATION_TYPES.AI_INSIGHT_READY,
    body: "Your personalized TriggerMap insight is ready.",
    trigger: null,
  });
}

/** Schedule an inactivity nudge if user hasn't logged in INACTIVITY_THRESHOLD_DAYS */
export async function scheduleInactivityNudge() {
  const lastLoggedAt = await getLastLoggedAt();

  if (lastLoggedAt) {
    const daysSinceLog = (Date.now() - new Date(lastLoggedAt).getTime()) / (24 * 60 * 60 * 1000);
    if (daysSinceLog < INACTIVITY_THRESHOLD_DAYS) return null;
  }

  const shouldNotify = await canSendNotificationToday();
  if (!shouldNotify) return null;

  return scheduleNotification({
    type: NOTIFICATION_TYPES.INACTIVITY_NUDGE,
    body: "How has your day been? Log a moment to keep your pattern map current.",
    trigger: null,
  });
}