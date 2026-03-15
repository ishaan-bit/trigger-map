import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import {
  clearSessionToken,
  getOnboardingComplete,
  getOrCreateDeviceId,
  setLastLoggedAt,
  getReminderEnabled,
  getSessionToken,
  setOnboardingComplete,
  setReminderEnabled,
  setSessionToken,
} from "@/services/deviceService";
import {
  downloadExport,
  editMoment,
  deleteMomentApi,
  deleteAllData,
  fetchMe,
  fetchTimeline,
  fetchWeeklyReport,
  login,
  logMoment,
  register,
} from "@/services/api";
import {
  saveLocalMoment,
  getLocalMoments,
  deleteLocalMoment,
  updateLocalMoment,
  migrateLocalMoments,
  buildLocalReport,
} from "@/services/localStore";
import { trackEvent } from "@/services/analyticsService";
import { captureMobileError } from "@/services/crashService";
import {
  disableWeeklyReminder,
  enableWeeklyReminder,
  schedulePatternAlert,
  scheduleReflectionReminder,
  scheduleInactivityNudge,
} from "@/services/notificationService";
import { startSubscriptionFlow } from "@/services/subscriptionService";

const SessionContext = createContext(null);

function createEmptyReport() {
  return {
    insights: [],
    topTrigger: null,
    topEmotion: null,
    topPair: { trigger: "none", emotion: "none", count: 0 },
    totalMoments: 0,
    timeOfDayPatterns: {},
    triggerFrequency: {},
    emotionFrequency: {},
    weeklyEmotionTrajectory: [],
    volatilityScore: 0,
    volatilityChange: "Not enough data yet",
    mostStableDay: "Not enough data yet",
    aiInsight: null,
  };
}

