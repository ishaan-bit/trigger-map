import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import {
  getOnboardingComplete,
  getOrCreateDeviceId,
  setLastLoggedAt,
  getReminderEnabled,
  getReflectionEnabled,
  getNudgesEnabled,
  setOnboardingComplete,
  setReminderEnabled,
  setReflectionEnabled,
  setNudgesEnabled,
  getSessionToken,
  clearSessionToken,
  getRecoveryDone,
  setRecoveryDone,
} from "@/services/deviceService";
import {
  deleteAllData,
  editMoment,
  deleteMomentApi,
  fetchMe,
  fetchTimeline,
  fetchWeeklyReport,
  logMoment,
  recover,
  registerDevice,
  registerPushToken,
  saveNotificationPrefs,
} from "@/services/api";
import {
  saveLocalMoment,
  getLocalMoments,
  deleteLocalMoment,
  updateLocalMoment,
  buildLocalReport,
  clearLocalMoments,
  queuePendingSync,
  getPendingSyncs,
  removePendingSync,
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
  const readyRef = useRef(false);
  // Device-based identity: deviceId is the single canonical owner id. There is
  // no sign-in, no account, and no auth token — every user is anonymous and
  // their data is keyed server-side by this deviceId.
  const [deviceId, setDeviceId] = useState(null);
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
    // Hard safety net: if bootstrap takes more than 10s for any reason, unblock the app.
    const safetyTimer = setTimeout(() => {
      if (!readyRef.current) {
        console.warn("[QuietDen] bootstrap safety timeout fired — forcing ready");
        setReady(true);
      }
    }, 10_000);

    async function bootstrap() {
      let enabledReminder = false;
      let enabledReflection = false;
      let enabledNudges = false;
      try {
        const [storedDeviceId, completedOnboarding, _enabledReminder, _enabledReflection, _enabledNudges] = await Promise.all([
          getOrCreateDeviceId(),
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

        // ── One-time data recovery ──────────────────────────────────────────
        // Users who updated from a signed-in build had their logs stored on the
        // backend under their old account userId. Trigger the server-side
        // userId→deviceId copy once (the server derives the account from the
        // leftover session token or the device→account link). After this, the
        // backend bucket for this deviceId holds the full history, which the
        // timeline/report read. The server also self-heals on any read, so this
        // is best-effort; on failure we leave the flag unset to retry next launch.
        try {
          const recoveryDone = await getRecoveryDone();
          if (!recoveryDone) {
            const legacyToken = await getSessionToken();
            const result = await recover(storedDeviceId, legacyToken);
            // Only finalize (and discard the legacy token) when the server confirms a
            // completed recovery; otherwise retry on the next launch with the token.
            if (result?.ok) {
              await setRecoveryDone(true);
              if (legacyToken) await clearSessionToken();
            }
            invalidateCache();
          }
        } catch (recoveryErr) {
          console.warn("[recovery] deferred, will retry next launch:", recoveryErr?.message);
        }

        // Announce the install so it's visible in the ops console regardless of
        // push permission or logging activity.
        registerDevice(storedDeviceId).catch(() => null);

        // Hydrate premium + first-AI-free state, keyed by deviceId.
        fetchMe(null, storedDeviceId)
          .then((session) => {
            setSubscription(session.subscription || null);
            setFirstAiFreeAvailable(session.firstAiFreeAvailable ?? false);
          })
          .catch(() => null);

        // Retry any pending syncs from previous failed attempts.
        getPendingSyncs().then((pendingSyncs) => {
          for (const pendingPayload of pendingSyncs) {
            const { queuedAt: _q, lang, ...momentPayload } = pendingPayload;
            logMoment(momentPayload, null, lang)
              .then(() => removePendingSync(pendingPayload.momentId))
              .catch(() => {}); // fire-and-forget; will retry on next open
          }
        }).catch(() => null);

        // Register push token so the ops console can reach this device.
        getExpoPushToken().then(pushInfo => {
          if (pushInfo) {
            registerPushToken({ deviceId: storedDeviceId, ...pushInfo }, null).catch(() => null);
          }
        });
        // Sync notification prefs keyed by deviceId so push-cron honors opt-outs.
        saveNotificationPrefs({ daily: enabledReflection, weekly: enabledReminder, nudge: enabledNudges }, null, storedDeviceId).catch(() => null);
      } catch (error) {
        captureMobileError(error, { source: "bootstrap" });
        setSubscription(null);
      } finally {
        readyRef.current = true;
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

    bootstrap().finally(() => clearTimeout(safetyTimer));
    return () => clearTimeout(safetyTimer);
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
      // Kept as stable nulls so the (now universal) anonymous code paths across
      // screens keep working without edits. There is no account or token anymore.
      token: null,
      user: null,
      subscription,
      firstAiFreeAvailable,
      onboardingComplete,
      reminderEnabled,
      reflectionEnabled,
      nudgesEnabled,
      invalidateCache,
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
      async saveMoment(payload) {
        const activeDeviceId = await ensureDeviceIdentity();
        const notes = payload.notes ?? payload.note ?? "";
        const timestamp = payload.timestamp || new Date().toISOString();

        // Invalidate caches so next load picks up the new moment
        invalidateCache();

        // Build continuous + legacy emotion fields
        const emotionFields = {};
        if (typeof payload.valence === "number" && typeof payload.arousal === "number") {
          emotionFields.valence = payload.valence;
          emotionFields.arousal = payload.arousal;
          if (typeof payload.intensity === "number") emotionFields.intensity = payload.intensity;
        }
        if (payload.emotion) emotionFields.emotion = payload.emotion;
        const contributionFields = {
          ...(payload.emotionPoint ? { emotionPoint: payload.emotionPoint } : {}),
          ...(payload.emotionLabel ? { emotionLabel: payload.emotionLabel } : {}),
          ...(payload.emotionSubtitle ? { emotionSubtitle: payload.emotionSubtitle } : {}),
          ...(payload.emotionQuadrant ? { emotionQuadrant: payload.emotionQuadrant } : {}),
          ...(payload.emotionIntensity ? { emotionIntensity: payload.emotionIntensity } : {}),
          contributionTags: payload.contributionTags || payload.tags || [],
          contributionTagMeta: payload.contributionTagMeta || [],
        };

        // Save locally first so the Timeline reflects it instantly (offline-first).
        const localMoment = await saveLocalMoment({
          trigger: payload.trigger,
          ...emotionFields,
          ...contributionFields,
          note: notes,
          timestamp,
          tags: payload.tags || [],
        });
        await setLastLoggedAt(timestamp);
        trackEvent("moment_logged", { trigger: payload.trigger, emotion: localMoment.emotion });

        // Sync to the backend (keyed by deviceId) so the server-computed report,
        // progress, and pattern alerts stay populated. Fire-and-forget with retry queue.
        const syncPayload = {
          deviceId: activeDeviceId,
          momentId: localMoment.id,
          trigger: payload.trigger,
          ...emotionFields,
          ...contributionFields,
          note: notes,
          notes,
          timestamp,
          tags: payload.tags || [],
        };
        logMoment(syncPayload, null, payload.lang)
          .then((res) => {
            if (res?.patternFeedback) schedulePatternAlert(res.patternFeedback).catch(() => null);
            if (reflectionEnabled) scheduleReflectionReminder().catch(() => null);
          })
          .catch((err) => {
            console.warn("[TriggerMap] Moment sync failed, queued for retry:", err.message);
            queuePendingSync({ ...syncPayload, lang: payload.lang }).catch(() => null);
          });

        invalidateCache("weeklyReport");
        return { moment: localMoment };
      },
      async loadTimeline() {
        const activeDeviceId = await ensureDeviceIdentity();
        const local = await getLocalMoments();

        const cached = getCached("timeline");
        if (cached) return cached;

        // The backend (keyed by deviceId) is authoritative — it holds the full
        // history, including data recovered from a previous signed-in account.
        // Merge with the local store (unsynced/offline moments) and fall back to
        // local when offline.
        try {
          const response = await fetchTimeline(activeDeviceId, null);
          const server = response.moments || [];
          const map = new Map();
          for (const m of local) map.set(m.id, m);
          for (const m of server) map.set(m.id, m); // server wins on conflict
          const merged = [...map.values()].sort(
            (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
          );
          setCache("timeline", merged);
          return merged;
        } catch {
          return local;
        }
      },
      async updateMoment(momentId, updates) {
        invalidateCache();
        const activeDeviceId = await ensureDeviceIdentity();
        // Update the local cache (for moments stored there) and the backend
        // (authoritative for the timeline merge, incl. recovered moments).
        const local = await updateLocalMoment(momentId, updates).catch(() => null);
        const response = await editMoment(momentId, { ...updates, deviceId: activeDeviceId }, null).catch(() => null);
        trackEvent("moment_edited", { momentId });
        return response?.moment || local || { id: momentId, ...updates };
      },
      async removeMoment(momentId) {
        invalidateCache();
        const activeDeviceId = await ensureDeviceIdentity();
        await deleteLocalMoment(momentId).catch(() => null);
        await deleteMomentApi(momentId, null, activeDeviceId).catch(() => null);
        trackEvent("moment_deleted", { momentId });
      },
      async loadWeeklyReport(lang) {
        const activeDeviceId = await ensureDeviceIdentity();

        const cached = getCached("weeklyReport");
        if (cached) return cached;

        // The server-computed report (keyed by deviceId) is authoritative — it
        // wires silence detection, trajectory, and progress. Moments are synced
        // to the backend on log; the local report is an offline fallback.
        try {
          const response = await fetchWeeklyReport(activeDeviceId, null, lang);
          const report = response.report || createEmptyReport();
          console.info("QuietDen: report generated", { totalMoments: report.totalMoments ?? 0 });
          trackEvent("weekly_report_viewed", { totalMoments: report.totalMoments, local: false });
          setCache("weeklyReport", report);
          return report;
        } catch (error) {
          // Offline / unreachable: fall back to a locally-computed report so the
          // user always sees their data.
          const localMoments = await getLocalMoments();
          const report = buildLocalReport(localMoments) || createEmptyReport();
          trackEvent("weekly_report_viewed", { totalMoments: report.totalMoments, local: true });
          return report;
        }
      },
      async exportLogs() {
        await ensureDeviceIdentity();
        const localMoments = await getLocalMoments();
        const contents = JSON.stringify(localMoments, null, 2);

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
        // Sync to server (keyed by deviceId) so push-cron respects this.
        saveNotificationPrefs({ weekly: enabled }, null, deviceId).catch(() => null);
      },
      async toggleReflection(enabled) {
        if (enabled) {
          await scheduleReflectionReminder();
        } else {
          await disableReflectionReminder();
        }

        await setReflectionEnabled(enabled);
        setReflectionEnabledState(enabled);
        saveNotificationPrefs({ daily: enabled }, null, deviceId).catch(() => null);
      },
      async toggleNudges(enabled) {
        await setNudgesEnabled(enabled);
        setNudgesEnabledState(enabled);
        saveNotificationPrefs({ nudge: enabled }, null, deviceId).catch(() => null);
      },
      async subscribe() {
        const activeDeviceId = await ensureDeviceIdentity();
        const result = await startSubscriptionFlow(activeDeviceId);
        setSubscription(result);
        // Best-effort refresh of premium + first-free state so the insight is
        // immediately available after purchase.
        try {
          const session = await fetchMe(null, activeDeviceId);
          setSubscription(session.subscription || result);
          setFirstAiFreeAvailable(session.firstAiFreeAvailable ?? false);
        } catch {
          // Subscribe succeeded; session refresh is best-effort
        }
        invalidateCache("weeklyReport");
        return result;
      },
      async restoreSubscription() {
        const activeDeviceId = await ensureDeviceIdentity();
        const result = await restoreSubscriptionFlow(activeDeviceId);
        if (result) setSubscription(result);
        return result;
      },
      async deleteAllUserData() {
        const activeDeviceId = await ensureDeviceIdentity();
        await deleteAllData(null, activeDeviceId).catch(() => null);
        await clearLocalMoments();
        setSubscription(null);
        setFirstAiFreeAvailable(false);
        invalidateCache();
      },
    }),
    [deviceId, ensureDeviceIdentity, firstAiFreeAvailable, nudgesEnabled, onboardingComplete, ready, reflectionEnabled, reminderEnabled, subscription]
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
