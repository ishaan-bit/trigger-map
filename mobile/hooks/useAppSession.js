import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import {
  clearSessionToken,
  getOnboardingComplete,
  getOrCreateDeviceId,
  setLastLoggedAt,
  getReminderEnabled,
  getReflectionEnabled,
  getNudgesEnabled,
  getSessionToken,
  getDailyPrediction,
  setOnboardingComplete,
  setReminderEnabled,
  setReflectionEnabled,
  setNudgesEnabled,
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
  registerPushToken,
  unregisterPushToken,
} from "@/services/api";
import {
  saveLocalMoment,
  getLocalMoments,
  deleteLocalMoment,
  updateLocalMoment,
  migrateLocalMoments,
  buildLocalReport,
  clearLocalMoments,
} from "@/services/localStore";
import { trackEvent } from "@/services/analyticsService";
import { captureMobileError } from "@/services/crashService";
import {
  disableWeeklyReminder,
  enableWeeklyReminder,
  getExpoPushToken,
  schedulePatternAlert,
  scheduleReflectionReminder,
  disableReflectionReminder,
  scheduleInactivityNudge,
} from "@/services/notificationService";
import { startSubscriptionFlow, restoreSubscriptionFlow } from "@/services/subscriptionService";

const SessionContext = createContext(null);

function createEmptyReport() {
  return {
    topTrigger: null,
    topEmotion: null,
    tiedTriggers: [],
    tiedEmotions: [],
    hasDominantTrigger: false,
    hasDominantEmotion: false,
    topPair: { trigger: "none", emotion: "none", count: 0 },
    totalMoments: 0,
    timeOfDayPatterns: {},
    triggerFrequency: {},
    emotionFrequency: {},
    correlations: {},
    energyDistribution: {},
    regulators: [],
    frictionZones: [],
    pairings: [],
    triggerConcentration: 0,
    emotionConcentration: 0,
    mostStableDay: null,
    volatilityScore: null,
    trajectoryNote: null,
    weeklyEmotionTrajectory: [],
    busiestTime: null,
    dataQuality: {
      totalMoments: 0,
      daysLogged: 0,
      uniqueTriggers: 0,
      uniqueEmotions: 0,
      confidence: "too_early",
      hasEnoughForPairings: false,
      hasEnoughForRhythm: false,
      hasEnoughForTrajectory: false,
      hasEnoughForStability: false,
    },
    aiInsight: null,
  };
}

