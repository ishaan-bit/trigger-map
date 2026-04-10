import Constants from "expo-constants";

const REQUEST_TIMEOUT_MS = 8000;
const SCREEN_REQUEST_TIMEOUT_MS = 8000;

// In-flight GET deduplication: collapse identical concurrent GETs into one request
const inflight = new Map();

function getConfiguredApiUrl() {
  const extra = Constants.expoConfig?.extra || {};
  const configuredUrl = process.env.EXPO_PUBLIC_API_URL || extra.apiUrl;

  if (!configuredUrl) {
    throw new Error("API URL is not configured");
  }

  return configuredUrl.replace(/\/$/, "");
}

const API_URL = (() => {
  try {
    return getConfiguredApiUrl();
  } catch {
    return undefined;
  }
})();

console.log("QuietDen API URL:", API_URL);
console.log("Loaded API URL:", process.env.EXPO_PUBLIC_API_URL);

function getBaseUrl() {
  const configuredUrl = getConfiguredApiUrl();
  return configuredUrl.endsWith("/api") ? configuredUrl : `${configuredUrl}/api`;
}

async function parseJson(response) {
  const payload = await response.text();

  if (!payload) {
    return {};
  }

  try {
    return JSON.parse(payload);
  } catch {
    throw new Error("API request failed");
  }
}

async function fetchJson(path, options = {}) {
  if (!API_URL) {
    throw new Error("API URL is not configured");
  }

  // Deduplicate concurrent identical requests (GET always, POST /logMoment)
  const method = options.method || "GET";
  const dedup = method === "GET" || (method === "POST" && path === "/logMoment");
  const dedupKey = dedup ? `${method}:${path}:${options.token || ""}` : null;

  if (dedup && dedupKey) {
    const pending = inflight.get(dedupKey);
    if (pending) return pending;
  }

  const promise = _fetchJson(path, options);

  if (dedup && dedupKey) {
    inflight.set(dedupKey, promise);
    promise.finally(() => inflight.delete(dedupKey));
  }

  return promise;
}

