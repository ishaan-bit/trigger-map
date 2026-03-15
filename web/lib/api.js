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

function getDeviceId() {
  if (typeof window === "undefined") {
    return "";
  }

  const existing = window.localStorage.getItem("triggermap.web.deviceId");
  if (existing) {
    return existing;
  }

  const created = window.crypto?.randomUUID?.() || `web-${Date.now()}`;
  window.localStorage.setItem("triggermap.web.deviceId", created);
  return created;
}

async function request(path, options = {}) {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, headers, ...rest } = options;
  const { signal, cleanup } = createTimeoutSignal(timeoutMs);

  try {
    const response = await fetch(`${API_BASE_URL}/api${path}`, {
      headers: {
        "Content-Type": "application/json",
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
      throw new Error("TriggerMap cannot reach the server. Please try again.");
    }

    throw new Error(error?.message || "Request failed");
  } finally {
    cleanup();
  }
}

export function fetchTimeline() {
  return request(`/timeline?deviceId=${encodeURIComponent(getDeviceId())}`, { timeoutMs: 3000 });
}

export function fetchWeeklyReport() {
  return request(`/weeklyReport?deviceId=${encodeURIComponent(getDeviceId())}`, { timeoutMs: 3000 });
}

export function logMoment(payload) {
  return request("/logMoment", {
    method: "POST",
    body: JSON.stringify({ ...payload, deviceId: getDeviceId(), timestamp: new Date().toISOString() }),
  });
}

export function fetchHealth() {
  return request("/health", { timeoutMs: 3000 });
}