export function SessionProvider({ children }) {
  const [ready, setReady] = useState(false);
  const [deviceId, setDeviceId] = useState(null);
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [onboardingComplete, setOnboardingCompleteState] = useState(false);
  const [reminderEnabled, setReminderEnabledState] = useState(false);

  useEffect(() => {
    async function bootstrap() {
      try {
        const [storedDeviceId, storedToken, completedOnboarding, enabledReminder] = await Promise.all([
          getOrCreateDeviceId(),
          getSessionToken(),
          getOnboardingComplete(),
          getReminderEnabled(),
        ]);

        setDeviceId(storedDeviceId);
        setOnboardingCompleteState(completedOnboarding);
        setReminderEnabledState(enabledReminder);

        if (storedToken) {
          const session = await fetchMe(storedToken);
          setToken(storedToken);
          setUser(session.user);
          setSubscription(session.subscription || null);
        }
      } catch (error) {
        captureMobileError(error, { source: "bootstrap" });
        await clearSessionToken();
        setToken(null);
        setUser(null);
        setSubscription(null);
      } finally {
        setReady(true);
        // Check for inactivity nudge on each app open (fire-and-forget)
        scheduleInactivityNudge().catch(() => null);
      }
    }

    bootstrap();
  }, []);

  const ensureDeviceIdentity = useCallback(async () => {
    if (deviceId) {
      return deviceId;
    }

    const nextDeviceId = await getOrCreateDeviceId();
    setDeviceId(nextDeviceId);
    return nextDeviceId;
  }, [deviceId]);

  const value = useMemo(
    () => ({
      ready,
      deviceId,
      token,
      user,
      subscription,
      onboardingComplete,
      reminderEnabled,
      async completeOnboarding() {
        await setOnboardingComplete(true);
        setOnboardingCompleteState(true);
      },
      async signInWithEmail(email, password) {
        const activeDeviceId = await ensureDeviceIdentity();
        const response = await login({ provider: "email", email, password, deviceId: activeDeviceId });
        await setSessionToken(response.token);
        setToken(response.token);
        setUser(response.user);
        await migrateLocalMoments(response.token, activeDeviceId).catch(() => null);
        trackEvent("login_completed", { provider: "email" });
      },
      async registerWithEmail(name, email, password) {
        const activeDeviceId = await ensureDeviceIdentity();
        const response = await register({ name, email, password, deviceId: activeDeviceId });
        await setSessionToken(response.token);
        setToken(response.token);
        setUser(response.user);
        await migrateLocalMoments(response.token, activeDeviceId).catch(() => null);
        trackEvent("register_completed", {});
      },
      async signInWithGoogle(idToken) {
        const activeDeviceId = await ensureDeviceIdentity();
        const response = await login({ provider: "google", idToken, deviceId: activeDeviceId });
        await setSessionToken(response.token);
        setToken(response.token);
        setUser(response.user);
        await migrateLocalMoments(response.token, activeDeviceId).catch(() => null);
        trackEvent("login_completed", { provider: "google" });
      },
      async signOut() {
        await clearSessionToken();
        setToken(null);
        setUser(null);
        setSubscription(null);
      },
      async refreshSession() {
        if (!token) {
          return null;
        }
        const session = await fetchMe(token);
        setUser(session.user);
        setSubscription(session.subscription || null);
        return session;
      },
      async saveMoment(payload) {
        const activeDeviceId = await ensureDeviceIdentity();
        const notes = payload.notes ?? payload.note ?? "";
        const timestamp = payload.timestamp || new Date().toISOString();

        if (!token) {
          const localMoment = await saveLocalMoment({
            trigger: payload.trigger,
            emotion: payload.emotion,
            note: notes,
            timestamp,
          });
          await setLastLoggedAt(timestamp);
          trackEvent("moment_logged", { trigger: payload.trigger, emotion: payload.emotion, local: true });
          return { moment: localMoment };
        }

        const response = await logMoment(
          {
            deviceId: activeDeviceId,
            trigger: payload.trigger,
            emotion: payload.emotion,
            note: notes,
            notes,
            timestamp,
          },
          token
        );
        console.info("TriggerMap: moment logged", {
          id: response.moment?.id,
          trigger: response.moment?.trigger,
          emotion: response.moment?.emotion,
        });
        await setLastLoggedAt(response.moment?.timestamp || timestamp);
        if (response.patternFeedback) {
          await schedulePatternAlert(response.patternFeedback).catch(() => null);
        }
        if (reminderEnabled) {
          await scheduleReflectionReminder().catch(() => null);
        }
        trackEvent("moment_logged", { trigger: response.moment.trigger, emotion: response.moment.emotion });
        return response;
      },
      async loadTimeline() {
        const activeDeviceId = await ensureDeviceIdentity();

        if (!token) {
          const localMoments = await getLocalMoments();
          return localMoments;
        }

        const response = await fetchTimeline(activeDeviceId, token);
        console.info("TriggerMap: timeline fetched", { count: response.moments?.length ?? 0 });
        return response.moments || [];
      },
      async updateMoment(momentId, updates) {
        if (!token) {
          const updated = await updateLocalMoment(momentId, updates);
          trackEvent("moment_edited", { momentId, local: true });
          return updated;
        }
        const response = await editMoment(momentId, updates, token);
        trackEvent("moment_edited", { momentId });
        return response.moment;
      },
      async removeMoment(momentId) {
        if (!token) {
          await deleteLocalMoment(momentId);
          trackEvent("moment_deleted", { momentId, local: true });
          return;
        }
        await deleteMomentApi(momentId, token);
        trackEvent("moment_deleted", { momentId });
      },
      async loadWeeklyReport() {
        const activeDeviceId = await ensureDeviceIdentity();

        if (!token) {
          const localMoments = await getLocalMoments();
          const report = buildLocalReport(localMoments) || createEmptyReport();
          trackEvent("weekly_report_viewed", { totalMoments: report.totalMoments, local: true });
          return report;
        }

        const response = await fetchWeeklyReport(activeDeviceId, token);
        const report = response.report || createEmptyReport();
        console.info("TriggerMap: report generated", { totalMoments: report.totalMoments ?? 0 });
        trackEvent("weekly_report_viewed", { totalMoments: report.totalMoments });
        return report;
      },
      async exportLogs() {
        const activeDeviceId = await ensureDeviceIdentity();
        const contents = await downloadExport(activeDeviceId, token);
        const fileUri = `${FileSystem.cacheDirectory}triggermap-export.json`;
        await FileSystem.writeAsStringAsync(fileUri, contents, { encoding: FileSystem.EncodingType.UTF8 });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri);
        }
      },
      async toggleReminder(enabled) {
        if (enabled) {
          await enableWeeklyReminder();
        } else {
          await disableWeeklyReminder();
        }

        await setReminderEnabled(enabled);
        setReminderEnabledState(enabled);
      },
      async subscribe() {
        const result = await startSubscriptionFlow(token);
        setSubscription(result);
        return result;
      },
      async deleteAllUserData() {
        if (!token) {
          throw new Error("Sign in to delete your data");
        }
        await deleteAllData(token);
        await clearSessionToken();
        setToken(null);
        setUser(null);
        setSubscription(null);
      },
    }),
    [deviceId, ensureDeviceIdentity, onboardingComplete, ready, reminderEnabled, subscription, token, user]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useAppSession() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useAppSession must be used within SessionProvider");
  }

  return context;
}