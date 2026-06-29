// Web API client — device-ID identity (no sign-in).
//
// Mirrors mobile/services/api.js: every owner-scoped request is keyed by a
// persistent deviceId (query param on GET, body field on writes). The backend
// resolves ownerId = token?.id || deviceId, so web never needs a session token.
// The only token we ever touch is a *legacy* one left over from the removed
// sign-in build, read exactly once during one-time data recovery.

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000").replace(/\/$/, "");
const DEFAULT_TIMEOUT_MS = 8000;
const SCREEN_TIMEOUT_MS = 10000;

const DEVICE_ID_KEY = "triggermap.web.deviceId";
const LEGACY_TOKEN_KEY = "triggermap.web.token";

// ── Identity ──────────────────────────────────────────────────────────────

export function getDeviceId() {
  if (typeof window === "undefined") return "";
  const existing = window.localStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;
  const created = window.crypto?.randomUUID?.() || `web-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  window.localStorage.setItem(DEVICE_ID_KEY, created);
  return created;
}

// Leftover account token from the pre-device-id (signed-in) web build. We only
// read it once for recovery, then clear it — we never write it anymore.
export function getLegacyToken() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(LEGACY_TOKEN_KEY) || null;
}

export function clearLegacyToken() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(LEGACY_TOKEN_KEY);
}

// ── Request core (timeout + in-flight GET dedup) ────────────────────────────

const inflight = new Map();

function createTimeoutSignal(timeoutMs) {
  if (typeof AbortController === "undefined") {
    return { signal: undefined, cleanup: () => {} };
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  return { signal: controller.signal, cleanup: () => clearTimeout(timeoutId) };
}

async function _request(path, options = {}) {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, headers, token, ...rest } = options;
  const { signal, cleanup } = createTimeoutSignal(timeoutMs);

  try {
    const response = await fetch(`${API_BASE_URL}/api${path}`, {
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      signal,
      ...rest,
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.error?.message || "Request failed");
    }
    if (!payload) {
      throw new Error("Request failed");
    }
    return payload.data !== undefined ? payload.data : payload;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("Request timed out. Please try again.");
    }
    if (error?.message === "Failed to fetch" || error?.message === "Load failed") {
      console.error("TriggerMap API unreachable:", `${API_BASE_URL}/api${path}`, error.message);
      throw new Error("Unable to reach the server. Please try again.");
    }
    throw new Error(error?.message || "Request failed");
  } finally {
    cleanup();
  }
}

function request(path, options = {}) {
  const method = options.method || "GET";
  const dedup = method === "GET" || (method === "POST" && path.startsWith("/logMoment"));
  if (!dedup) return _request(path, options);

  const key = `${method}:${path}:${options.token || ""}`;
  const pending = inflight.get(key);
  if (pending) return pending;

  const promise = _request(path, options);
  inflight.set(key, promise);
  promise.finally(() => inflight.delete(key));
  return promise;
}

// Append deviceId (+ optional extras) to a GET query string.
function deviceQuery(extra = {}) {
  const params = new URLSearchParams();
  params.set("deviceId", getDeviceId());
  for (const [k, v] of Object.entries(extra)) {
    if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
  }
  return `?${params.toString()}`;
}

// ── Moments ─────────────────────────────────────────────────────────────────

export function logMoment(payload, lang) {
  return request("/logMoment", {
    method: "POST",
    body: JSON.stringify({
      ...payload,
      deviceId: getDeviceId(),
      lang,
      timestamp: payload?.timestamp || new Date().toISOString(),
    }),
  });
}

export function editMomentApi(momentId, payload) {
  return request(`/moment/${encodeURIComponent(momentId)}`, {
    method: "PUT",
    body: JSON.stringify({ ...payload, deviceId: getDeviceId() }),
  });
}

export function deleteMomentApi(momentId) {
  return request(`/moment/${encodeURIComponent(momentId)}${deviceQuery()}`, { method: "DELETE" });
}

export function fetchTimeline() {
  return request(`/timeline${deviceQuery({ _t: Date.now() })}`, { timeoutMs: SCREEN_TIMEOUT_MS });
}

export function fetchWeeklyReport(lang) {
  return request(`/weeklyReport${deviceQuery({ lang })}`, { timeoutMs: SCREEN_TIMEOUT_MS });
}

export function fetchProgress() {
  return request(`/progress${deviceQuery()}`, { timeoutMs: SCREEN_TIMEOUT_MS });
}

// ── Identity / session ───────────────────────────────────────────────────────

export function fetchMe() {
  return request(`/me${deviceQuery()}`);
}

// One-time recovery of stranded account data for previously-signed-in web
// devices. The backend derives the account from the legacy token (if present)
// or an existing device→account link; we never send a userId.
export function recover(deviceId, legacyToken) {
  return request("/recover", {
    method: "POST",
    body: JSON.stringify({ deviceId }),
    ...(legacyToken ? { token: legacyToken } : {}),
  });
}

export function registerDevice(deviceId) {
  return request("/register-device", {
    method: "POST",
    body: JSON.stringify({ deviceId: deviceId || getDeviceId() }),
  });
}

// ── Data / export ────────────────────────────────────────────────────────────

export function fetchExport() {
  return request(`/export${deviceQuery()}`);
}

export function deleteAllDataApi() {
  return request(`/deleteData${deviceQuery()}`, { method: "DELETE" });
}

export function fetchHealth() {
  return request("/health", { timeoutMs: 3000 });
}

// ── Sharing ────────────────────────────────────────────────────────────────

export function createShareSnapshot() {
  return request("/share", { method: "POST", body: JSON.stringify({ deviceId: getDeviceId() }) });
}

export function fetchShareSnapshot(shareToken) {
  return request(`/share?token=${encodeURIComponent(shareToken)}`);
}

// ── Notifications / Web Push ──────────────────────────────────────────────────

export function registerPushToken({ token, platform = "web" }) {
  return request("/push-token", {
    method: "POST",
    body: JSON.stringify({ action: "register", deviceId: getDeviceId(), token, platform }),
  });
}

export function unregisterPushToken() {
  return request("/push-token", {
    method: "POST",
    body: JSON.stringify({ action: "unregister", deviceId: getDeviceId() }),
  });
}

export function saveNotificationPrefs({ daily, weekly, nudge }) {
  return request("/notification-prefs", {
    method: "POST",
    body: JSON.stringify({ daily, weekly, nudge, deviceId: getDeviceId() }),
  });
}

export function getNotificationPrefs() {
  return request(`/notification-prefs${deviceQuery()}`);
}

// ── Actions feedback ──────────────────────────────────────────────────────────

// NOTE: posts to /api/actions (the actionFeedback endpoint never existed).
export function submitActionFeedback(actionId, response) {
  return request(`/actions${deviceQuery()}`, {
    method: "POST",
    body: JSON.stringify({ actionId, response, deviceId: getDeviceId() }),
  });
}

// ── Adaptive modes (For You) ──────────────────────────────────────────────────

export function fetchModes(lang) {
  return request(`/modes${deviceQuery({ lang, _t: Date.now() })}`, { timeoutMs: SCREEN_TIMEOUT_MS });
}

export function fetchModeOutput(mode, lang) {
  return request(`/modes${deviceQuery({ mode, lang, _t: Date.now() })}`, { timeoutMs: SCREEN_TIMEOUT_MS });
}

export function submitModeFeedback(mode, itemId, response, source) {
  return request("/modes/feedback", {
    method: "POST",
    body: JSON.stringify({ mode, itemId, response, source, deviceId: getDeviceId() }),
  });
}

export function fetchModeProfile() {
  return request(`/modes/profile${deviceQuery()}`);
}

export function updateModeProfile(profile) {
  return request("/modes/profile", {
    method: "PUT",
    body: JSON.stringify({ ...profile, deviceId: getDeviceId() }),
  });
}

export function regeneratePremium({ lang, model, maxWords, style } = {}) {
  return request("/modes/regenerate", {
    method: "POST",
    body: JSON.stringify({ lang, model, maxWords, style, deviceId: getDeviceId() }),
    timeoutMs: 180000,
  });
}

// ── Subscription (verify only; web has no purchase flow) ──────────────────────

export function verifySubscription(payload) {
  return request("/subscription/verify", {
    method: "POST",
    body: JSON.stringify({ ...payload, deviceId: getDeviceId() }),
  });
}