async function _fetchJson(path, options = {}) {
  const apiUrl = getBaseUrl();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || REQUEST_TIMEOUT_MS);
  let response;

  try {
    console.log("QuietDen request:", path, options.body || options.query || null);
    response = await fetch(`${apiUrl}${path}`, {
      headers: {
        "Content-Type": "application/json",
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      method: options.method || "GET",
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Request timed out. Check connection and try again.");
    }
    console.error("QuietDen API unreachable:", `${apiUrl}${path}`, error.message);
    throw new Error("Cannot reach the server. Please try again.");
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const error = await parseJson(response);
    throw new Error(error.error?.message || "API request failed");
  }

  const json = await parseJson(response);
  return json.data !== undefined ? json.data : json;
}

export function logMoment(payload, token, lang) {
  console.log("QuietDen request:", "/logMoment", payload);
  return fetchJson("/logMoment", { method: "POST", body: { ...payload, lang }, token });
}

export function editMoment(momentId, payload, token) {
  return fetchJson(`/moment/${encodeURIComponent(momentId)}`, { method: "PUT", body: payload, token });
}

export function deleteMomentApi(momentId, token) {
  return fetchJson(`/moment/${encodeURIComponent(momentId)}`, { method: "DELETE", token });
}

export function fetchTimeline(deviceId, token) {
  const t = Date.now();
  const query = token ? `?_t=${t}` : `?deviceId=${encodeURIComponent(deviceId)}&_t=${t}`;
  return fetchJson(`/timeline${query}`, { token, timeoutMs: SCREEN_REQUEST_TIMEOUT_MS });
}

export function fetchWeeklyReport(deviceId, token, lang) {
  const params = [];
  if (!token) params.push(`deviceId=${encodeURIComponent(deviceId)}`);
  if (lang) params.push(`lang=${encodeURIComponent(lang)}`);
  const query = params.length ? `?${params.join("&")}` : "";
  return fetchJson(`/weeklyReport${query}`, { token, timeoutMs: SCREEN_REQUEST_TIMEOUT_MS });
}

export function login(payload) {
  return fetchJson("/login", { method: "POST", body: payload });
}

export function register(payload) {
  return fetchJson("/register", { method: "POST", body: payload });
}

export function fetchMe(token) {
  return fetchJson("/me", { token });
}

export function verifySubscription(payload, token) {
  return fetchJson("/subscription/verify", { method: "POST", body: payload, token });
}

export async function downloadExport(deviceId, token) {
  const apiUrl = getBaseUrl();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const query = token ? "" : `?deviceId=${encodeURIComponent(deviceId)}`;
  let response;

  try {
    console.log("QuietDen request:", "/export", { deviceId });
    response = await fetch(`${apiUrl}/export${query}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      signal: controller.signal,
    });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Request timed out. Check connection and try again.");
    }
    console.error("QuietDen API unreachable:", `${apiUrl}/export`, error.message);
    throw new Error("Cannot reach the server. Please try again.");
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error("Unable to export logs");
  }

  return response.text();
}

export function fetchHealth() {
  return fetchJson("/health", { timeoutMs: 4000 });
}

export function deleteAllData(token) {
  return fetchJson("/deleteData", { method: "DELETE", token });
}

export function getApiOrigin() {
  if (!API_URL) {
    throw new Error("API URL is not configured");
  }

  return getConfiguredApiUrl().replace(/\/api\/?$/, "");
}

export function getWebBaseUrl() {
  if (process.env.EXPO_PUBLIC_WEB_BASE_URL) {
    return process.env.EXPO_PUBLIC_WEB_BASE_URL;
  }

  return getApiOrigin();
}

export function registerPushToken({ deviceId, token, platform }, authToken) {
  return fetchJson("/push-token", {
    method: "POST",
    body: { action: "register", deviceId, token, platform },
    token: authToken,
  });
}

export function unregisterPushToken({ deviceId }, authToken) {
  return fetchJson("/push-token", {
    method: "POST",
    body: { action: "unregister", deviceId },
    token: authToken,
  });
}

export function saveNotificationPrefs({ daily, weekly, nudge }, authToken) {
  return fetchJson("/notification-prefs", {
    method: "POST",
    body: { daily, weekly, nudge },
    token: authToken,
  });
}

export function getNotificationPrefs(authToken) {
  return fetchJson("/notification-prefs", { token: authToken });
}

export function submitActionFeedback(actionId, response, deviceId, token) {
  const params = deviceId ? `?deviceId=${encodeURIComponent(deviceId)}` : "";
  return fetchJson(`/actions${params}`, {
    method: "POST",
    body: { actionId, response, deviceId },
    token,
  });
}

// ── Progress & Drift Intelligence ──

export function fetchProgress(token, deviceId) {
  const params = deviceId ? `?deviceId=${encodeURIComponent(deviceId)}` : "";
  return fetchJson(`/progress${params}`, { token, timeoutMs: SCREEN_REQUEST_TIMEOUT_MS });
}

// ── Adaptive Modes ──

export function fetchModes(token) {
  return fetchJson("/modes", { token, timeoutMs: SCREEN_REQUEST_TIMEOUT_MS });
}

export function fetchModeOutput(mode, token) {
  return fetchJson(`/modes?mode=${encodeURIComponent(mode)}`, { token, timeoutMs: SCREEN_REQUEST_TIMEOUT_MS });
}

export function submitModeFeedback(mode, itemId, response, token) {
  return fetchJson("/modes/feedback", {
    method: "POST",
    body: { mode, itemId, response },
    token,
  });
}

export function fetchModeProfile(token) {
  return fetchJson("/modes/profile", { token });
}

export function updateModeProfile(profile, token) {
  return fetchJson("/modes/profile", {
    method: "PUT",
    body: profile,
    token,
  });
}

export function regeneratePremium({ lang, model, maxWords, style } = {}, token) {
  return fetchJson("/modes/regenerate", {
    method: "POST",
    body: { lang, model, maxWords, style },
    token,
    timeoutMs: 180_000,
  });
}