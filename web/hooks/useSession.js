import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchMe,
  fetchTimeline as fetchTimelineApi,
  fetchWeeklyReport as fetchWeeklyReportApi,
  fetchProgress as fetchProgressApi,
  fetchModes as fetchModesApi,
  fetchModeOutput as fetchModeOutputApi,
  submitActionFeedback as submitActionFeedbackApi,
  submitModeFeedback as submitModeFeedbackApi,
  fetchModeProfile as fetchModeProfileApi,
  updateModeProfile as updateModeProfileApi,
  regeneratePremium as regeneratePremiumApi,
  createShareSnapshot as createShareSnapshotApi,
  logMoment as logMomentApi,
  editMomentApi,
  deleteMomentApi,
  deleteAllDataApi,
  fetchExport,
  recover,
  registerDevice,
  getDeviceId,
  getLegacyToken,
  clearLegacyToken,
} from "../lib/api";

const SessionContext = createContext(null);

const RECOVERY_DONE_KEY = "triggermap.web.recovery-done";

function isPremiumStatus(status) {
  return status === "active" || status === "grace_period";
}

export function SessionProvider({ children }) {
  const [ready, setReady] = useState(false);
  // Device-based identity: deviceId is the single canonical owner id. There is
  // no sign-in, account, or auth token — every user is anonymous and their data
  // is keyed server-side by this deviceId.
  const [deviceId, setDeviceId] = useState("");
  const [subscription, setSubscription] = useState(null);
  const [firstAiFreeAvailable, setFirstAiFreeAvailable] = useState(false);

  // Short in-memory cache to avoid redundant fetches on rapid navigation.
  const cache = useRef({});
  const CACHE_TTL = 15000;

  const getCached = (key) => {
    const entry = cache.current[key];
    if (entry && Date.now() - entry.time < CACHE_TTL) return entry.data;
    return null;
  };
  const setCache = (key, data) => { cache.current[key] = { data, time: Date.now() }; };
  const invalidateCache = useCallback((key) => {
    if (key) delete cache.current[key];
    else cache.current = {};
  }, []);

  const hydrateSession = useCallback(async (id) => {
    const session = await fetchMe(id);
    setSubscription(session.subscription || null);
    setFirstAiFreeAvailable(session.firstAiFreeAvailable ?? false);
    return session;
  }, []);

  useEffect(() => {
    async function bootstrap() {
      try {
        const id = getDeviceId();
        setDeviceId(id);

        // ── One-time data recovery ──────────────────────────────────────────
        // Previously-signed-in web devices had their logs stored under an old
        // account userId. Trigger the server-side userId→deviceId copy once; the
        // server derives the account from the leftover token or device→account
        // link. Best-effort: on failure we leave the flag unset to retry.
        try {
          const recoveryDone = window.localStorage.getItem(RECOVERY_DONE_KEY) === "true";
          if (!recoveryDone) {
            const legacyToken = getLegacyToken();
            const result = await recover(id, legacyToken);
            if (result?.ok) {
              window.localStorage.setItem(RECOVERY_DONE_KEY, "true");
              if (legacyToken) clearLegacyToken();
            }
            invalidateCache();
          }
        } catch (recoveryErr) {
          console.warn("[recovery] deferred, will retry next launch:", recoveryErr?.message);
        }

        // Announce the install so it's visible in the ops console.
        registerDevice(id).catch(() => null);

        // Hydrate premium + first-AI-free state, keyed by deviceId.
        await hydrateSession(id).catch(() => null);
      } catch {
        setSubscription(null);
        setFirstAiFreeAvailable(false);
      } finally {
        setReady(true);
      }
    }
    bootstrap();
  }, [hydrateSession, invalidateCache]);

  const ensureDeviceIdentity = useCallback(() => {
    if (deviceId) return deviceId;
    const id = getDeviceId();
    setDeviceId(id);
    return id;
  }, [deviceId]);

  const value = useMemo(() => ({
    ready,
    deviceId,
    // Stable nulls so any remaining anonymous code paths keep working. There is
    // no account or token anymore.
    token: null,
    user: null,
    subscription,
    firstAiFreeAvailable,
    isPremium: isPremiumStatus(subscription?.status),
    invalidateCache,
    ensureDeviceIdentity,

    async refreshSubscription() {
      const id = ensureDeviceIdentity();
      try {
        return await hydrateSession(id);
      } catch {
        return null;
      }
    },

    async saveMoment(payload) {
      ensureDeviceIdentity();
      invalidateCache();
      const result = await logMomentApi(payload, payload?.lang);
      invalidateCache("weeklyReport");
      return result;
    },

    async loadTimeline() {
      ensureDeviceIdentity();
      const cached = getCached("timeline");
      if (cached) return cached;
      const response = await fetchTimelineApi();
      const moments = response.moments || [];
      setCache("timeline", moments);
      return moments;
    },

    async loadWeeklyReport(lang) {
      ensureDeviceIdentity();
      const cached = getCached("weeklyReport");
      if (cached) return cached;
      const response = await fetchWeeklyReportApi(lang);
      const report = response.report || null;
      setCache("weeklyReport", report);
      return report;
    },

    async loadProgress() {
      ensureDeviceIdentity();
      const response = await fetchProgressApi();
      return response.progress || null;
    },

    async loadModes(lang) {
      ensureDeviceIdentity();
      return fetchModesApi(lang);
    },

    async loadModeOutput(mode, lang) {
      ensureDeviceIdentity();
      return fetchModeOutputApi(mode, lang);
    },

    async sendActionFeedback(actionId, response) {
      return submitActionFeedbackApi(actionId, response);
    },

    async sendModeFeedback(mode, itemId, response, source) {
      return submitModeFeedbackApi(mode, itemId, response, source);
    },

    async loadModeProfile() {
      ensureDeviceIdentity();
      return fetchModeProfileApi();
    },

    async saveModeProfile(profile) {
      ensureDeviceIdentity();
      return updateModeProfileApi(profile);
    },

    async regenerateModes(opts) {
      ensureDeviceIdentity();
      return regeneratePremiumApi(opts);
    },

    async shareWeek() {
      ensureDeviceIdentity();
      return createShareSnapshotApi();
    },

    async updateMoment(momentId, updates) {
      invalidateCache();
      const response = await editMomentApi(momentId, updates);
      return response?.moment || { id: momentId, ...updates };
    },

    async removeMoment(momentId) {
      invalidateCache();
      return deleteMomentApi(momentId);
    },

    async exportLogs() {
      ensureDeviceIdentity();
      const data = await fetchExport();
      const blob = new Blob(
        [typeof data === "string" ? data : JSON.stringify(data, null, 2)],
        { type: "application/json" }
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "triggermap-export.json";
      a.click();
      URL.revokeObjectURL(url);
    },

    async deleteAllUserData() {
      ensureDeviceIdentity();
      await deleteAllDataApi().catch(() => null);
      setSubscription(null);
      setFirstAiFreeAvailable(false);
      invalidateCache();
    },
  }), [ready, deviceId, subscription, firstAiFreeAvailable, hydrateSession, ensureDeviceIdentity, invalidateCache]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error("useSession must be used within SessionProvider");
  return context;
}
