const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000").replace(/\/$/, "");
const DEFAULT_TIMEOUT_MS = 8000;

function createTimeoutSignal(timeoutMs) {
  if (typeof AbortController === "undefined") {
    return { signal: undefined, cleanup: () => {} };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timeoutId),
  };
}

export function getDeviceId() {
  if (typeof window === "undefined") return "";
  const existing = window.localStorage.getItem("triggermap.web.deviceId");
  if (existing) return existing;
  const created = window.crypto?.randomUUID?.() || `web-${Date.now()}`;
  window.localStorage.setItem("triggermap.web.deviceId", created);
  return created;
}

export function getStoredToken() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("triggermap.web.token") || null;
}

export function setStoredToken(token) {
  if (typeof window === "undefined") return;
  if (token) {
    window.localStorage.setItem("triggermap.web.token", token);
  } else {
    window.localStorage.removeItem("triggermap.web.token");
  }
}

async function request(path, options = {}) {
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
      console.error("QuietDen API unreachable:", `${API_BASE_URL}/api${path}`, error.message);
      throw new Error("Unable to reach the server. Please try again.");
    }

    throw new Error(error?.message || "Request failed");
  } finally {
    cleanup();
  }
}

export function fetchTimeline(token) {
  const query = token ? "" : `?deviceId=${encodeURIComponent(getDeviceId())}`;
  return request(`/timeline${query}`, { timeoutMs: 8000, token });
}

export function fetchWeeklyReport(token) {
  const query = token ? "" : `?deviceId=${encodeURIComponent(getDeviceId())}`;
  return request(`/weeklyReport${query}`, { timeoutMs: 8000, token });
}

export function logMoment(payload, token) {
  return request("/logMoment", {
    method: "POST",
    body: JSON.stringify({ ...payload, deviceId: getDeviceId(), timestamp: new Date().toISOString() }),
    token,
  });
}

export function loginApi(payload) {
  return request("/login", { method: "POST", body: JSON.stringify(payload) });
}

export function registerApi(payload) {
  return request("/register", { method: "POST", body: JSON.stringify(payload) });
}

export function fetchMe(token) {
  return request("/me", { token });
}

export function editMomentApi(momentId, payload, token) {
  return request(`/moment/${encodeURIComponent(momentId)}`, { method: "PUT", body: JSON.stringify(payload), token });
}

export function deleteMomentApi(momentId, token) {
  return request(`/moment/${encodeURIComponent(momentId)}`, { method: "DELETE", token });
}

export function fetchExport(token) {
  const query = token ? "" : `?deviceId=${encodeURIComponent(getDeviceId())}`;
  return request(`/export${query}`, { token });
}

export function deleteAllDataApi(token) {
  return request("/deleteData", { method: "DELETE", token });
}

export function fetchHealth() {
  return request("/health", { timeoutMs: 3000 });
}

export function fetchProgress(token) {
  const query = token ? "" : `?deviceId=${encodeURIComponent(getDeviceId())}`;
  return request(`/progress${query}`, { timeoutMs: 10000, token });
}

export function fetchModes(token) {
  return request("/modes", { timeoutMs: 10000, token });
}

export function submitActionFeedback(actionId, response, token) {
  return request("/actionFeedback", {
    method: "POST",
    body: JSON.stringify({ actionId, response, deviceId: getDeviceId() }),
    token,
  });
}