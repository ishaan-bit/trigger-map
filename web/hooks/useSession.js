import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  fetchMe,
  fetchTimeline as fetchTimelineApi,
  fetchWeeklyReport as fetchWeeklyReportApi,
  fetchProgress as fetchProgressApi,
  fetchModes as fetchModesApi,
  submitActionFeedback as submitActionFeedbackApi,
  logMoment as logMomentApi,
  loginApi,
  registerApi,
  editMomentApi,
  deleteMomentApi,
  fetchExport,
  deleteAllDataApi,
  getDeviceId,
  getStoredToken,
  setStoredToken,
} from "../lib/api";

const SessionContext = createContext(null);

export function SessionProvider({ children }) {
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [subscription, setSubscription] = useState(null);

  useEffect(() => {
    async function bootstrap() {
      try {
        const storedToken = getStoredToken();
        if (storedToken) {
          const session = await fetchMe(storedToken);
          setToken(storedToken);
          setUser(session.user);
          setSubscription(session.subscription || null);
        }
      } catch {
        setStoredToken(null);
        setToken(null);
        setUser(null);
        setSubscription(null);
      } finally {
        setReady(true);
      }
    }
    bootstrap();
  }, []);

  const refreshSession = useCallback(async () => {
    if (!token) return null;
    const session = await fetchMe(token);
    setUser(session.user);
    setSubscription(session.subscription || null);
    return session;
  }, [token]);

  const value = useMemo(() => ({
    ready,
    token,
    user,
    subscription,
    isSignedIn: Boolean(user && token),
    isPremium: subscription?.status === "active" || subscription?.status === "grace_period",

    async signInWithEmail(email, password) {
      const deviceId = getDeviceId();
      const response = await loginApi({ provider: "email", email, password, deviceId });
      setStoredToken(response.token);
      setToken(response.token);
      setUser(response.user);
    },

    async registerWithEmail(name, email, password) {
      const deviceId = getDeviceId();
      const response = await registerApi({ name, email, password, deviceId });
      setStoredToken(response.token);
      setToken(response.token);
      setUser(response.user);
    },

    async signInWithGoogle(idToken) {
      const deviceId = getDeviceId();
      const response = await loginApi({ provider: "google", idToken, deviceId });
      setStoredToken(response.token);
      setToken(response.token);
      setUser(response.user);
    },

    async signOut() {
      setStoredToken(null);
      setToken(null);
      setUser(null);
      setSubscription(null);
    },

    refreshSession,

    async saveMoment(payload) {
      return logMomentApi(payload, token);
    },

    async loadTimeline() {
      const response = await fetchTimelineApi(token);
      return response.moments || [];
    },

    async loadWeeklyReport() {
      const response = await fetchWeeklyReportApi(token);
      return response.report || null;
    },

    async loadProgress() {
      const response = await fetchProgressApi(token);
      return response.progress || null;
    },

    async loadModes() {
      return fetchModesApi(token);
    },

    async sendActionFeedback(actionId, response) {
      return submitActionFeedbackApi(actionId, response, token);
    },

    async updateMoment(momentId, updates) {
      return editMomentApi(momentId, updates, token);
    },

    async removeMoment(momentId) {
      return deleteMomentApi(momentId, token);
    },

    async exportLogs() {
      const data = await fetchExport(token);
      const blob = new Blob([typeof data === "string" ? data : JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "triggermap-export.json";
      a.click();
      URL.revokeObjectURL(url);
    },

    async deleteAllUserData() {
      if (token) {
        await deleteAllDataApi(token);
        setStoredToken(null);
        setToken(null);
        setUser(null);
        setSubscription(null);
      }
    },
  }), [ready, token, user, subscription, refreshSession]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error("useSession must be used within SessionProvider");
  return context;
}