export function SessionProvider({ children }) {
  const [ready, setReady] = useState(false);
  const [deviceId, setDeviceId] = useState(null);
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [firstAiFreeAvailable, setFirstAiFreeAvailable] = useState(false);
  const [onboardingComplete, setOnboardingCompleteState] = useState(false);
  const [reminderEnabled, setReminderEnabledState] = useState(false);
  const [reflectionEnabled, setReflectionEnabledState] = useState(true);
  const [nudgesEnabled, setNudgesEnabledState] = useState(true);

  // Simple in-memory cache to avoid redundant fetches on rapid tab switching
  const cache = useRef({});
  const CACHE_TTL = 15_000; // 15 seconds

  function getCached(key) {
    const entry = cache.current[key];
    if (entry && Date.now() - entry.time < CACHE_TTL) return entry.data;
    return null;
  }

  function setCache(key, data) {
    cache.current[key] = { data, time: Date.now() };
  }

  function invalidateCache(key) {
    if (key) { delete cache.current[key]; } else { cache.current = {}; }
  }

  useEffect(() => {
    async function bootstrap() {
      let enabledReminder = false;
      let enabledReflection = false;
      let enabledNudges = false;
      try {
        const [storedDeviceId, storedToken, completedOnboarding, _enabledReminder, _enabledReflection, _enabledNudges] = await Promise.all([
          getOrCreateDeviceId(),
          getSessionToken(),
          getOnboardingComplete(),
          getReminderEnabled(),
          getReflectionEnabled(),
          getNudgesEnabled(),
        ]);

        enabledReminder = _enabledReminder;
        enabledReflection = _enabledReflection;
        enabledNudges = _enabledNudges;

        setDeviceId(storedDeviceId);
        setOnboardingCompleteState(completedOnboarding);
        setReminderEnabledState(enabledReminder);
        setReflectionEnabledState(enabledReflection);
        setNudgesEnabledState(enabledNudges);

        if (storedToken) {
          const session = await fetchMe(storedToken);
          setToken(storedToken);
          setUser(session.user);
          setSubscription(session.subscription || null);
          setFirstAiFreeAvailable(session.firstAiFreeAvailable ?? false);

          // Re-register push token on every app start (tokens can rotate)
          getExpoPushToken().then(pushInfo => {
            if (pushInfo) {
              registerPushToken({ deviceId: storedDeviceId, ...pushInfo }, storedToken).catch(() => null);
            }
          });
        }
      } catch (error) {
        captureMobileError(error, { source: "bootstrap" });
        await clearSessionToken();
        setToken(null);
        setUser(null);
        setSubscription(null);
      } finally {
        setReady(true);
        // Re-register recurring notifications on each app start (they can be lost after updates/restarts)
        if (enabledReminder) {
          enableWeeklyReminder().catch(() => null);
        }
        if (enabledReflection) {
          scheduleReflectionReminder().catch(() => null);
        }
        if (enabledNudges) {
          scheduleInactivityNudge().catch(() => null);
        }
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
      firstAiFreeAvailable,
      onboardingComplete,
      reminderEnabled,
      reflectionEnabled,
      nudgesEnabled,
      async completeOnboarding() {
        await setOnboardingComplete(true);
        setOnboardingCompleteState(true);
        // Schedule notifications in background — never block navigation.
        // Awaiting requestPermissionsAsync() here can deadlock on Android 13+
        // if the system dialog hasn't been dismissed yet.
        (async () => {
          try {
            await enableWeeklyReminder();
            await scheduleReflectionReminder();
            await setReminderEnabled(true);
            setReminderEnabledState(true);
          } catch {
            // Permission denied or scheduling failed — leave disabled
          }
        })();
      },
      async signInWithEmail(email, password) {
        const activeDeviceId = await ensureDeviceIdentity();
        const response = await login({ provider: "email", email, password, deviceId: activeDeviceId });
        await setSessionToken(response.token);
        setToken(response.token);
        setUser(response.user);
        await migrateLocalMoments(response.token, activeDeviceId).catch(() => null);
        trackEvent("login_completed", { provider: "email" });
        // Register push token in background
        getExpoPushToken().then(pushInfo => {
          if (pushInfo) registerPushToken({ deviceId: activeDeviceId, ...pushInfo }, response.token).catch(() => null);
        });
      },
      async registerWithEmail(name, email, password) {
        const activeDeviceId = await ensureDeviceIdentity();
        const response = await register({ name, email, password, deviceId: activeDeviceId });
        await setSessionToken(response.token);
        setToken(response.token);
        setUser(response.user);
        await migrateLocalMoments(response.token, activeDeviceId).catch(() => null);
        trackEvent("register_completed", {});
        getExpoPushToken().then(pushInfo => {
          if (pushInfo) registerPushToken({ deviceId: activeDeviceId, ...pushInfo }, response.token).catch(() => null);
        });
      },
      async signInWithGoogle(idToken) {
        const activeDeviceId = await ensureDeviceIdentity();
        const response = await login({ provider: "google", idToken, deviceId: activeDeviceId });
        await setSessionToken(response.token);
        setToken(response.token);
        setUser(response.user);
        await migrateLocalMoments(response.token, activeDeviceId).catch(() => null);
        trackEvent("login_completed", { provider: "google" });
        getExpoPushToken().then(pushInfo => {
          if (pushInfo) registerPushToken({ deviceId: activeDeviceId, ...pushInfo }, response.token).catch(() => null);
        });
      },
      async signOut() {
        // Unregister push token before clearing session (needs auth token)
        if (token && deviceId) {
          unregisterPushToken({ deviceId }, token).catch(() => null);
        }

        // Clear local session immediately for instant UX
        await clearSessionToken();
        setToken(null);
        setUser(null);
        setSubscription(null);
        setFirstAiFreeAvailable(false);
        invalidateCache();

        // Revoke Google access in background (non-blocking)
        (async () => {
          try {
            GoogleSignin.configure({
              webClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID,
            });
            await GoogleSignin.revokeAccess();
          } catch {
            // No previous Google session — safe to ignore
          }
          try {
            await GoogleSignin.signOut();
          } catch {
            // Safe to ignore
          }
        })();
      },
      async refreshSession() {
        if (!token) {
          return null;
        }
        const session = await fetchMe(token);
        setUser(session.user);
        setSubscription(session.subscription || null);
        setFirstAiFreeAvailable(session.firstAiFreeAvailable ?? false);
        return session;
      },
      async saveMoment(payload) {
        const activeDeviceId = await ensureDeviceIdentity();
        const notes = payload.notes ?? payload.note ?? "";
        const timestamp = payload.timestamp || new Date().toISOString();
        const prediction = await getDailyPrediction().catch(() => null);

        // Invalidate caches so next load picks up the new moment
        invalidateCache();

        if (!token) {
          const localMoment = await saveLocalMoment({
            trigger: payload.trigger,
            emotion: payload.emotion,
            note: notes,
            timestamp,
            ...(payload.tags?.length ? { tags: payload.tags } : {}),
            ...(prediction ? { prediction } : {}),
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
            ...(prediction ? { prediction } : {}),
            ...(payload.tags?.length ? { tags: payload.tags } : {}),
          },
          token,
          payload.lang
        );
        console.info("QuietDen: moment logged", {
          id: response.moment?.id,
          trigger: response.moment?.trigger,
          emotion: response.moment?.emotion,
        });
        await setLastLoggedAt(response.moment?.timestamp || timestamp);
        if (response.patternFeedback) {
          schedulePatternAlert(response.patternFeedback).catch(() => null);
        }
        if (reflectionEnabled) {
          scheduleReflectionReminder().catch(() => null);
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

        const cached = getCached("timeline");
        if (cached) return cached;

        const response = await fetchTimeline(activeDeviceId, token);
        console.info("QuietDen: timeline fetched", { count: response.moments?.length ?? 0 });
        const moments = response.moments || [];
        setCache("timeline", moments);
        return moments;
      },
      async updateMoment(momentId, updates) {
        invalidateCache();
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
        invalidateCache();
        if (!token) {
          await deleteLocalMoment(momentId);
          trackEvent("moment_deleted", { momentId, local: true });
          return;
        }
        await deleteMomentApi(momentId, token);
        trackEvent("moment_deleted", { momentId });
      },
      async loadWeeklyReport(lang) {
        const activeDeviceId = await ensureDeviceIdentity();

        if (!token) {
          const localMoments = await getLocalMoments();
          const report = buildLocalReport(localMoments) || createEmptyReport();
          trackEvent("weekly_report_viewed", { totalMoments: report.totalMoments, local: true });
          return report;
        }

        const cached = getCached("weeklyReport");
        if (cached) return cached;

        const response = await fetchWeeklyReport(activeDeviceId, token, lang);
        const report = response.report || createEmptyReport();
        console.info("QuietDen: report generated", { totalMoments: report.totalMoments ?? 0 });
        trackEvent("weekly_report_viewed", { totalMoments: report.totalMoments });
        setCache("weeklyReport", report);
        return report;
      },
      async exportLogs() {
        const activeDeviceId = await ensureDeviceIdentity();

        let contents;
        if (token) {
          contents = await downloadExport(activeDeviceId, token);
        } else {
          // Export local moments for anonymous users
          const localMoments = await getLocalMoments();
          contents = JSON.stringify(localMoments, null, 2);
        }

        const fileUri = `${FileSystem.cacheDirectory}quietden-export.json`;
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
      async toggleReflection(enabled) {
        if (enabled) {
          await scheduleReflectionReminder();
        } else {
          await disableReflectionReminder();
        }

        await setReflectionEnabled(enabled);
        setReflectionEnabledState(enabled);
      },
      async toggleNudges(enabled) {
        await setNudgesEnabled(enabled);
        setNudgesEnabledState(enabled);
      },
      async subscribe() {
        const result = await startSubscriptionFlow(token);
        setSubscription(result);
        // Force re-fetch session so premium state and insight are immediately available
        if (token) {
          try {
            const session = await fetchMe(token);
            setUser(session.user);
            setSubscription(session.subscription || result);
            setFirstAiFreeAvailable(session.firstAiFreeAvailable ?? false);
          } catch {
            // Subscribe succeeded; session refresh is best-effort
          }
        }
        return result;
      },
      async restoreSubscription() {
        const result = await restoreSubscriptionFlow(token);
        if (result) setSubscription(result);
        return result;
      },
      async deleteAllUserData() {
        if (token) {
          await deleteAllData(token);
          await clearSessionToken();
          setToken(null);
          setUser(null);
          setSubscription(null);
        }
        await clearLocalMoments();
      },
    }),
    [deviceId, ensureDeviceIdentity, firstAiFreeAvailable, nudgesEnabled, onboardingComplete, ready, reflectionEnabled, reminderEnabled, subscription, token, user]
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